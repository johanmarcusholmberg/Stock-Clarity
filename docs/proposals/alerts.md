# News & Earnings Alerts — Design Proposal (2026-04-25)

Scope: Phase 3.3 — extend the alert system beyond price thresholds so a user with `AAPL` in a watchlist or portfolio gets pushed when (a) a high-impact news story mentions it or (b) it's about to report earnings (or just did). Builds on Phase 2 (price alerts) and Phase 3.2 (news pre-load), reuses every piece of plumbing already on disk.

Tracked files:
- [artifacts/api-server/src/lib/alertEvaluator.ts](artifacts/api-server/src/lib/alertEvaluator.ts) — current price-alert worker (the pattern we extend, not replace)
- [artifacts/api-server/src/lib/alertsSchema.ts](artifacts/api-server/src/lib/alertsSchema.ts) — `alerts` / `alert_events` / `expo_push_tokens` / `service_heartbeats` tables
- [artifacts/api-server/src/lib/newsPreloadWorker.ts](artifacts/api-server/src/lib/newsPreloadWorker.ts) — 15-min news ingest into `news_cache`, the trigger source for news alerts
- [artifacts/api-server/src/lib/newsCache.ts:75](artifacts/api-server/src/lib/newsCache.ts:75) — impact-scored news rows we filter on
- [artifacts/api-server/src/lib/pushDelivery.ts](artifacts/api-server/src/lib/pushDelivery.ts) — Expo push sender
- [artifacts/api-server/src/routes/stocks.ts:38](artifacts/api-server/src/routes/stocks.ts:38) — Yahoo chart fetch (where we'll bolt on `quoteSummary?modules=calendarEvents` for earnings dates)
- [artifacts/api-server/src/routes/watchlist.ts:11](artifacts/api-server/src/routes/watchlist.ts:11) — `users.watchlist_data` JSONB (the auto-subscribe set)
- [artifacts/mobile/services/NotificationService.ts](artifacts/mobile/services/NotificationService.ts) — local digest scheduler with a `NotificationPrefs` blob (opt-in plumbing we'll re-use, not replace)

---

## 1. Current state (audit findings)

### 1.1 Alert evaluator already exists — but only for prices

Phase 2 shipped a working in-process evaluator at [alertEvaluator.ts](artifacts/api-server/src/lib/alertEvaluator.ts). It:

- Ticks every 60s from a `setTimeout` loop in [index.ts:53](artifacts/api-server/src/index.ts:53).
- Reads `alerts WHERE status='active'`, fetches a quote per unique symbol, evaluates a small predicate (`price_above` / `price_below` / `pct_change_day`) with re-cross + cooldown bookkeeping.
- Delivers via `sendExpoPush` ([pushDelivery.ts:20](artifacts/api-server/src/lib/pushDelivery.ts:20)) — which posts to `https://exp.host/--/api/v2/push/send`. Email is logged as `email:queued` and a real sender hasn't been wired yet.
- Heartbeats into `service_heartbeats` so the mobile Alerts tab can show a "delayed" banner if the evaluator stops ([alerts.tsx:88](artifacts/mobile/app/(tabs)/alerts.tsx:88)).
- Gated per-user by `alertsEnabledFor()` → hash bucket vs `ALERTS_ROLLOUT_PCT` ([featureFlags.ts:29](artifacts/api-server/src/lib/featureFlags.ts:29)).

The schema we'll extend ([alertsSchema.ts:13](artifacts/api-server/src/lib/alertsSchema.ts:13)) is built around a `(user_id, symbol, type, threshold)` quad — designed for *user-set numeric thresholds*. News and earnings alerts have **no threshold**: they're "ping me if X happens to a stock I care about." Forcing them through `alerts` would mean dummy thresholds and meaningless `last_side` rows. New table — see §3.

### 1.2 Watchlists / portfolios live in a single JSONB blob

[watchlist.ts:7](artifacts/api-server/src/routes/watchlist.ts:7) reads/writes `users.watchlist_data` as one opaque JSONB column. Same shape used for both watchlist and portfolio tickers — already the canonical "stocks the user cares about." The news pre-load worker normalises it on every tick ([newsPreloadWorker.ts:21](artifacts/api-server/src/lib/newsPreloadWorker.ts:21)) — we'll lift the same query.

There's no per-(user, symbol) opt-in row anywhere today. Subscribing to news/earnings has to be derived ("everything in your watchlist") with explicit per-symbol mute as the override.

### 1.3 News pipeline is the trigger we want

Phase 3.2 shipped:
- `news_cache` (id, symbol, url_hash UNIQUE, title, publisher, published_at, source, impact_score 0..100) — populated every 15 min by `newsPreloadWorker.tick()` for the global active-stocks union ([newsPreloadWorker.ts:90](artifacts/api-server/src/lib/newsPreloadWorker.ts:90)).
- Heuristic impact scoring ([newsImpact.ts](artifacts/api-server/src/lib/newsImpact.ts)) — already classifies "earnings" / "M&A" / "FDA" / "downgrade" / etc. via keyword buckets. A score ≥60 is a strong "this matters" signal in current rankings.
- `briefs` table — daily/weekly AI summaries per symbol. Not the right granularity for an alert (one row per day, not per story), but the same `model_version` / `cost_usd` plumbing transfers cleanly to per-alert summarisation.

**This is the trigger source.** A news alert is "a `news_cache` row was inserted with `impact_score >= N` for a symbol I subscribe to." No separate fetch needed — the pre-load worker is doing the fetch, and we run inside the same tick.

### 1.4 No earnings calendar exists today

Grep for `earnings` under `artifacts/api-server/src` returns only news-classifier mentions (keyword scoring) and AI-prompt examples — **no earnings-calendar fetcher, no `earnings_calendar` table, no schedule table**. The mobile `EventCard.tsx` has an "earnings" event type ([EventCard.tsx:14](artifacts/mobile/components/EventCard.tsx:14)) but it's a free-text label on a news event, not a structured date.

Yahoo's `quoteSummary?modules=calendarEvents` returns `earnings.earningsDate[]` as Unix timestamps — same auth (`yfCrumb`) we already use in [newsSources.ts:24](artifacts/api-server/src/lib/newsSources.ts:24). One new fetch per active symbol per day is cheap.

### 1.5 Push delivery works; email delivery does not (yet)

- **Push:** `sendExpoPush` ([pushDelivery.ts:20](artifacts/api-server/src/lib/pushDelivery.ts:20)) is live. Expo tokens are registered per device via [pushTokens.ts](artifacts/api-server/src/routes/pushTokens.ts) — already idempotent on `(token)` and tied to a Clerk user id.
- **Email:** the alert evaluator returns `"email:queued"` and writes nothing — there is no email worker that consumes it ([alertEvaluator.ts:198](artifacts/api-server/src/lib/alertEvaluator.ts:198)). Phase 2 left this as TODO.
- **In-app:** `alert_events` is the inbox today. The mobile Alerts tab reads it via `/alerts/:userId/events`. Reusing this table for news/earnings firings means the existing UI shows them with one switch flip.

### 1.6 user_events / stock_views

- `user_events` (user_id, event_type, payload jsonb, ip, ua, created_at) — append-only ([analytics.ts:24](artifacts/api-server/src/routes/analytics.ts:24)). Same pattern Phase 3.1 used for `grant_expiry_warned` ([grantExpiryWarningWorker.ts:60](artifacts/api-server/src/lib/grantExpiryWarningWorker.ts:60)). Good place for "I sent this notification" telemetry.
- `stock_views` (user_id, ticker, stock_name, session_id, created_at) — used by the news worker to widen the active-stocks set to recently-viewed (not just watchlist). We'll inherit that — a user who hasn't watchlisted `NVDA` but checked it three times in a week probably wants its earnings ping.
- **No notification table exists** beyond `alert_events`. We're either reusing it (one extra `kind` column, since `alert_events.alert_id` FKs to `alerts.id`) or adding a sibling. §3 picks the sibling — `alert_events` is tightly bound to the price-alerts `alerts` table and dragging news/earnings rows in there breaks the FK contract.

### 1.7 Local-only "NotificationPrefs" blob — don't be misled

[NotificationService.ts:16](artifacts/mobile/services/NotificationService.ts:16) defines a `NotificationPrefs` shape with an `alertTypes` enum (`large_movement | volume_spike | price_target | market_open_close`). This is **AsyncStorage-only**, **digest-only**, and the enum is unused for evaluation — it's a legacy taxonomy from before Phase 2 alerts existed. Don't reuse it; we'll add server-side preferences in `subscriptions` (§3).

---

## 2. Proposed architecture — trigger → evaluate → deliver

```
┌────────────────────┐   inserts new rows    ┌──────────────────────┐
│ newsPreloadWorker  │──────────────────────▶│      news_cache      │
└────────────────────┘                       └──────────┬───────────┘
                                                        │ (a) high-impact rows
                                                        ▼
┌────────────────────┐   T-1 / T-0 / T+1     ┌──────────────────────┐
│ earningsCalendar   │──────────────────────▶│  earnings_calendar   │
│      worker        │                       └──────────┬───────────┘
└────────────────────┘                                  │ (b) date-window match
                                                        ▼
                                              ┌─────────────────────┐
   subscriptions ──────────────────────────▶  │  notifyEvaluator    │
   (per user × symbol × kind, opt-in)         │  (in-process tick)  │
                                              └──────────┬──────────┘
                                                         │ writes
                                                         ▼
                                              ┌─────────────────────┐
                                              │ notification_events │ ─┐
                                              └──────────┬──────────┘  │
                                                         │             │
                                              push ◀────┤ delivery    │
                                              email queued (Phase 3.4) │
                                              in-app inbox ◀──────────┘
```

Key properties:

- **Same in-process worker pattern as `startAlertEvaluator` and `startNewsPreloadWorker`.** New worker `startNotifyEvaluator()` spawned from [index.ts](artifacts/api-server/src/index.ts), 60s tick, heartbeats into `service_heartbeats` under `service='notify_evaluator'`. No new infra.
- **Two trigger sources, one evaluator.** News alerts piggyback on the news worker's writes; earnings alerts piggyback on a separate daily fetch. The evaluator joins them against `subscriptions` and de-dupes.
- **Two cursors, persisted, never replayed.** The evaluator processes `news_cache.id > last_news_cursor` and `earnings_calendar` rows whose `event_window` opens in the next tick. Idempotent: re-runs are no-ops via the cursor and a `(subscription_id, source_id)` UNIQUE on `notification_events`.
- **Threshold lives in user prefs, not in code.** Per-user `subscriptions.min_impact_score` (default 60) for news; earnings windows are global (T-1 day, T-day open, T-day close).
- **Quiet hours + daily cap on user, not on subscription.** Killing engagement with 12 dings in a row is the easy way to lose a permission. Cap = 5 push/user/day for news, no cap for earnings (rare events).

### 2.1 Why a new worker instead of merging into `alertEvaluator`

The price evaluator runs every 60s and burns Yahoo bandwidth on quotes. The notify evaluator's news side runs *after* `newsPreloadWorker.tick()` finishes (every 15 min) — we don't want it on a 60s loop or it polls `news_cache` for nothing 14 out of 15 ticks. The earnings side ticks once per day. Two cadences in one worker is awkward.

Cleaner: `notifyEvaluator` ticks every 60s but does almost nothing most ticks — it just checks the `news_cache.id` cursor and the next-earnings-window. Cheap.

Open to consolidating later if the codebase tells us the workers are duplicating — but day one, three independent workers (price / news preload / notify) is simpler than one worker with three internal cadences.

---

## 3. Schema

Three additions. `CREATE TABLE IF NOT EXISTS` on module load — same `notifySchemaReady` pattern as [alertsSchema.ts](artifacts/api-server/src/lib/alertsSchema.ts) and [newsSchema.ts](artifacts/api-server/src/lib/newsSchema.ts).

```sql
-- (1) Per-user subscription. Row = "I want X kind of pings for symbol Y".
-- Auto-populated from watchlist_data on first tick after a user sees the
-- "Notifications" sheet; deletable per-row to mute one stock; updatable to
-- raise/lower min_impact_score globally per user via a NULL symbol row
-- (sentinel "all symbols at this user's defaults").
CREATE TABLE IF NOT EXISTS notify_subscriptions (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            TEXT NOT NULL,                 -- Clerk user id
  symbol             TEXT,                          -- NULL = user-default row
  kind               TEXT NOT NULL CHECK (kind IN ('news','earnings')),
  status             TEXT NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','muted')),
  min_impact_score   SMALLINT,                      -- news only; NULL on earnings rows
  delivery_channel   TEXT NOT NULL DEFAULT 'push'
                     CHECK (delivery_channel IN ('push','email','both')),
  quiet_start_hour   SMALLINT,                      -- 0..23 in user's tz; NULL=no quiet hours
  quiet_end_hour     SMALLINT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, symbol, kind)
);
CREATE INDEX notify_sub_user_idx     ON notify_subscriptions (user_id) WHERE status = 'active';
CREATE INDEX notify_sub_symbol_idx   ON notify_subscriptions (symbol, kind) WHERE status = 'active' AND symbol IS NOT NULL;

-- (2) Earnings calendar. One row per (symbol, expected_at). Refreshed daily
-- by the earningsCalendar worker. expected_at is Yahoo's earningsDate[0]
-- (some symbols have a date range, in which case we take the start).
CREATE TABLE IF NOT EXISTS earnings_calendar (
  id           BIGSERIAL PRIMARY KEY,
  symbol       TEXT NOT NULL,
  expected_at  TIMESTAMPTZ NOT NULL,
  is_estimated BOOLEAN NOT NULL DEFAULT FALSE,      -- TRUE when only a date range was returned
  fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (symbol, expected_at)
);
CREATE INDEX earnings_cal_window_idx ON earnings_calendar (expected_at);
CREATE INDEX earnings_cal_symbol_idx ON earnings_calendar (symbol, expected_at DESC);

-- (3) Notification firings. Sibling of alert_events (NOT a replacement —
-- alert_events FKs to alerts.id and price firings keep going there).
-- One row per (subscription, source). Source = news_cache.id for news,
-- earnings_calendar.id + window-tag for earnings.
CREATE TABLE IF NOT EXISTS notification_events (
  id              BIGSERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  subscription_id UUID NOT NULL REFERENCES notify_subscriptions(id) ON DELETE CASCADE,
  symbol          TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('news','earnings_t1','earnings_open','earnings_after')),
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('news_cache','earnings_calendar')),
  source_id       BIGINT NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT NOT NULL,
  fired_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivered_via   TEXT,
  UNIQUE (subscription_id, source_kind, source_id, kind)
);
CREATE INDEX notification_events_user_idx ON notification_events (user_id, fired_at DESC);
```

Key properties:

- **`notify_subscriptions.symbol` nullable**: a NULL row per user is "your default settings for stocks you haven't custom-tuned." Per-symbol rows (e.g., `(user, AAPL, news, min_impact_score=80)`) override. Mute = `status='muted'` row, not delete (so unmuting = flip back, no data loss).
- **`UNIQUE (user_id, symbol, kind)`** — one rule per `(user, symbol, kind)`. Watchlist auto-subscribe inserts these en masse on a feature-flag-flip; a future `DELETE` in the UI removes only the auto row, but the user-default row stays.
- **`UNIQUE (subscription_id, source_kind, source_id, kind)`** on `notification_events` — re-running the evaluator never double-sends. The `kind` column distinguishes `earnings_t1` / `earnings_open` / `earnings_after` for the same `earnings_calendar.id`.
- **`alert_events` is untouched.** Price alerts keep going there. The mobile Alerts tab will need to UNION the two tables — covered in PR 5.

Storage estimate:
- `earnings_calendar`: ~1,500 active symbols × 4 quarters/yr = 6,000 rows/yr. Negligible.
- `notification_events`: bounded by daily cap × users. At 2,000 users × 5 news/day × 365 ≈ 3.6M rows/yr — ~600 MB before pruning. Recommend retention: keep 90 days hot, prune older (`DELETE WHERE fired_at < NOW() - INTERVAL '90 days'` nightly, batched).

---

## 4. Alert types in scope

### 4.1 News mentions (in scope, MVP)

**Trigger:** `news_cache` row inserted with `impact_score >= subscription.min_impact_score` (default 60).
**Fan-out:** join `news_cache` rows after the cursor against `notify_subscriptions WHERE kind='news' AND status='active'`. Resolve subscription = exact symbol match if present, else the user's NULL-symbol default if active, else nothing.
**Body:** publisher + title, truncated. *No AI summary in v1* — see §6 for cost reasoning.
**Cap:** 5 pushes/user/24h, sliding window. Excess silently absorbed (still written to `notification_events` with `delivered_via='suppressed:cap'` so the in-app inbox shows them; only the push is dropped).
**Quiet hours:** if `now` (in user's tz, derived from device locale at registration time, fall back to UTC) is inside `[quiet_start_hour, quiet_end_hour]`, defer to the boundary — single rolled-up "3 stories overnight" message at quiet_end. (V1: just suppress; rollup is Phase 3.4.)

### 4.2 Earnings dates (in scope, MVP — three windows)

For every symbol with an `earnings_calendar` row whose `expected_at` is in the future:

- **`earnings_t1`** — fired at `expected_at - 24h ± evaluator tick`. Body: "AAPL reports earnings tomorrow at 16:30 ET."
- **`earnings_open`** — fired at the local market open *of* `expected_at`. Body: "AAPL reports today after the close — consensus EPS $X" if estimates available; else "AAPL reports today."
- **`earnings_after`** — fired up to 4h after the local close *of* `expected_at`, gated on a `news_cache` row with `impact_score >= 60` containing keywords from the `earnings` bucket (already in [newsImpact.ts:56](artifacts/api-server/src/lib/newsImpact.ts:56)). Body: title of that news row + "tap for details."

This three-window split is the minimum that's actually useful — a single "AAPL reports today" ping is information-poor; we pay the build cost for three for free because the worker already runs daily.

Estimates (consensus EPS, revenue) are nice-to-have but Yahoo's calendar endpoint provides them inconsistently. Treat as opportunistic: include when present, omit when not. Don't block the alert on having them.

### 4.3 Price thresholds (already shipped — out of scope)

Phase 2 handled this. Mentioning here for completeness: `alerts` + `alert_events` stay where they are, the price worker keeps running, and the mobile Alerts tab will UNION the price firings with the new notification firings (PR 5).

### 4.4 Explicitly out of scope

- **Volume spikes / breakouts / pattern detection.** [audits/alerts.md:50](docs/audits/alerts.md:50) called these out as deprecated. Not bringing them back.
- **SEC filings / 13F.** Different feed (EDGAR), different cadence, different scoring. Phase 4 if signal demands it.
- **Insider transactions, dividend ex-dates.** Same.
- **Push throttling for price alerts.** Phase 2 left price firings uncapped because they're user-set thresholds — the user explicitly asked for those. Don't change that; only news is capped.

---

## 5. Delivery mechanisms + opt-in/opt-out model

### 5.1 Channels

| Channel | Status | Notes |
|---|---|---|
| **Push (Expo)** | Live — `sendExpoPush` ([pushDelivery.ts:20](artifacts/api-server/src/lib/pushDelivery.ts:20)). Reuse as-is. | `data.kind = 'news_alert' \| 'earnings_alert'` so the client deep-links into the right screen. |
| **Email** | Stubbed (`email:queued` in alertEvaluator). No real sender yet. | Recommend deferring real email send to a Phase 3.4 ticket — same shared email worker the spec already anticipates. Notify evaluator writes `delivered_via='email:queued'` until then; nothing breaks. |
| **In-app inbox** | New — Alerts tab shows `notification_events` UNION `alert_events`. | One read of two tables, ordered by `fired_at DESC`. |

### 5.2 Opt-in model

Three layers, in priority order:

1. **OS permission** (push only) — already requested via `registerForAlerts` ([pushRegistration.ts:13](artifacts/mobile/services/pushRegistration.ts:13)). Asked once on first sign-in, swallowed silently if denied. No change.
2. **Feature opt-in** — first time a user opens the Alerts tab after this feature ships, a one-time sheet asks: "Get pinged when the news matters? [Yes, both news + earnings] [Just earnings] [Off]." Choice writes a `notify_subscriptions` row with `symbol=NULL` (user-default). No sheet on subsequent launches; toggleable from Account → Notifications.
3. **Per-stock opt-out** — bell icon on `/stock/[ticker]` opens a sheet with three rows: Price alerts (existing), News alerts, Earnings alerts. Each toggleable independently. The toggle inserts/updates a `notify_subscriptions` row for that symbol; default is "follow user-default."

Auto-subscribe on watchlist add: only triggers the user-default. Watchlisting `NVDA` doesn't write 1 row per `(user, NVDA, news)` and 1 per `(user, NVDA, earnings)` — those are *implicitly* covered by the user-default row. Per-symbol rows exist only when the user has overridden the default. Keeps the table small.

Explicit mute: a mute on `NVDA` is `(user_id, 'NVDA', 'news', status='muted')`. The evaluator looks up the per-symbol row first; if it's `muted`, skip; if no per-symbol row, fall through to user-default.

### 5.3 Daily cap + rollup

Cap on `(user_id, kind='news')`: 5 pushes per rolling 24h window. Implementation: `SELECT COUNT(*) FROM notification_events WHERE user_id=$1 AND kind='news' AND fired_at > NOW() - INTERVAL '24 hours' AND delivered_via NOT LIKE 'suppressed:%'`. Cheap with the user-idx.

Rollup (Phase 3.4): if a user is over cap or in quiet hours, group suppressed firings into a single "5 stories about NVDA, AAPL, MSFT in the last 4 hours" push at the boundary. V1 just suppresses. Don't ship rollup in 3.3 unless the dashboard says we need it.

### 5.4 Telemetry

Every firing writes a `user_events` row with `event_type IN ('news_alert_sent','earnings_alert_sent','notification_suppressed_cap','notification_suppressed_quiet_hours')`. Lets us answer "how many people are hitting the cap" and "did 3.3 boost retention" without a custom dashboard.

---

## 6. Cost / volume estimate

### 6.1 No AI on the hot path in v1

The news pre-load worker already pays for impact scoring (heuristic, $0). News alerts reuse those scores — **no incremental LLM call per alert**.

The temptation: AI-summarise the news story so the push body is "AAPL: Services revenue beat by 7% — Reuters" instead of just "AAPL: Apple beats Q2 earnings — Reuters." Cost shape if we did:

- 1,500 active symbols × ~3 high-impact stories/day = 4,500 LLM calls/day at GPT-4o-mini ~$0.0002/call ≈ **$0.90/day, $330/yr**.
- Per-user fan-out doesn't add cost (one summary per news_cache row, reused for every subscriber).

That's affordable but not free. **Recommend: ship v1 with raw title + publisher.** The existing `briefs` daily summary already gives users the AI take when they open the stock. If 30-day analytics show low CTR on the push, add a per-news-row summary in PR 6 — incremental, gated, easy to roll back.

### 6.2 Yahoo bandwidth budget

- News: zero new fetches. Pre-load worker already covers this.
- Earnings calendar: 1,500 active symbols × 1 fetch/day = 1,500 calls/day. Yahoo's rate limit is forgiving; concurrency-cap at 5 (same as news worker) means ~5 min for the daily refresh. Cheap.
- Per-tick evaluator: zero. Reads two cursors from Postgres only.

### 6.3 Push delivery

Expo Push is free up to 600 messages/sec. Current ceiling: 2,000 users × 5 news/day = 10,000 push/day average — well under any limit.

---

## 7. PR breakdown

Same numbered-PR pattern as [premium-gating.md](docs/proposals/premium-gating.md) and [admin-subscriptions.md](docs/proposals/admin-subscriptions.md). Each PR is independently reviewable and behind a single feature flag `NOTIFY_ROLLOUT_PCT` (default 0; ramp 10 → 50 → 100).

### PR 1 — Schema + earnings calendar fetcher (no client change)
- New `notifySchema.ts` with the three tables from §3.
- New `earningsCalendarWorker.ts`: daily tick (06:00 UTC), pulls `quoteSummary?modules=calendarEvents` for the same active-stocks union the news worker uses. UPSERTs into `earnings_calendar`. Schedule from [index.ts](artifacts/api-server/src/index.ts).
- New `notifyEvaluator.ts` skeleton with no-op tick + heartbeat (so the dashboard can show health from day one).
- Gated on `NOTIFY_ENABLED=false` in prod until staging confirms a clean week.

### PR 2 — Notify evaluator: news side
- Implement the news cursor (`SELECT MAX(id) FROM news_cache` at startup, advance per tick).
- Join `news_cache` rows past the cursor against `notify_subscriptions` (incl. user-default fallback).
- Apply per-user daily cap + quiet hours.
- Write `notification_events` rows; deliver via `sendExpoPush`.
- Server-only — no client change. End-to-end testable via the existing `news_cache` test fixtures + a few seeded subscriptions in staging.

### PR 3 — Notify evaluator: earnings side
- T-1 / T-open / T-after window logic.
- Resolve "after-close news" gate: `WHERE symbol=$1 AND published_at > $expected AND impact_score >= 60 AND title ~* '(earnings|eps|revenue|beats?|miss(?:es|ed)?)'`.
- Same delivery path as PR 2.

### PR 4 — Subscription API
- `GET /api/notify/subscriptions/:userId` — list (incl. resolved per-symbol rules).
- `POST /api/notify/subscriptions/:userId` — create or update.
- `PATCH /api/notify/subscriptions/:userId/:subId` — mute / unmute / change channel.
- `DELETE /api/notify/subscriptions/:userId/:subId` — fall back to user-default.
- `GET /api/notify/events/:userId` — read `notification_events` (mobile in-app inbox).

### PR 5 — Mobile UI
- Add News / Earnings toggles to the existing `AlertSetupSheet` ([AlertSetupSheet.tsx:33](artifacts/mobile/components/AlertSetupSheet.tsx:33)). Per-stock bell now configures all three channels.
- Account → Notifications screen with user-default sliders (impact score, quiet hours, daily cap target, on/off per kind).
- Alerts tab UNION's `alert_events` and `notification_events`, grouped by symbol.
- First-time sheet (§5.2 layer 2).

### PR 6 — Telemetry dashboard + rollout to 100%
- Admin dashboard panel: alerts sent / suppressed by reason / CTR (using `user_events`).
- Flip `NOTIFY_ROLLOUT_PCT=100`.
- Re-evaluate the "no AI summary" decision against measured CTR — if push tap-through is <10%, queue up the summary upgrade as a follow-up.

### Optional — PR 7 (only if PR 6 says yes)
- Per-news-row AI summary, cached on `news_cache.summary` (new column). Bumps push body quality. ~$330/yr at current symbol count.

---

## 8. Open questions

1. **Two workers or one?** §2.1 argues for a separate `notifyEvaluator`. Alternative: extend the existing `alertEvaluator` and let it route by `alerts.type IN ('news','earnings_t1',...)`. Counter-argument: the price evaluator's quote-fetching tick shape doesn't fit news/earnings. Sticking with separate unless review pushes back.

2. **User-default row semantics.** §3 proposes a `(user_id, symbol=NULL, kind)` sentinel. Alternative: a separate `notify_user_prefs` 1:1 table. The sentinel keeps everything in one table at the cost of one nullable column; the separate table is more normalised. Sentinel is cheaper to query — recommend keep, but flag for review.

3. **Quiet hours timezone.** Mobile sends `Intl.DateTimeFormat().resolvedOptions().timeZone` on `pushTokens` registration — store on the row? Or store a numeric offset on `notify_subscriptions`? Time zones change (DST) — recommend storing the IANA name on `expo_push_tokens` (one column add) and resolving at evaluator time.

4. **News-alert summary vs raw title.** §6.1 recommends raw v1, AI in PR 7 if CTR demands. Accept that or front-load the cost?

5. **Earnings estimates (consensus EPS).** Yahoo's `quoteSummary?modules=earnings` returns `earningsChart.currentQuarterEstimate` — generally reliable for US, spotty for OMX/LSE. Include opportunistically; do not block the alert. Confirm this is the right call for international users (75% of our universe is non-US).

6. **What happens to `users.watchlist_data` removal.** If a user removes `NVDA` from their watchlist, do their per-symbol `notify_subscriptions` rows for NVDA stay or get cascaded? Recommend stay — removal from watchlist often just means "I'm not actively tracking" not "I don't want alerts." Add an explicit "Notifications" row to the unsubscribe flow on watchlist remove. Confirm.

7. **Premium gating.** Phase 3.4 gates "full historical brief archive" as Premium. Are any of these alert kinds Premium-tier? News alerts feel like a clear Free retention play; earnings alerts ditto. Recommend: keep all of 3.3 in Free tier. The Premium hook is "configure quiet hours / advanced rules / unlimited daily cap" in 3.4. Confirm.

---

*Stop here for team review. No implementation until schema, the trigger-source split, and the opt-in model (auto-subscribe via watchlist + user-default sentinel + per-symbol overrides) are signed off.*
