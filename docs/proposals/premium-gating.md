# Premium Gating — Design Proposal (2026-04-20)

Scope: the gating pattern, telemetry, and the *first* 2–3 Premium Insights features to ship in Phase 2. Everything else from the Premium list stays in Phase 3.

Tracked files:
- [artifacts/mobile/app/(tabs)/insights.tsx](artifacts/mobile/app/(tabs)/insights.tsx)
- [artifacts/mobile/components/PaywallSheet.tsx](artifacts/mobile/components/PaywallSheet.tsx)
- [artifacts/mobile/context/SubscriptionContext.tsx](artifacts/mobile/context/SubscriptionContext.tsx)

---

## 1. Where we are today

The current Insights tab already has gating, but it's inline and repetitive:

- Each card re-checks `isProOrPremium` / `isPremium` from `useSubscription()` and conditionally renders a `<LockOverlay>` declared locally at [insights.tsx:127](artifacts/mobile/app/(tabs)/insights.tsx:127).
- There are three locked-card instances (`Performance`, `Sector Breakdown`, `52-Week Proximity`) plus one big Premium block — each with a slightly different message.
- There is a ghost-preview teaser for Free users ([insights.tsx:332](artifacts/mobile/app/(tabs)/insights.tsx:332)) that uses decorative grey bars, not the real (blurred) chart.
- No telemetry on *which* lock the user saw or which CTA they tapped. `recordEventExpansion` logs AI expansions to `/api/analytics/track` ([SubscriptionContext.tsx:230](artifacts/mobile/context/SubscriptionContext.tsx:230)), but nothing equivalent fires for upgrade surfaces.

Good existing infrastructure we'll lean on:
- `useSubscription().tier` is already the single source of truth.
- `PaywallSheet` accepts a `triggerReason` prop — we'll extend it.
- `/api/analytics/track` accepts arbitrary `eventType` + `payload` ([api-server/src/routes/analytics.ts:7](artifacts/api-server/src/routes/analytics.ts:7)) — no backend change needed for telemetry.

## 2. Gating component API

One wrapper, one signature, one source of truth for "was this locked?" Shouldn't need any conditionals at the call site other than choosing a feature key.

```tsx
// artifacts/mobile/components/PremiumGate.tsx (new)

export type PremiumFeature =
  | "risk_metrics"
  | "benchmark_comparison"
  | "dividend_calendar"
  | "export_pdf_csv"
  | "correlation_matrix"       // Phase 3
  | "scenario_analysis"        // Phase 3
  | "monte_carlo"              // Phase 3
  | "tax_lot_view"             // Phase 3
  | "geo_currency_exposure"    // Phase 3
  | "rebalancing_suggestions"  // Phase 3
  | "full_brief_archive";      // Phase 3

interface PremiumGateProps {
  feature: PremiumFeature;
  /** Title shown in the locked overlay, e.g. "Unlock risk metrics". */
  title: string;
  /** One-line pitch under the title. */
  pitch: string;
  /** Real component rendered unlocked, or blurred underneath when locked. */
  children: React.ReactNode;
  /**
   * If true (default), render `children` behind a blur/dim + lock overlay so the
   * user sees what they're missing. If false, replace with a plain locked card.
   * Real data only — never pass sample data here; if the real data requires a
   * fetch we skip-render and show a plain locked card to avoid wasting API calls.
   */
  previewReal?: boolean;
  /** Called instead of opening the paywall — e.g. to deep-link into a specific plan. */
  onUpgrade?: () => void;
}
```

Behaviour:

- Looks up whether `feature` is `pro` or `premium` via an internal `FEATURE_TIER_REQUIREMENT` map — no per-call-site tier math.
- If `tier` satisfies the requirement → render `children` bare, nothing else.
- Otherwise: render `children` inside a `<View collapsable={false}>` with `pointerEvents="none"`, optionally wrapped in `@react-native-community/blur` BlurView (2–3 px radius) + a translucent overlay, with a centred lock card that calls `onUpgrade` or opens `PaywallSheet` with `triggerReason="premium_feature:<feature>"`.
- On *first render while locked*, fires `premium_lock_impression` with `{ feature, tier }`. Impressions are deduplicated per `(feature, sessionId)` via a ref in a small `PremiumGateTelemetryProvider` so scroll-in/out of a long list doesn't spam.
- On CTA tap, fires `premium_lock_cta_click` with the same payload + `cta: "upgrade" | "dismiss"`.

Notes:
- We keep `<LockOverlay>` but make it the default rendering path inside `PremiumGate`; inline call sites migrate to the new component over a single PR.
- We intentionally *do not* blur-preview features whose real data costs a remote fetch (`export_pdf_csv`, `full_brief_archive`). Those get a plain locked card.
- `previewReal={false}` path exists for features where a blurred chart of another user's data would be misleading (e.g. dividend calendar with empty portfolio data would just show "no events").

## 3. Telemetry events

Everything funnels through `POST /api/analytics/track` which already exists:

| Event | Payload | When |
|---|---|---|
| `premium_lock_impression` | `{ feature, tier, surface: "insights" \| "stock" \| ... }` | `<PremiumGate>` first mounted in locked state, per session + feature. |
| `premium_lock_cta_click` | `{ feature, tier, cta: "upgrade" }` | User taps the Upgrade button inside a locked gate. |
| `premium_paywall_opened` | `{ feature?, trigger: "gate" \| "hard_limit" \| "manual" }` | `PaywallSheet` becomes visible. |
| `premium_paywall_plan_selected` | `{ feature?, priceId, interval }` | User taps a plan inside the sheet. |
| `premium_paywall_checkout_started` | `{ feature?, priceId }` | `startCheckout` returns a URL. |
| `premium_paywall_dismissed` | `{ feature?, had_selection: boolean }` | Sheet closes without checkout. |
| `premium_feature_first_use` | `{ feature, tier }` | Post-upgrade, the first render where the gate resolves → unlocked fires once, key persisted per-user. Closes the conversion loop. |

All writes are non-blocking (the endpoint already swallows errors). Client aggregates impressions per 60 s to avoid network chatter on scroll.

Dashboard view (from `user_events`):
```sql
SELECT
  payload->>'feature' AS feature,
  COUNT(*) FILTER (WHERE event_type = 'premium_lock_impression')     AS impressions,
  COUNT(*) FILTER (WHERE event_type = 'premium_lock_cta_click')       AS cta_clicks,
  COUNT(*) FILTER (WHERE event_type = 'premium_paywall_checkout_started') AS checkouts
FROM user_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY cta_clicks DESC;
```
This is the "which Premium feature to prioritise in Phase 3" signal the spec calls out.

## 4. Phase 2 shipping choices — the 2–3 features

Ranking criteria: (a) conversion potential for a portfolio-tracking audience, (b) build cost relative to existing data sources, (c) demo quality — something blurrable that makes a user lean in.

Recommendation: ship **three**.

### 4.1 Risk metrics (beta, volatility 30/90/365, max drawdown, Sharpe, Sortino)
- **Why:** volatility is already computed naively in [insights.tsx:229](artifacts/mobile/app/(tabs)/insights.tsx:229). Extending it is pure math on series we already fetch via `useMiniCharts`. High perceived sophistication for minimal effort.
- **Conversion bet:** retail investors understand "Sharpe" as a prestige metric even when they can't cite the formula. Blurred preview reads well.
- **Data dependency:** 1Y daily closes (already cached). Beta needs a benchmark series — we fetch OMXS30 for SE users and S&P 500 for everyone else via the existing `/api/stocks/chart` route.
- **Risk:** our chart endpoint is cached 5 min; beta recompute on mount adds one extra benchmark fetch per session. Negligible.

### 4.2 Benchmark comparison (portfolio vs OMXS30 / S&P 500, with tracking error + alpha)
- **Why:** pairs naturally with 4.1 and shares the same benchmark fetch. Visual: a two-line overlay chart — the single best "what am I missing" demo we have.
- **Conversion bet:** "your portfolio beat the S&P by 2.3% this month" is viral-shareable in a way that Sharpe isn't.
- **Data dependency:** portfolio time-series is a weighted sum of holdings' 1Y charts. We don't track historical weights (users can add/remove stocks over time), so v1 uses *current* weights back-applied — state this limitation in the UI footnote.

### 4.3 Export to PDF/CSV
- **Why:** the spec calls this out as a "quick win, useful on its own." It's the lowest-friction Premium feature we can ship — CSV is one `react-native-fs` write, PDF via [`react-native-html-to-pdf`] or a server-side render.
- **Conversion bet:** users who want to file taxes or share with an advisor will upgrade for this alone. Different buyer persona from 4.1/4.2, so incremental conversion.
- **Data dependency:** existing portfolio stats + current holdings. Zero new math.
- **Scope for v1:** CSV only from the Insights screen ("Export portfolio snapshot") + PDF summary of Insights page. No custom date ranges or tax-lot detail (that's Phase 3).

**Deferred to Phase 3 (all the rest):** correlation matrix, scenario analysis, Monte Carlo, tax lots (K4), geo/currency exposure, rebalancing suggestions, full brief archive. All three are higher-cost data or math projects — the Phase 2 dashboard will tell us which ones earn the build.

## 5. Implementation sequencing

1. **PR 1 — gating primitive (no features):**
   - Add `PremiumGate` + `PremiumGateTelemetryProvider` + `FEATURE_TIER_REQUIREMENT` map.
   - Migrate the four existing inline locks in `insights.tsx` to the new component.
   - Wire telemetry events end-to-end (impression + CTA + paywall).
   - No user-visible change; net line count goes down.

2. **PR 2 — risk metrics + benchmark comparison:**
   - Shares a benchmark-fetch hook `useBenchmarkSeries(benchmark)`.
   - New "Risk" card and "Benchmark" card on Insights, wrapped in `<PremiumGate feature="risk_metrics" | "benchmark_comparison">`.

3. **PR 3 — export:**
   - CSV via `expo-file-system` + `expo-sharing`.
   - PDF via `expo-print` (HTML template → PDF).
   - `<PremiumGate feature="export_pdf_csv" previewReal={false}>` wraps the export action sheet entry.

4. **PR 4 — conversion dashboard:**
   - Admin-only page at `/(tabs)/admin-panel` showing the SQL in §3 as a simple table + sparkline. No new backend beyond a read-only admin route.

Each PR is independently reviewable and can ship behind the same feature flag we use for alerts (`PREMIUM_PHASE_2_ENABLED`, hash-bucketed on user id, 10% → 50% → 100%).

## 6. Open questions

1. **Benchmark default:** Swedish-residence users should probably see OMXS30 first, but we don't have residence info. Proposal: auto-pick the benchmark based on the portfolio's majority-exchange currency (SEK → OMXS30, USD → S&P 500, EUR → STOXX 600), and let the user pick in a segmented control. Confirm?
2. **Blur library:** `@react-native-community/blur` works on native but not web; our app is web-capable. Fallback proposal: CSS `backdrop-filter: blur(3px)` on web, opacity-60 solid overlay when neither is available. Confirm web is a target we care about for Premium previews — it's not a lot of code either way.
3. **Do we gate anything *outside* Insights in Phase 2?** The spec implies Insights only, but the `<PremiumGate>` primitive is reusable. I'd hold the line: Phase 2 ships gating in Insights only, Phase 3 extends to stock detail sections.
4. **Export format localisation:** PDF header — "Portfolio Snapshot" in English only for v1, or do we want SV translations day one? Cheap either way, just asking.

---

*Stop here for team review. No implementation until the 2–3-feature pick and the gating API are signed off.*
