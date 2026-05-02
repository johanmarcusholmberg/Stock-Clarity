import { Router } from "express";
import { timingSafeEqual } from "crypto";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { computeEffectiveTier } from "../lib/tierService";

// RevenueCat webhook receiver.
//
// Mounted at /api/webhooks/revenuecat (see routes/index.ts). RevenueCat
// sends a single auth header (the value you configure in their dashboard)
// rather than HMAC-signing the body, so we compare the header in constant
// time and rely on the JSON body parser already running upstream.
//
// State model:
//   * RevenueCat is the source of truth; every event carries the full
//     current entitlement state, not a diff. We always overwrite.
//   * Idempotency: same event id → no-op. Out-of-order delivery
//     (event_timestamp_ms < last applied) → no-op.
//   * `users.iap_tier` + `users.iap_expires_at` feed `computeEffectiveTier`,
//     which is the single source of truth for "what tier is this user on?"
//   * After every applied event we re-derive the effective tier and
//     project it to `users.tier` so the cached column readers (AI quota
//     gates, export gates) don't lag behind.

const router = Router();

interface RcEventPayload {
  api_version?: string;
  event?: {
    id?: string;
    type?: string;
    event_timestamp_ms?: number;
    app_user_id?: string;
    original_transaction_id?: string | null;
    product_id?: string | null;
    expiration_at_ms?: number | null;
    environment?: "PRODUCTION" | "SANDBOX";
    store?:
      | "APP_STORE"
      | "MAC_APP_STORE"
      | "PLAY_STORE"
      | "AMAZON"
      | "STRIPE"
      | "PROMOTIONAL";
  };
}

function timingSafeStrEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch; short-circuit explicitly so
  // the failure path is still constant-time-ish (one length compare + one
  // buffer alloc).
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// Map a RevenueCat product_id to our internal tier. Ships with a
// substring-based default that matches our launch convention
// (`pro_monthly`, `premium_monthly`); deployments can pin an exact map
// via `IAP_PRODUCT_TIER_MAP` env var, e.g.:
//
//   IAP_PRODUCT_TIER_MAP='{"pro_monthly":"pro","pro_yearly":"pro",
//                          "premium_monthly":"premium","premium_yearly":"premium"}'
//
// The substring fallback also handles "premium" before "pro" so a product
// like `pro_to_premium_upgrade` doesn't get misclassified.
function productIdToTier(
  productId: string | null | undefined,
): "pro" | "premium" | null {
  if (!productId) return null;
  const overrides = process.env.IAP_PRODUCT_TIER_MAP;
  if (overrides) {
    try {
      const map = JSON.parse(overrides) as Record<string, string>;
      const t = map[productId];
      if (t === "pro" || t === "premium") return t;
    } catch {
      // Bad JSON in env — fall through to substring match. Logged once
      // per request; spammy but unavoidable until we cache the parse.
      logger.warn({ overrides }, "revenuecat.webhook: IAP_PRODUCT_TIER_MAP is not valid JSON");
    }
  }
  const id = productId.toLowerCase();
  if (id.includes("premium")) return "premium";
  if (id.includes("pro")) return "pro";
  return null;
}

function storeToSource(store: string | undefined | null): "apple" | "google" {
  return store === "PLAY_STORE" ? "google" : "apple";
}

router.post("/", async (req, res) => {
  // ── Auth ─────────────────────────────────────────────────────────────
  const expected = process.env.REVENUECAT_WEBHOOK_AUTH_HEADER;
  if (!expected) {
    // Refuse to accept events when the secret isn't set — better to fail
    // closed and surface the misconfiguration in RC's dashboard than to
    // silently apply unverified state changes to user subscriptions.
    logger.warn(
      "revenuecat.webhook: REVENUECAT_WEBHOOK_AUTH_HEADER is not set — rejecting all events",
    );
    return void res.status(503).json({ error: "Webhook not configured" });
  }
  const presented = req.headers.authorization ?? "";
  // RevenueCat sends the literal value you put in their dashboard. Some
  // operators paste a `Bearer …` token; we accept either form so the
  // dashboard config doesn't have to be exact.
  const ok =
    timingSafeStrEqual(presented, expected) ||
    timingSafeStrEqual(presented, `Bearer ${expected}`);
  if (!ok) {
    logger.warn({ ip: req.ip }, "revenuecat.webhook: auth rejected");
    return void res.status(401).json({ error: "Unauthorized" });
  }

  // ── Parse ────────────────────────────────────────────────────────────
  const payload = req.body as RcEventPayload | undefined;
  const ev = payload?.event;
  if (!ev?.id || !ev?.type || !ev?.app_user_id) {
    logger.warn({ payload }, "revenuecat.webhook: malformed payload");
    return void res.status(400).json({ error: "Malformed payload" });
  }
  req.log.info(
    {
      rcEventId: ev.id,
      rcEventType: ev.type,
      rcAppUserId: ev.app_user_id,
      rcStore: ev.store,
      rcEnvironment: ev.environment,
    },
    "revenuecat.webhook.received",
  );

  // Ignore events from stores we don't actually sell through. RevenueCat
  // can be configured with a Stripe app too — that's handled by our own
  // /api/stripe/webhook, not here. Anything else (Amazon, promotional)
  // we don't carry today.
  if (
    ev.store &&
    ev.store !== "APP_STORE" &&
    ev.store !== "MAC_APP_STORE" &&
    ev.store !== "PLAY_STORE"
  ) {
    req.log.info(
      { rcEventId: ev.id, rcStore: ev.store },
      "revenuecat.webhook: ignored non-IAP store",
    );
    return void res.status(200).json({ ok: true, ignored: "non_iap_store" });
  }

  const user = await storage.getUserByClerkId(ev.app_user_id);
  if (!user) {
    // Unknown user — sandbox tester who never logged in to our backend,
    // or a race where the mobile app hasn't yet upserted them. 200 so
    // RevenueCat doesn't queue retries forever; the next event for this
    // user (RENEWAL etc) will catch up after they log in.
    req.log.warn(
      { rcEventId: ev.id, rcAppUserId: ev.app_user_id },
      "revenuecat.webhook: unknown user",
    );
    return void res.status(200).json({ ok: true, ignored: "unknown_user" });
  }

  // ── Idempotency / ordering ───────────────────────────────────────────
  if (user.iap_last_event_id && user.iap_last_event_id === ev.id) {
    req.log.info({ rcEventId: ev.id }, "revenuecat.webhook: dedup (same id)");
    return void res.status(200).json({ ok: true, dedup: true });
  }
  const incomingMs = ev.event_timestamp_ms ?? Date.now();
  const lastMs =
    user.iap_last_event_at instanceof Date
      ? user.iap_last_event_at.getTime()
      : user.iap_last_event_at
        ? new Date(user.iap_last_event_at).getTime()
        : 0;
  if (lastMs && incomingMs < lastMs) {
    req.log.warn(
      { rcEventId: ev.id, incomingMs, lastMs },
      "revenuecat.webhook: out-of-order delivery, ignored",
    );
    return void res.status(200).json({ ok: true, ignored: "out_of_order" });
  }

  // ── Apply ────────────────────────────────────────────────────────────
  const iapTier = productIdToTier(ev.product_id);
  const iapSource = storeToSource(ev.store);
  const iapExpiresAt =
    typeof ev.expiration_at_ms === "number" && Number.isFinite(ev.expiration_at_ms)
      ? new Date(ev.expiration_at_ms)
      : null;
  const iapEnvironment: "production" | "sandbox" =
    ev.environment === "PRODUCTION" ? "production" : "sandbox";

  await storage.updateUserIap(ev.app_user_id, {
    iapSource,
    iapTier,
    iapProductId: ev.product_id ?? null,
    iapExpiresAt,
    iapEnvironment,
    iapOriginalTransactionId: ev.original_transaction_id ?? null,
    iapLastEventId: ev.id,
    iapLastEventAt: new Date(incomingMs),
  });

  // Re-derive and project effective tier so cached-column readers
  // (users.tier) don't lag behind the IAP state we just wrote.
  const effective = await computeEffectiveTier(ev.app_user_id);
  if (effective.tier !== (user.tier ?? "free")) {
    await storage.updateUserTier(ev.app_user_id, effective.tier);
  }

  req.log.info(
    {
      rcEventId: ev.id,
      rcEventType: ev.type,
      appliedTier: iapTier,
      expiresAt: iapExpiresAt?.toISOString() ?? null,
      effectiveTier: effective.tier,
      effectiveSource: effective.source,
    },
    "revenuecat.webhook.applied",
  );

  res.status(200).json({ ok: true });
});

export default router;
