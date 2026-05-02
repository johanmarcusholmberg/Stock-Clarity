import { execute, queryOne } from "../db";
import { storage } from "../storage";
import { adminSchemaReady } from "./adminSchema";
import { logger } from "./logger";

// TEMPORARY — Phase 3.2 PR 1 sanity check. Remove once the system has been
// verified in staging. Gated on TIER_DEBUG=true to avoid log spam.
function tierDebug(): boolean {
  return (process.env.TIER_DEBUG ?? "").toLowerCase() === "true";
}

export type Tier = "free" | "pro" | "premium";

// What fed the current tier. Admin grants come out on top; Stripe is the
// baseline paying-customer case; IAP is the future integration; 'none' is
// the free-tier default.
export type EffectiveTierSource = "admin_grant" | "stripe" | "apple_iap" | "google_play" | "none";

export interface EffectiveTier {
  tier: Tier;
  source: EffectiveTierSource;
  // Grant expires_at when source='admin_grant'; Stripe current_period_end when
  // source='stripe'; undefined otherwise.
  expiresAt?: Date;
  // Populated when source='admin_grant', so downstream callers can revoke the
  // exact grant or display it in the admin UI without a re-read.
  grantId?: string;
}

// Integer rank used to compare tiers — higher wins.
const TIER_RANK: Record<Tier, number> = { free: 0, pro: 1, premium: 2 };

// Single source of truth for "what tier is this user on, right now, and why?"
//
// Priority order (first non-free source wins — admin overrides always beat
// Stripe):
//   1. Active admin_grant — highest tier wins; ties broken by soonest expiry
//   2. Active Stripe subscription
//   3. IAP — stub, not populated until IAP integration lands
//   4. 'free'
//
// Grants STACK on Stripe: a user with both an active Stripe Pro sub AND an
// active Premium grant gets Premium while the grant is live and drops back
// to Stripe Pro (not Free) when it expires. This is the behaviour the
// design doc explicitly calls out — the alternative ("grant replaces sub")
// would silently demote paying customers on expiry.
export async function computeEffectiveTier(userId: string): Promise<EffectiveTier> {
  await adminSchemaReady;

  const user = await storage.getUserByClerkId(userId);
  if (!user) return { tier: "free", source: "none" };

  // Step 1 — resolve the base tier from external subscription sources.
  let baseTier: Tier = "free";
  let baseSource: EffectiveTierSource = "none";
  let baseExpiresAt: Date | undefined;

  if (user.stripe_customer_id) {
    const stripeTier = await storage.getTierFromSubscription(user.stripe_customer_id);
    if (stripeTier !== "free") {
      baseTier = stripeTier;
      baseSource = "stripe";
      const sub = await storage.getSubscriptionByCustomerId(user.stripe_customer_id);
      const periodEnd = (sub as any)?.current_period_end;
      // Stripe stores period_end as seconds-since-epoch. pg returns integer
      // columns as number and bigint as string — normalise both.
      if (typeof periodEnd === "number" && Number.isFinite(periodEnd)) {
        baseExpiresAt = new Date(periodEnd * 1000);
      } else if (typeof periodEnd === "string" && periodEnd !== "") {
        const n = Number(periodEnd);
        if (Number.isFinite(n)) baseExpiresAt = new Date(n * 1000);
      } else if (periodEnd instanceof Date) {
        baseExpiresAt = periodEnd;
      }
    }
  }

  // Step 2 — IAP. Active when iap_tier is set AND iap_expires_at hasn't
  // passed yet. RevenueCat sets iap_expires_at to a past timestamp on
  // EXPIRATION events (so this check naturally drops the user back to
  // baseTier without us needing to NULL the column). For CANCELLATION
  // events RevenueCat keeps iap_expires_at in the future — Apple/Google
  // policy is the user keeps access until period end.
  //
  // Both Stripe AND IAP active is rare but legitimate (e.g. user paid on
  // web, then bought again on mobile). Higher tier wins; ties favour
  // whichever one is already baseTier (Stripe — kept for ordering
  // stability; the user is double-paying which they should resolve in
  // the manage-subscription UI).
  if (user.iap_tier && user.iap_expires_at) {
    const exp = user.iap_expires_at instanceof Date
      ? user.iap_expires_at
      : new Date(user.iap_expires_at);
    if (
      exp.getTime() > Date.now() &&
      (user.iap_tier === "pro" || user.iap_tier === "premium")
    ) {
      const iapTier = user.iap_tier as Tier;
      if (TIER_RANK[iapTier] > TIER_RANK[baseTier]) {
        baseTier = iapTier;
        baseSource = user.iap_source === "google" ? "google_play" : "apple_iap";
        baseExpiresAt = exp;
      }
    }
  }

  // Step 3 — admin grants can override the base. We pick the highest-tier
  // active grant; ties broken by soonest expiry so a grant about to run
  // out is surfaced first (useful for banners/warnings downstream).
  const grant = await queryOne<{
    id: string;
    tier: Tier;
    expires_at: Date | string;
  }>(
    `SELECT id, tier, expires_at
       FROM admin_grants
      WHERE user_id = $1
        AND status = 'active'
        AND expires_at > NOW()
      ORDER BY
        CASE tier WHEN 'premium' THEN 2 WHEN 'pro' THEN 1 ELSE 0 END DESC,
        expires_at ASC
      LIMIT 1`,
    [userId],
  );

  if (grant && TIER_RANK[grant.tier] > TIER_RANK[baseTier]) {
    const exp = grant.expires_at instanceof Date ? grant.expires_at : new Date(grant.expires_at);
    const result: EffectiveTier = { tier: grant.tier, source: "admin_grant", expiresAt: exp, grantId: grant.id };
    if (tierDebug()) {
      logger.info(
        {
          userId,
          stripeCustomerId: user.stripe_customer_id ?? null,
          baseTier,
          baseSource,
          grantTier: grant.tier,
          grantId: grant.id,
          tier: result.tier,
          source: result.source,
        },
        "[tier-debug] grant beats base",
      );
    }
    return result;
  }

  const result: EffectiveTier = { tier: baseTier, source: baseSource, expiresAt: baseExpiresAt };
  if (tierDebug()) {
    logger.info(
      {
        userId,
        stripeCustomerId: user.stripe_customer_id ?? null,
        baseTier,
        baseSource,
        grantChecked: !!grant,
        grantTier: grant?.tier ?? null,
        tier: result.tier,
        source: result.source,
      },
      "[tier-debug] base wins (no beating grant)",
    );
  }
  return result;
}

// Classifies *where* a user's current subscription lives. Distinct from
// EffectiveTierSource (which answers "what tier?") — this answers "which
// backend would I call to mutate it?". Used by the IAP stub endpoints to
// enrich audit metadata and by the mobile admin UI (PR 5) to pick the right
// endpoint.
export type SubscriptionSource =
  | "stripe"
  | "apple_iap"
  | "google_play"
  | "manual"
  | "none";

export interface ResolvedSubscriptionSource {
  source: SubscriptionSource;
  stripeCustomerId: string | null;
  // Raw users.iap_source — 'apple' | 'google' | null. Kept separate from
  // `source` so audit rows can distinguish "column is set but we classified
  // as stripe because Stripe takes priority" from "column is null".
  iapSource: string | null;
  iapOriginalTransactionId: string | null;
}

// Priority mirrors design doc §4 — admin never picks the source, the helper
// does. Grant-only users fall into 'manual'; no-sub-no-grant into 'none'.
// Today iap_source is always null (no IAP ingest wired yet); the branches
// exist so IAP integration is a data-only change later.
export async function resolveSubscriptionSource(
  userId: string,
): Promise<ResolvedSubscriptionSource> {
  await adminSchemaReady;
  const user = await storage.getUserByClerkId(userId);
  const stripeCustomerId: string | null = user?.stripe_customer_id ?? null;
  const iapSource: string | null = user?.iap_source ?? null;
  const iapOriginalTransactionId: string | null =
    user?.iap_original_transaction_id ?? null;

  if (!user) {
    return {
      source: "none",
      stripeCustomerId: null,
      iapSource: null,
      iapOriginalTransactionId: null,
    };
  }

  // 1. Stripe — authoritative when an active/trialing sub exists. Using
  // getSubscriptionByCustomerId (not getTierFromSubscription) because a sub
  // without tier metadata is still a Stripe-sourced user.
  if (stripeCustomerId) {
    const sub = await storage.getSubscriptionByCustomerId(stripeCustomerId);
    if (sub) {
      return { source: "stripe", stripeCustomerId, iapSource, iapOriginalTransactionId };
    }
  }

  // 2. IAP — placeholder branches, no-op today.
  if (iapSource === "apple") {
    return { source: "apple_iap", stripeCustomerId, iapSource, iapOriginalTransactionId };
  }
  if (iapSource === "google") {
    return { source: "google_play", stripeCustomerId, iapSource, iapOriginalTransactionId };
  }

  // 3. Grant-only — user has no external sub but an active admin grant.
  const grant = await queryOne<{ id: string }>(
    `SELECT id FROM admin_grants
      WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
      LIMIT 1`,
    [userId],
  );
  if (grant) {
    return { source: "manual", stripeCustomerId, iapSource, iapOriginalTransactionId };
  }

  return { source: "none", stripeCustomerId, iapSource, iapOriginalTransactionId };
}

export type AdminAuditAction =
  | "grant"
  | "revoke"
  | "extend"
  | "cancel"
  | "refund"
  | "tier_flip"
  | "expire";

export type AdminAuditSource = "stripe" | "apple_iap" | "google_play" | "manual";

export interface AuditEntry {
  adminEmail: string;
  userId: string;
  action: AdminAuditAction;
  source: AdminAuditSource;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
  metadata?: Record<string, unknown>;
}

// Append a row to admin_audit. Failures are logged but swallowed — a broken
// audit insert must not block the admin action itself. If the audit log is
// corrupt we'd rather know from metrics than from user-facing 500s.
export async function writeAdminAudit(entry: AuditEntry): Promise<void> {
  try {
    await adminSchemaReady;
    await execute(
      `INSERT INTO admin_audit (admin_email, user_id, action, source, previous_state, new_state, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        entry.adminEmail,
        entry.userId,
        entry.action,
        entry.source,
        entry.previousState !== undefined ? JSON.stringify(entry.previousState) : null,
        entry.newState !== undefined ? JSON.stringify(entry.newState) : null,
        entry.reason ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
      ],
    );
  } catch (err: any) {
    logger.warn({ err: err?.message }, "admin_audit insert failed");
  }
}
