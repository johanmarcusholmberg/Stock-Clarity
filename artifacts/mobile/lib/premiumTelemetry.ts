// Thin helper for telemetry events around the premium paywall / gating.
// All writes are best-effort and non-blocking — the /api/analytics/track
// endpoint already swallows errors on the server side.

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

export type PremiumFeature =
  // Pro-required (Phase 1)
  | "performance_rankings"
  | "sector_breakdown"
  | "fifty_two_week_range"
  // Pro-required (Phase 3.4 PR 3 — moved up from Premium)
  | "dividend_calendar"
  | "geo_currency_exposure"
  | "csv_export_basic"
  // Pro-required (Phase 3.4 PR 4)
  | "realized_pnl"
  // Premium-required (Phase 2)
  | "risk_metrics"
  | "benchmark_comparison"
  | "export_pdf_csv"
  // Premium-required (deferred to Phase 3, listed for the map)
  | "correlation_matrix"
  | "scenario_analysis"
  | "monte_carlo"
  | "tax_lot_view"
  | "rebalancing_suggestions"
  | "full_brief_archive";

export type PremiumSurface = "insights" | "stock" | "digest" | "account";

export type PremiumEvent =
  | "premium_lock_impression"
  | "premium_lock_cta_click"
  | "premium_paywall_opened"
  | "premium_paywall_plan_selected"
  | "premium_paywall_checkout_started"
  | "premium_paywall_dismissed"
  | "premium_feature_first_use";

export function trackPremiumEvent(
  eventType: PremiumEvent,
  userId: string | null | undefined,
  payload: Record<string, unknown>,
): void {
  // Fire-and-forget — no await so callers don't have to think about async.
  fetch(`${API_BASE}/analytics/track`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: userId ?? null, eventType, payload }),
  }).catch(() => {});
}
