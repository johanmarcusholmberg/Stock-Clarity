# Premium Insights — Phase 3.4 Design Proposal (2026-04-26)

Scope: pick the next batch of Premium features to ship after Phase 3.3 and define the data + compute architecture that makes them possible. Sets up the "deferred Phase 3" list already declared in [PremiumGate.tsx](artifacts/mobile/components/PremiumGate.tsx) and answers what (if anything) we move between tiers.

Tracked files / context:
- [artifacts/mobile/components/PremiumGate.tsx](artifacts/mobile/components/PremiumGate.tsx)
- [artifacts/mobile/lib/portfolioMath.ts](artifacts/mobile/lib/portfolioMath.ts)
- [artifacts/mobile/lib/premiumTelemetry.ts](artifacts/mobile/lib/premiumTelemetry.ts)
- [artifacts/mobile/context/SubscriptionContext.tsx](artifacts/mobile/context/SubscriptionContext.tsx)
- [artifacts/api-server/src/lib/tierService.ts](artifacts/api-server/src/lib/tierService.ts)
- [docs/proposals/premium-gating.md](docs/proposals/premium-gating.md) (Phase 2 spec — assumed shipped)

---

## 1. Current state

### 1.1 Tier boundaries today

Three tiers, single canonical enum (`free | pro | premium`):

| Tier | Price | What's included |
|---|---|---|
| Free | $0 | Watchlist (50 stocks / 2 folders), basic stock pages, 1Y charts, daily digest, news, real-time alerts, 3 stock pages w/ AI per day, 5 AI summaries/day |
| Pro | $4.99/mo, $47.99/yr | + performance rankings, sector breakdown, 52-week range, 10 folders, 10 stock pages/day, 30 AI summaries/day |
| Premium | $9.99/mo, $95.99/yr | + risk metrics (β, σ, Sharpe, Sortino, max DD), benchmark comparison (SPX/OMXS30/STOXX600), export PDF/CSV, unlimited stock pages & summaries |

Quotas live in `TIER_LIMITS` ([SubscriptionContext.tsx](artifacts/mobile/context/SubscriptionContext.tsx)). Feature gating is centralized in `FEATURE_TIER_REQUIREMENT` in [PremiumGate.tsx](artifacts/mobile/components/PremiumGate.tsx) — every new feature in this proposal will be added to that map.

### 1.2 Telemetry: what we know about what users want

The telemetry plumbing from Phase 2 is live. Five events flow into `user_events`:

- `premium_lock_impression` (deduped per session+feature)
- `premium_lock_cta_click`
- `premium_paywall_opened` / `_dismissed`
- `premium_feature_first_use`

**What we don't have yet:** the per-feature aggregation dashboard. The admin page at [admin.ts](artifacts/api-server/src/routes/admin.ts) shows top event types but doesn't slice by `payload->>'feature'`, so we can't see "users tried to open `risk_metrics` 4× more often than `export_pdf_csv`" without running the SQL by hand.

The query that *would* answer it (already in [premium-gating.md §3](docs/proposals/premium-gating.md)):

```sql
SELECT payload->>'feature' AS feature,
       COUNT(*) FILTER (WHERE event_type = 'premium_lock_impression')         AS impressions,
       COUNT(*) FILTER (WHERE event_type = 'premium_lock_cta_click')          AS cta_clicks,
       COUNT(*) FILTER (WHERE event_type = 'premium_paywall_opened')          AS paywall_opens
FROM user_events
WHERE created_at > NOW() - INTERVAL '30 days'
GROUP BY 1
ORDER BY cta_clicks DESC;
```

**Recommendation:** PR 1 of this phase ships the conversion dashboard the previous proposal deferred. Until we see the data we're prioritising on prior assumptions ("retail likes Sharpe", "exports drive tax-season conversion"), not measured intent. Two weeks of data should be enough to re-rank the rest of this proposal before we build the heavy stuff.

### 1.3 What's already computed vs. missing

This is the spine of the rest of the doc — the Premium feature list is mostly bottlenecked on data, not UI.

**Already computed (client-side, [portfolioMath.ts](artifacts/mobile/lib/portfolioMath.ts)):** total return, volatility (30/90/365d windows), Sharpe, Sortino, beta, alpha, tracking error, max drawdown, sector breakdown.

**Already plumbed:** Yahoo Finance for quotes/charts, 1Y daily closes cached 30–60 min, three benchmark series (SPX, OMXS30, STOXX600).

**Missing — and blocks most of the deferred Premium list:**

| Capability | Why it's blocking | Impact |
|---|---|---|
| **Holdings table** (qty, price, date, currency per purchase) | We have a *watchlist* — tickers without ownership. Not a portfolio. | Blocks: cost basis, realized P&L, tax lots, dividend yield-on-cost, accurate Monte Carlo, rebalancing |
| **Cost-basis engine** (FIFO/LIFO/avg per lot) | Needs the holdings table first. | Blocks: tax lots, tax-loss harvesting, realized gains export |
| **Daily portfolio snapshots** | Currently no `portfolio_snapshots` table — value history is recomputed on demand from current weights × historical prices. State-dependent (weight changes invisible). | Blocks: honest historical performance, drawdown chart that survives a rebalance |
| **Dividend ledger** | Yahoo dividend events not ingested. | Blocks: dividend calendar, yield-on-cost |
| **Forward fundamentals** (P/E, earnings dates, analyst targets) | No ingestion. | Blocks: earnings-aware features, valuation overlays |

**Scenario / Monte Carlo / tax / rebalancing code:** zero. Blank slate — no naming or duplication risk, and no half-built logic to reconcile.

**Locale / tax stance:** the app is currency-aware (SEK/USD/EUR for portfolio + benchmark selection) but has **no jurisdiction-specific tax logic** anywhere. Nothing US-specific, nothing K4-specific yet. This matters for tax features — see §4.6.

---

## 2. Tier framework for new features

Applying the brief's rubric to this product:

- **Free** — core utility, retention driver, no compute tail. Should make a non-investor friend who downloaded the app for one stock keep coming back.
- **Pro** — depth for someone actively managing money. Cheap-to-compute features that reward engagement (more holdings, more views, more alerts).
- **Premium** — portfolio-serious. Compute-heavy, lower per-user frequency, high perceived value. Where the data ingestion costs and edge function CPU live.

A practical test I'm using: if a feature can be computed from a single ticker without any user-specific data (e.g. "show this stock's 5-year P/E"), it's a candidate for Free or Pro. If it requires the user's *actual portfolio* over time — and especially if it requires per-purchase data — it's Premium. The latter is also where tax/regulatory risk concentrates.

---

## 3. Proposed feature list

Grouped by tier, each with rationale and a build-cost estimate. Items already shipped in Phase 2 are noted but not re-described.

### 3.1 Free

| Feature | Status | Rationale |
|---|---|---|
| Watchlist, basic stock pages, daily digest, news, alerts | Shipped | Already the retention spine. Don't touch. |
| **Holdings entry — small portfolio** (≤ 5 positions, manual qty + cost) | **NEW** | Without *some* holdings ingestion in Free, we never get to the "wow my portfolio is up 12%" moment that drives upgrade. Capping at 5 positions keeps it useful for casual users (a few stocks they actually own) without enabling power users to skip Pro. Stores in same `portfolios` table as paid tiers — tier check is on row count at insert. |
| **Daily portfolio value snapshot** | **NEW (server)** | Implicit on top of holdings — the cron runs for every user, all tiers. Cheap (~1 query × N tickers per day, all tickers shared across users via Yahoo cache). Free users see their portfolio value chart over time; this is the upgrade hook for everything in Pro/Premium. |

Free intentionally excludes any per-user advanced math. The hook is "you can see what you own and how it's doing — pay if you want to know *why*."

### 3.2 Pro ($4.99 / mo)

Already shipped: performance rankings, sector breakdown, 52-week range proximity.

New in 3.4:

| Feature | Rationale |
|---|---|
| **Holdings — unlimited positions** | Lifts the Free cap. Single most legible Pro upsell for anyone with a real portfolio — the upgrade feels like "remove the limit," not "buy a new feature." |
| **Dividend calendar + yield-on-cost** | Already declared `dividend_calendar` in PremiumGate enum at Premium tier. **Re-tiering recommendation: move to Pro.** Reasoning: dividend tracking is breadth, not depth — it's the kind of thing a Pro-tier "active investor" expects baseline, and it's cheap to compute (one extra Yahoo endpoint, no user-specific math beyond multiplying qty × forward div). Keep correlation/Monte Carlo as the Premium hook. |
| **Geo / currency exposure** | Currently `geo_currency_exposure` at Premium. **Re-tiering recommendation: move to Pro.** Same reasoning as above — it's a pie chart, not a model. The data (country, currency) comes free from Yahoo's quote endpoint; we already have currency parsing for benchmark selection. |
| **Realized P&L (YTD)** | Once cost basis exists, the YTD realized number is one query. Pro-tier feels right — useful to active investors but not power-user-only. |
| **CSV export** (currently Premium) | **Re-tiering recommendation: split.** Move basic CSV (current holdings, last 30 days events) to Pro. Keep PDF + tax-lot CSV at Premium. Reasoning: CSV-of-portfolio is something users expect as a checkbox feature in any tracker; making it Premium feels punitive. PDF is the polished artefact for advisors / family. |

Pro becomes "real investor with a real portfolio" — unlimited holdings + the everyday metrics + plain-data export. Premium becomes "power user / portfolio-serious."

### 3.3 Premium ($9.99 / mo)

Already shipped: risk metrics, benchmark comparison, PDF export.

New in 3.4 (ranked by my prior, to be re-ranked after PR 1 telemetry):

| Feature | Rationale | Compute cost |
|---|---|---|
| **Correlation matrix** | Power-user catnip. Low compute, high "ooh that's pretty" demo. Pairs well with risk metrics already in Premium. | Client-side; see §4.1 |
| **Scenario analysis (what-if add/remove holding)** | Natural extension of risk metrics — user mutates weights, Sharpe/β recompute live. Best Premium "interactive" feature; engagement driver, not just a static card. | Client-side; see §4.2 |
| **Monte Carlo retirement projection** | The marquee "wow" feature. Needs scenario engine + user inputs (years, contribution rate, withdrawal rate). | **Server-side**; see §4.3 |
| **Tax-loss harvesting suggestions** | Highest *direct dollar value* feature — a single suggestion can pay for years of subscription. But: jurisdiction-specific, regulatory risk. Ship US-only first. | Server-side, rule-based; see §4.4 |
| **Rebalancing suggestions** | Lower priority — only useful for users who've set a target allocation, which we don't capture today. Adds a "set targets" UI before the suggestion logic earns its build. | Client-side once targets exist; see §4.5 |
| **Full brief archive** | Already declared. Pure storage cost, no compute. Easy ship. | ~$0 |

Two declared-but-deferred features I'd **drop or postpone past 3.4:**
- **Tax lot view** as a standalone item — folded into "tax-loss harvesting" since lots without harvesting recommendations is just a list.

---

## 4. Architecture for the compute-heavy features

The honest question: which of these run on the device, and which have to run on the server? Three drivers: (1) does the math jank the UI thread, (2) does it need data the device doesn't have, (3) is the result cacheable across users.

### 4.1 Correlation matrix — client-side

**Math:** Pearson correlation of daily returns across N holdings × 252 trading days. For N=30, that's 435 unique pairs × 252 = ~110k float ops. Trivial — sub-millisecond on V8.

**Data:** the 1Y daily closes per holding are already cached client-side via the existing chart fetcher. No new endpoint.

**Decision:** compute on demand in `useMemo` keyed on `(holdingsHash, priceHash)`. No backend. Render as heatmap with [react-native-svg].

**Tradeoff:** we recompute on every mount (cheap), and large portfolios (>50 holdings) become visually unreadable. Cap matrix view at 25 positions, show a "top correlations" list above it for the rest.

### 4.2 Scenario analysis — client-side

**Math:** same risk-metric stack as Phase 2 (`portfolioMath.ts`), just run with a mutated weights vector. User adds "5 shares of AAPL," the mutated weights flow into the same volatility/Sharpe/β calc.

**Data:** if the hypothetical ticker isn't in the user's holdings, fetch its 1Y series on-demand. Otherwise reuse cached series.

**Decision:** entirely client-side, debounce 250 ms on slider/input changes. The feature *is* the interactivity — round-tripping the server kills the demo.

**Risk:** if the user wants to scenario-test a ticker we've never fetched, we hit the chart endpoint cold. Acceptable — same one-shot cost as opening that ticker's stock page.

### 4.3 Monte Carlo — server-side, cached

**Math:** geometric Brownian motion or empirical bootstrap, 10,000 paths × 30 years × 12 monthly steps = 3.6M sampled returns per simulation. JS in the main thread will jank (~500–1500 ms). Web worker would work on web but not reliably across the React Native bridge.

**Decision:** Edge function (existing Hono API server) at `POST /api/insights/monte-carlo`. Inputs: portfolio composition, user-supplied params (years, contribution, withdrawal, target). Outputs: terminal value distribution at p10/p25/p50/p75/p90 + survival probability. JSON response < 5 KB.

**Caching:** key on `sha256(holdings_composition + params_normalised)`. TTL 24 h — Monte Carlo on the same portfolio + same assumptions produces the same distribution within statistical noise; recomputing daily picks up the latest 1Y of returns. Per-user table `monte_carlo_cache(user_id, key, result, computed_at)`.

**Performance budget:** ~150 ms per simulation in Node (rough — 3.6M Math.random + log + exp). Edge function 512 MB limit fine. Worst case at scale: 1k Premium users running it 2× per day each = 2k cold-cache invocations/day × 150 ms = 300 s of compute/day. Negligible.

**Risk:** users will treat the p50 as a prediction. Need explicit "this is a simulation, not a forecast" footnote and link to assumptions. Have legal review the disclaimer copy before ship — see §6.

### 4.4 Tax-loss harvesting — server-side, rule-based, US-only v1

**Math:** for each holding, find lots where `current_price < cost_basis` AND `holding_period >= short/long threshold`. Rank by absolute dollar loss. Flag potential wash-sale conflicts (same ticker bought within 30 days before/after the loss).

**Decision:** server-side scan on user request. Reads from `holdings` + `lots` tables (introduced in PR 2). No external compute beyond existing Yahoo quote.

**Why server:** wash-sale detection wants the full lot history we keep on the server anyway; doing it client-side means shipping all the user's lots to the device. Server query is cleaner.

**Jurisdiction scope for v1:** US-only. Wash-sale rules differ by country; Sweden has different (less restrictive) equivalents; UK has a 30-day "bed and breakfasting" rule. We **don't** show this feature for non-US-resident users in v1 — gate on a new `tax_jurisdiction` field on the user profile (default US, settable in account). See §6 open question.

**No LLM:** explicitly rule-based. Tax suggestions phrased as "this is a hypothetical lot you could sell to realise an X loss" — never "you should sell" — and disclaimer header. Don't auto-generate AI commentary on tax decisions; the legal blast radius isn't worth it.

### 4.5 Rebalancing — client-side, but needs targets first

**Math:** for each holding, drift = `current_weight - target_weight`. Suggest rebalancing trades when `|drift| > threshold` (default 5%). Trivial.

**Blocker:** we don't store target allocations. Adding a target-allocation UI is non-trivial (per-holding %, per-sector %, per-asset-class %?) — call it a 1-PR feature on its own.

**Decision:** ship target-allocation entry first (Pro tier — it's an organisational feature), drift-based rebalancing suggestions on top (Premium). Don't bundle them in the same PR.

### 4.6 Full brief archive — pure storage

Daily AI brief is ~2 KB of text. 365 days × 10k Premium users × 2 KB ≈ 7 GB. Existing object storage / Postgres handles this without architecture work. Just remove the "30-day retention" filter on the existing brief query for Premium users.

---

## 5. Cost estimates (AI + compute)

Marginal cost per Premium user per month, assuming 1k Premium users at steady state:

| Feature | Cost per use | Frequency | Monthly cost / 1k users |
|---|---|---|---|
| Correlation matrix | $0 (client) | ~5/user/month | **$0** |
| Scenario analysis | ~1 cold chart fetch on novel ticker, ~$0 | ~3/user/month | **$0** |
| Monte Carlo | 150 ms edge fn + cache | ~2/user/month, 80% cache hit | **~$1** (edge fn time at $0.000004/ms × 150 ms × 400 cold calls) |
| Tax-loss harvest scan | DB query + rules | ~1/user/month, Q4-skewed | **~$0.10** |
| Rebalancing | $0 (client) | ~2/user/month | **$0** |
| Full brief archive | ~5 MB extra storage / user | continuous | **~$0.10** (object storage) |
| Holdings + daily snapshot cron | 1 quote/day × ~10 holdings/user | continuous | **~$0** (Yahoo free, snapshot table writes negligible) |

**Total marginal cost: ~$1.50 / 1k Premium users / month.** Premium revenue at 1k users = $9,990/mo. Compute cost is rounding error.

**One thing I deliberately excluded:** AI-generated commentary on metrics (e.g. "your Sharpe dropped because…"). It's tempting and would be ~$0.01–0.05 per generation depending on context size, but it adds opinion-shaped output to numbers users will treat as advice. Defer past 3.4 unless telemetry shows we're losing conversions to "I don't know what this means."

**Data ingestion costs (one-time + ongoing):**
- No new paid data provider in 3.4 — Yahoo covers everything. If we add fundamentals later (Finnhub: $50/mo starter, Polygon: $30/mo basic) it's a separate decision and not blocking.
- Holdings + dividend ingestion are user-driven (manual entry), not API-pulled. Zero ongoing data cost.

---

## 6. PR breakdown

Each PR is independently reviewable, behind a `PREMIUM_PHASE_3_4_ENABLED` flag, hash-bucketed on user id (10% → 50% → 100%). Same flag pattern as Phase 2.

### PR 1 — Conversion dashboard (no new features)
- Admin page at `/admin/insights-conversion` running the SQL from §1.2.
- Table: feature × impressions × CTA clicks × paywall opens × first-uses (post-upgrade).
- Sparkline per feature, last 30 days.
- **Why first:** two weeks of data lets us re-rank the rest of this proposal before building. If `correlation_matrix` impressions are 10× `monte_carlo`, that's the build order, not whatever we're guessing.
- Net new code: ~150 lines admin route + ~200 lines admin UI.

### PR 2 — Holdings + lots schema + Free entry UI
- New tables: `holdings(id, user_id, ticker, currency)`, `lots(id, holding_id, qty, cost_per_share, purchased_at, currency)`, `portfolio_snapshots(user_id, date, value_usd, value_native, holdings_hash)`.
- Daily snapshot cron in [api-server](artifacts/api-server) — single job iterating all users with holdings.
- Free-tier UI: "Add a holding" form, 5-position cap enforced server-side.
- Tier check via existing `tierService.computeEffectiveTier`.
- Not user-visible behind flag; this is foundational.

### PR 3 — Pro tier upgrades (unlimited holdings, dividend calendar, geo/currency, basic CSV)
- Lift holdings cap for Pro+.
- Yahoo dividend ingestion for held tickers (cron, separate from snapshot).
- Geo / currency pie chart on Insights tab — gated `<PremiumGate feature="geo_currency_exposure">`.
- Dividend calendar on Insights — gated `<PremiumGate feature="dividend_calendar">`.
- Re-tier `dividend_calendar` and `geo_currency_exposure` from Premium → Pro in `FEATURE_TIER_REQUIREMENT`.
- Split CSV: `csv_export_basic` (Pro) vs existing `export_pdf_csv` (Premium, now PDF + tax-lot CSV).

### PR 4 — Realized P&L + YTD numbers (Pro)
- Cost-basis engine (FIFO default, configurable per holding). Pure function over `lots`.
- "YTD realized" + "lifetime realized" cards on Insights tab.
- Not gated separately — included in Pro alongside holdings.

### PR 5 — Correlation matrix (Premium)
- `<CorrelationHeatmap>` component, react-native-svg.
- Cap at 25 holdings + "top 10 correlations" list above for larger portfolios.
- `<PremiumGate feature="correlation_matrix">` wrap.
- Pure client-side, reuses cached price series.

### PR 6 — Scenario analysis (Premium)
- New `/(tabs)/insights/scenario` modal route.
- "Add hypothetical position" UI → mutated-weights → live risk-metric recompute.
- Reuses `portfolioMath.ts`. On-demand chart fetch for novel tickers.
- `<PremiumGate feature="scenario_analysis">` wrap.

### PR 7 — Monte Carlo (Premium)
- Edge function `POST /api/insights/monte-carlo`.
- New `monte_carlo_cache` table.
- Mobile UI: input years / contribution / withdrawal, output is fan chart with p10/p50/p90 + survival probability.
- Disclaimer copy reviewed before ship.
- `<PremiumGate feature="monte_carlo">` wrap.

### PR 8 — Tax-loss harvesting (Premium, US-only v1)
- New `tax_jurisdiction` field on user profile, default `US`.
- Edge function `POST /api/insights/tax-loss-scan` — wash-sale-aware lot scanner.
- UI: card listing harvestable lots, with disclaimer header. Phrasing reviewed by legal.
- Hidden from non-US users in v1 (show "Tax features available for US-based accounts" stub).
- `<PremiumGate feature="tax_lot_view">` wrap (re-purpose existing key).

### PR 9 — Target allocation UI (Pro)
- Per-holding and per-sector target % entry.
- Stored in `allocation_targets(user_id, kind, key, target_pct)`.
- Drift display on Insights — informational, no suggestions yet.

### PR 10 — Rebalancing suggestions (Premium)
- On top of PR 9 targets — list trades to bring drift under threshold.
- Tax-aware: prefer harvesting losses to rebalance when both are needed.
- `<PremiumGate feature="rebalancing_suggestions">` wrap.

### PR 11 — Full brief archive (Premium)
- Remove 30-day retention filter for Premium tier.
- New "Past briefs" view with date picker.
- `<PremiumGate feature="full_brief_archive">` wrap.

**Sequencing flexibility:** PR 1 and PR 2 are non-negotiable foundations. PRs 3–11 can re-order based on PR 1 telemetry. My current best guess at priority is the listed order, but if `correlation_matrix` outranks `dividend_calendar` in impressions, swap PR 3 and PR 5.

---

## 7. Open questions

1. **Re-tiering Pro features.** Moving `dividend_calendar` and `geo_currency_exposure` from Premium → Pro and splitting CSV is a real change to the value prop. Existing Premium subscribers won't lose anything (Pro features are included), but the marketing positioning shifts. OK to do at the same time as 3.4 launch, or do we want a separate comms beat?

2. **Tax jurisdiction default.** Defaulting to `US` for tax features means Swedish users see no tax UI until they change a setting they don't know exists. Alternative: detect from currency/locale and warn "tax features not available for your region." Preference?

3. **Monte Carlo disclaimer.** Worth a 30-min legal review specifically on the simulation copy before PR 7 ships. Who owns that — eng + product, or do we loop in counsel?

4. **Holdings entry vs. broker import.** Manual entry is fine for v1 but the conversion drop-off on "type in 30 holdings" will be brutal. Plaid Investments / SnapTrade integration is a Phase 4 candidate; want to scope it now or wait for usage data?

5. **Snapshot history backfill.** New holdings on the day a user adds them have no historical chart. Two options: (a) snapshot starts the day they add the holding, "your portfolio chart starts here," or (b) backfill 1Y by reverse-applying current weights to historical prices and label as "modeled, current weights only." (a) is honest; (b) is more impressive day one. I lean (a) — (b) is the same kind of weight-stationarity lie that Phase 2 benchmark comparison flagged.

6. **Re-purposing `tax_lot_view` enum key.** I want to fold the standalone "tax lot view" into the harvesting feature. Easier to keep the key (since it's already in the enum and may already have impression telemetry) than to add a new one. Confirm.

---

*Stop here for review. No code until §3 tier assignments and §4 architecture decisions are signed off, and PR 1 is shipped to gather the telemetry the rest of the sequencing depends on.*
