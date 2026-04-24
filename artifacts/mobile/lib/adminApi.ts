// Typed fetch wrappers for the Phase 3.2 admin-subscription endpoints.
//
// Every call returns a discriminated Result<T> so dialogs can surface Stripe
// error codes, 501 IAP stubs, and 429 rate-limit hints without throwing.
// Server-side auth accepts requesterEmail via body/query/x-admin-email header,
// preferring body when present (see resolveAdminEmail in routes/admin.ts).

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

export type SubscriptionSource = "stripe" | "apple_iap" | "google_play" | "manual" | "none";
export type GrantStatus = "active" | "revoked" | "expired";
export type GrantTier = "pro" | "premium";
export type EffectiveTier = "free" | "pro" | "premium";

export interface GrantRow {
  id: string;
  user_id: string;
  tier: GrantTier;
  expires_at: string;
  reason: string;
  granted_by_admin: string;
  status: GrantStatus;
  revoked_at: string | null;
  created_at: string;
}

export interface AuditRow {
  id: string | number;
  admin_email: string;
  user_id: string;
  action: string;
  source: string;
  previous_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  reason: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface ResolvedSource {
  source: SubscriptionSource;
  stripeCustomerId: string | null;
  iapSource: string | null;
  iapOriginalTransactionId: string | null;
}

export interface EffectiveTierInfo {
  tier: EffectiveTier;
  source: string;
  grantId?: string | null;
  expiresAt?: string | null;
}

export interface OverviewUser {
  clerkUserId: string;
  email: string;
  tier: EffectiveTier | null;
  stripeCustomerId: string | null;
  createdAt: string;
}

export interface StripeSubSummary {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
}

export interface OverviewResponse {
  user: OverviewUser;
  effectiveTier: EffectiveTierInfo;
  resolvedSource: ResolvedSource;
  stripeSubscription: StripeSubSummary | null;
  activeGrants: GrantRow[];
}

export interface AuditResponse {
  audit: AuditRow[];
  total: number;
  limit: number;
  offset: number;
}

export interface CancelStripeResponse {
  success: true;
  mode: "immediate" | "period_end";
  subscriptionId: string;
  status: string;
  cancelAtPeriodEnd: boolean;
  cancelAt: string | null;
  effectiveTier: EffectiveTierInfo;
}

export interface RefundStripeResponse {
  success: true;
  refund: {
    id: string;
    amount: number;
    currency: string;
    status: string;
    chargeId: string;
    invoiceId: string;
  };
}

export interface GrantCreateResponse {
  success: true;
  grant: GrantRow;
  effectiveTier: EffectiveTierInfo;
}

export interface GrantExtendResponse {
  success: true;
  grant: GrantRow;
}

export interface GrantRevokeResponse {
  success: true;
  grantId: string;
  effectiveTier: EffectiveTierInfo;
}

export interface IapStubResponse {
  success: false;
  notImplemented: true;
  reason: string;
  platform: "apple" | "google";
  action: "cancel" | "refund";
}

export type Ok<T> = { ok: true; data: T };
export type Err = {
  ok: false;
  status: number;
  error: string;
  stripeCode?: string | null;
  retryAfterSec?: number;
  notImplementedReason?: string;
};
export type Result<T> = Ok<T> | Err;

export type IapPlatform = "apple" | "google";

interface Ctx {
  /** Admin email from Clerk, passed to the server for authorization. */
  requesterEmail: string;
}

async function request<T>(
  ctx: Ctx,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<Result<T>> {
  try {
    const headers: Record<string, string> = {
      "x-admin-email": ctx.requesterEmail,
    };
    let url = `${API_BASE}${path}`;
    const init: RequestInit = { method, headers };
    if (method === "GET") {
      const sep = path.includes("?") ? "&" : "?";
      url = `${url}${sep}requesterEmail=${encodeURIComponent(ctx.requesterEmail)}`;
    } else {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify({ ...(body ?? {}), requesterEmail: ctx.requesterEmail });
    }
    const res = await fetch(url, init);
    const text = await res.text();
    let parsed: any = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        // Non-JSON body — fall through to raw-text error.
      }
    }
    if (res.ok) {
      return { ok: true, data: parsed as T };
    }
    return {
      ok: false,
      status: res.status,
      error: (parsed && typeof parsed.error === "string" ? parsed.error : null) ?? `Request failed (HTTP ${res.status})`,
      stripeCode: parsed?.stripeCode ?? undefined,
      retryAfterSec: typeof parsed?.retryAfterSec === "number" ? parsed.retryAfterSec : undefined,
      notImplementedReason: typeof parsed?.notImplementedReason === "string" ? parsed.notImplementedReason : undefined,
    };
  } catch (err: any) {
    return { ok: false, status: 0, error: err?.message ?? "Network error" };
  }
}

// ── Reads ────────────────────────────────────────────────────────────────────

export function getSubscriptionOverview(ctx: Ctx, userId: string) {
  return request<OverviewResponse>(ctx, "GET", `/admin/users/${encodeURIComponent(userId)}/subscription-overview`);
}

export function getAudit(ctx: Ctx, userId: string, opts?: { limit?: number; offset?: number }) {
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;
  return request<AuditResponse>(
    ctx,
    "GET",
    `/admin/users/${encodeURIComponent(userId)}/audit?limit=${limit}&offset=${offset}`,
  );
}

// ── Grants ───────────────────────────────────────────────────────────────────

export function createGrant(
  ctx: Ctx,
  userId: string,
  body: { tier: GrantTier; days: number; reason: string },
) {
  return request<GrantCreateResponse>(ctx, "POST", `/admin/users/${encodeURIComponent(userId)}/grants`, body);
}

export function extendGrant(ctx: Ctx, grantId: string, body: { extendDays: number; reason?: string }) {
  return request<GrantExtendResponse>(ctx, "PATCH", `/admin/grants/${encodeURIComponent(grantId)}`, body);
}

export function revokeGrant(ctx: Ctx, grantId: string, body: { reason: string }) {
  return request<GrantRevokeResponse>(ctx, "DELETE", `/admin/grants/${encodeURIComponent(grantId)}`, body);
}

// ── Stripe mutations ─────────────────────────────────────────────────────────

export function cancelStripe(
  ctx: Ctx,
  userId: string,
  body: { mode: "immediate" | "period_end"; reason: string },
) {
  return request<CancelStripeResponse>(ctx, "POST", `/admin/users/${encodeURIComponent(userId)}/cancel`, body);
}

export function refundStripe(
  ctx: Ctx,
  userId: string,
  body: { amountCents?: number; reason: string },
) {
  return request<RefundStripeResponse>(ctx, "POST", `/admin/users/${encodeURIComponent(userId)}/refund`, body);
}

// ── IAP stubs (501 by design) ────────────────────────────────────────────────

export function cancelIap(ctx: Ctx, userId: string, platform: IapPlatform, body: { reason: string }) {
  return request<IapStubResponse>(
    ctx,
    "POST",
    `/admin/users/${encodeURIComponent(userId)}/iap/${platform}/cancel`,
    body,
  );
}

export function refundIap(
  ctx: Ctx,
  userId: string,
  platform: IapPlatform,
  body: { amountCents?: number; reason: string },
) {
  return request<IapStubResponse>(
    ctx,
    "POST",
    `/admin/users/${encodeURIComponent(userId)}/iap/${platform}/refund`,
    body,
  );
}

// ── Helpers for the UI ───────────────────────────────────────────────────────

/** Human-readable label for each resolved subscription source. */
export function sourceLabel(source: SubscriptionSource): string {
  switch (source) {
    case "stripe":      return "Stripe";
    case "apple_iap":   return "Apple IAP";
    case "google_play": return "Google Play";
    case "manual":      return "Admin grant";
    case "none":        return "No subscription";
  }
}

/** Case-insensitive, whitespace-tolerant comparison of two email strings. */
export function emailsMatch(a: string, b: string): boolean {
  return a.toLowerCase().trim() === b.toLowerCase().trim();
}

/**
 * True when a failed Result<T> represents the "designed" 501 response from
 * the Apple/Google IAP stub endpoints. UI treats these as soft-success —
 * the audit row was written, the integration is just not live yet.
 */
export function isIapStubResponse(err: Err): boolean {
  return err.status === 501 && err.error.toLowerCase().includes("iap action not implemented");
}
