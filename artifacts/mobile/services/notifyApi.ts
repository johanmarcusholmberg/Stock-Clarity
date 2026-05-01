// Client for the /api/notify endpoints. Types mirror the server row shape —
// snake_case in the payload, snake_case preserved on the client to keep
// the mapping trivial (these come straight out of pg). The one camelCase
// alias we keep is at the consumer layer in NotifyContext.

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

export type NotifyKind = "news" | "earnings";
export type NotifyStatus = "active" | "muted";
export type NotifyChannel = "push" | "email" | "both";
export type NotifyEventKind =
  | "news"
  | "earnings_t1"
  | "earnings_open"
  | "earnings_after";

export interface NotifySubscription {
  id: string;
  user_id: string;
  symbol: string | null;
  kind: NotifyKind;
  status: NotifyStatus;
  min_impact_score: number | null;
  delivery_channel: NotifyChannel;
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  created_at: string;
  updated_at: string;
}

export interface NotifySubscriptionsResponse {
  subscriptions: NotifySubscription[];
  defaults: {
    news: NotifySubscription | null;
    earnings: NotifySubscription | null;
  };
}

export interface NotifyEvent {
  id: number;
  user_id: string;
  subscription_id: string;
  symbol: string;
  kind: NotifyEventKind;
  source_kind: "news_cache" | "earnings_calendar";
  source_id: number;
  title: string;
  body: string;
  fired_at: string;
  delivered_via: string | null;
}

export interface NotifyEventsResponse {
  events: NotifyEvent[];
  nextBefore: string | null;
}

export interface NotifyStatusResponse {
  enabled: boolean;
}

// ── Status (NOTIFY_ENABLED + per-user rollout bucket on the server) ─────────
// userId is required for the rollout gate. Calling without it (anonymous
// caller) yields enabled=false on the server — matches the existing
// signed-out behaviour where the consumer treats notify as off.
export async function getNotifyStatus(
  userId?: string | null,
): Promise<NotifyStatusResponse> {
  try {
    const qs = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const res = await fetch(`${API_BASE}/notify/status${qs}`);
    if (!res.ok) return { enabled: false };
    return (await res.json()) as NotifyStatusResponse;
  } catch {
    return { enabled: false };
  }
}

// ── Subscriptions ───────────────────────────────────────────────────────────
export async function listSubscriptions(
  userId: string,
): Promise<NotifySubscriptionsResponse> {
  try {
    const res = await fetch(
      `${API_BASE}/notify/subscriptions/${encodeURIComponent(userId)}`,
    );
    if (!res.ok) return { subscriptions: [], defaults: { news: null, earnings: null } };
    return (await res.json()) as NotifySubscriptionsResponse;
  } catch {
    return { subscriptions: [], defaults: { news: null, earnings: null } };
  }
}

export interface UpsertSubscriptionInput {
  kind: NotifyKind;
  symbol?: string | null;
  status?: NotifyStatus;
  delivery_channel?: NotifyChannel;
  min_impact_score?: number | null;
  quiet_start_hour?: number | null;
  quiet_end_hour?: number | null;
}

export async function upsertSubscription(
  userId: string,
  input: UpsertSubscriptionInput,
): Promise<NotifySubscription | { error: string }> {
  const res = await fetch(
    `${API_BASE}/notify/subscriptions/${encodeURIComponent(userId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return data.subscription as NotifySubscription;
}

export type PatchSubscriptionInput = Partial<
  Pick<
    NotifySubscription,
    "status" | "delivery_channel" | "min_impact_score" | "quiet_start_hour" | "quiet_end_hour"
  >
>;

export async function patchSubscription(
  userId: string,
  subId: string,
  patch: PatchSubscriptionInput,
): Promise<NotifySubscription | { error: string }> {
  const res = await fetch(
    `${API_BASE}/notify/subscriptions/${encodeURIComponent(userId)}/${encodeURIComponent(subId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return data.subscription as NotifySubscription;
}

// ── Events (inbox) ──────────────────────────────────────────────────────────
export async function listNotifyEvents(
  userId: string,
  limit = 50,
  before?: string,
): Promise<NotifyEventsResponse> {
  try {
    const params = new URLSearchParams();
    params.set("limit", String(limit));
    if (before) params.set("before", before);
    const res = await fetch(
      `${API_BASE}/notify/events/${encodeURIComponent(userId)}?${params.toString()}`,
    );
    if (!res.ok) return { events: [], nextBefore: null };
    return (await res.json()) as NotifyEventsResponse;
  } catch {
    return { events: [], nextBefore: null };
  }
}

// Suppressed = evaluator wrote the row but did not deliver. Possible suffixes
// today: "suppressed:cap", "suppressed:quiet_hours". The other delivered_via
// values ("push", "push:no_token", "push:failed", "email:queued") are not
// suppressed, even if "push:failed" / "push:no_token" represent delivery
// problems — those are surfaced differently.
export function isEventSuppressed(e: NotifyEvent): boolean {
  return typeof e.delivered_via === "string" && e.delivered_via.startsWith("suppressed:");
}
