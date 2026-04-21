# News Pre-loading & Briefs — Design Proposal (2026-04-21)

Scope: Phase 3 item 5 — kill the cold-open wait on Recent News and daily/weekly briefs by pre-fetching news for the active-stocks universe every 15 min, and pre-baking AI briefs on a much lower cadence.

Tracked files:
- [artifacts/api-server/src/routes/stocks.ts:338](artifacts/api-server/src/routes/stocks.ts:338) — `/api/stocks/events/:symbol` (current on-demand fetch + AI summarisation)
- [artifacts/api-server/src/routes/stocks.ts:178](artifacts/api-server/src/routes/stocks.ts:178) — `fetchGoogleNewsRSS`, reused by the worker
- [artifacts/api-server/src/lib/alertEvaluator.ts](artifacts/api-server/src/lib/alertEvaluator.ts) — the "in-process worker" pattern we're copying
- [artifacts/api-server/src/routes/analytics.ts:16](artifacts/api-server/src/routes/analytics.ts:16) — `stock_views` writes (feeds "viewed in last 7d")
- [artifacts/api-server/src/routes/watchlist.ts:11](artifacts/api-server/src/routes/watchlist.ts:11) — `users.watchlist_data` JSONB (portfolio + watchlist union)

---

## 1. Where we are today

- News and events are fetched **on-demand per stock page open**. The `/events/:symbol` route at [stocks.ts:338](artifacts/api-server/src/routes/stocks.ts:338) fetches Yahoo + Google News in parallel, dedups by title overlap, and fires one GPT-4o-mini call to filter/group/summarise. Result cached in-process for 20 min / 4 hr / 12 hr depending on period.
- Briefs don't exist. `grep -ri brief artifacts/api-server/src` returns zero.
- First-open latency on a cold cache is ~6–12 s (dominated by the serial news fetch + LLM). That's the wait we're killing.
- Cache is a `new Map()` in a single process — any restart or second node cold-starts from scratch.

Infrastructure we can lean on:
- A working in-process worker: `startAlertEvaluator` in [index.ts:50](artifacts/api-server/src/index.ts:50) is a `setTimeout` loop sharing `db.ts` with the HTTP server. Copy it.
- All active-stock inputs already in Postgres: `users.watchlist_data` (portfolio + watchlist, same JSONB shape) and `stock_views` (views). No new tracking to add.
- `isInRollout` at [featureFlags.ts:19](artifacts/api-server/src/lib/featureFlags.ts:19) for gradual rollout.

## 2. The "active stock" set

Two sets, derived on every worker tick:

```sql
-- Per-user active stocks
WITH user_tickers AS (
  SELECT DISTINCT u.clerk_user_id AS user_id, UPPER(ticker) AS symbol
    FROM users u
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.watchlist_data, '[]'::jsonb)) f
    CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(f->'tickers', '[]'::jsonb)) ticker
   WHERE u.watchlist_data IS NOT NULL
  UNION
  SELECT DISTINCT user_id, UPPER(ticker) AS symbol
    FROM stock_views
   WHERE user_id IS NOT NULL
     AND created_at > NOW() - INTERVAL '7 days'
)
SELECT user_id, symbol FROM user_tickers;
-- Global union: SELECT DISTINCT symbol FROM user_tickers;
```

Cardinality budget: 1,500 symbols global union over the next 6 months (watchlists cap ~50/user, 7-day views ~20/user distinct). Worker cost numbers below assume that ceiling. No materialised cache until `EXPLAIN ANALYZE` says the live query breaks 500 ms.

## 3. Schema

Two new tables, `CREATE TABLE IF NOT EXISTS` on module load, same pattern as [alertsSchema.ts](artifacts/api-server/src/lib/alertsSchema.ts).

```sql
CREATE TABLE IF NOT EXISTS news_cache (
  id            BIGSERIAL PRIMARY KEY,
  symbol        TEXT NOT NULL,
  url_hash      TEXT NOT NULL,   -- sha1(normalised URL); falls back to sha1(publisher||title) for Google redirects
  url           TEXT NOT NULL,
  title         TEXT NOT NULL,
  publisher     TEXT NOT NULL,
  published_at  TIMESTAMPTZ NOT NULL,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source        TEXT NOT NULL,   -- 'yahoo' | 'google_rss'
  impact_score  SMALLINT,        -- 0..100, NULL until scored
  UNIQUE (symbol, url_hash)
);
CREATE INDEX news_cache_symbol_pub_idx ON news_cache (symbol, published_at DESC);
CREATE INDEX news_cache_impact_idx     ON news_cache (symbol, impact_score DESC, published_at DESC)
  WHERE impact_score IS NOT NULL;

CREATE TABLE IF NOT EXISTS briefs (
  id              BIGSERIAL PRIMARY KEY,
  symbol          TEXT NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('daily','weekly')),
  period_date     DATE NOT NULL,  -- trading day for daily; Saturday anchor for weekly
  summary         TEXT NOT NULL,
  bullets         JSONB NOT NULL DEFAULT '[]'::jsonb,
  model_version   TEXT NOT NULL,  -- e.g. 'gpt-4o-mini@2025-08-08'
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_news_ids  BIGINT[],       -- trace of news_cache rows consumed
  UNIQUE (symbol, kind, period_date)
);
CREATE INDEX briefs_symbol_kind_date_idx ON briefs (symbol, kind, period_date DESC);
```

Key properties:
- `(symbol, url_hash)` UNIQUE makes ingest idempotent — two overlapping workers never double-insert.
- `impact_score` nullable so scoring can run independently of ingest (see §4).
- `(symbol, kind, period_date)` UNIQUE on `briefs` is our "don't regenerate more than once per period" mechanical guarantee — nothing in prose to enforce.
- `input_news_ids BIGINT[]` gives us a trace for "why does this brief look wrong?" without brittle free-text matching.

## 4. Worker architecture

Single in-process worker started from `index.ts` alongside the alerts evaluator:

```ts
// artifacts/api-server/src/lib/newsPreloadWorker.ts (new)
export async function startNewsPreloadWorker(): Promise<void> { … }
```

Three independent phases, each idempotent:

| Phase | Cadence | Cost shape | Work per symbol |
|---|---|---|---|
| 1. News ingest | 15 min | Yahoo + Google RSS, ~200 ms/symbol, no LLM | Fetch both sources, upsert into `news_cache` via UNIQUE |
| 2. Impact scoring | 15 min, after phase 1 | Heuristic (source weight + keyword list + 7-day novelty); $0 | Score rows with `impact_score IS NULL` from the last 48 h |
| 3. Brief generation | Daily ~market close + Saturday 06:00 UTC | One LLM call per `(symbol, kind)` | Pull top 10 news by impact from the period, call GPT-4o-mini, insert via UNIQUE |

Daily briefs fire after local market close, not a global UTC time — summarising mid-session data produces a bad narrative. Simple per-exchange lookup table (NY/NASDAQ 21:30 UTC, OMX 17:30 CET, LSE 17:00 BST, default 22:00 UTC) based on Yahoo's `fullExchangeName` already on the quote.

### Cost guardrails

- Phase 1 + 2: $0 (no LLM).
- Phase 3: GPT-4o-mini at ~$0.0002/brief. Daily × 1,500 symbols × 365 ≈ **$110/yr**; weekly ≈ **$16/yr**.
- Mechanical cap: UNIQUE `(symbol, kind, period_date)` — a retry is a no-op.
- Emit `brief_generated` event with `cost_usd` and `model_version` into `user_events`. 7-day rolling cost dashboard panel. Alert if it exceeds **$0.05 / active user / week**.

## 5. Client integration

The `/events/:symbol` route keeps its signature. Internally it becomes cache-first:

1. Serve `news_cache` rows ORDER BY `impact_score DESC NULLS LAST, published_at DESC` LIMIT 14. Warm Postgres responds <200 ms — meets the spec's acceptance bar.
2. If oldest row is >15 min old, fire-and-forget a fresh fetch; only *await* it if the cache is fully empty (cold symbol — see §6).
3. New route `GET /api/stocks/briefs/:symbol?kind=daily|weekly` reads `briefs` for today's `period_date`.

**"New" badge.** Client persists `lastSeenAt` per `(userId, symbol)` in AsyncStorage. Any `news_cache` row with `published_at > lastSeenAt` shows a dot; `lastSeenAt` is bumped to `NOW()` when the user scrolls through. No server push in MVP — the 15-min worker cadence already beats human re-open frequency. SSE/WebSocket is Phase 4 if we need it.

## 6. Cold-cache fallback

A stock just added to a watchlist isn't yet in the worker's global set when the worker last ran. The route handles it inline:

1. `news_cache` returns 0 rows.
2. Route runs a synchronous one-shot through the existing pipeline ([stocks.ts:338](artifacts/api-server/src/routes/stocks.ts:338) — Yahoo + Google + optional LLM for display).
3. Results are upserted into `news_cache` so the *next* open is warm.
4. Client sees the normal API contract — just a slow one-time open.

## 7. Implementation sequencing

1. **PR 1 — schema + worker phase 1 (no client change):**
   - `newsSchema.ts`, `newsPreloadWorker.ts` with news ingest only.
   - Started from `index.ts:50`, gated on `NEWS_PRELOAD_ENABLED=true`. Off in prod until a day of clean staging runs.

2. **PR 2 — impact scoring + cache-first read:**
   - Phase 2 (heuristic scorer).
   - `/events/:symbol` rewritten to read `news_cache` with cold-cache fallback.
   - Zero client change.

3. **PR 3 — briefs:**
   - Phase 3 generator + `/briefs/:symbol` route.
   - Mobile: "Daily brief" / "Weekly brief" card on stock detail.

4. **PR 4 — cost monitoring + 100% rollout:**
   - `brief_generated` telemetry + admin-dashboard panel.
   - Default `NEWS_PRELOAD_ENABLED=true`.

## 8. Open questions

1. **Impact scoring model.** Heuristic-only for MVP (source weight + keyword list + novelty) or budget a GPT batch pass (~$10/mo)? Recommend heuristic-only v1, upgrade in PR 4 if badge quality is poor.
2. **Do briefs gate on tier?** 3.4 lists "full historical brief archive" as Premium, implying recent briefs are free. Confirm: free users see today's daily + this week's weekly; premium sees the archive.
3. **Multi-node.** We're single-process today. If we ever scale to 2+ API nodes, phase 1 double-fetches and phase 3 races on `briefs` UNIQUE — safe (idempotent) but wasteful. Add a Postgres advisory lock keyed on tick timestamp *if and when* we add a second node.
4. **Retention.** `news_cache` grows ~4k rows/day at 1,500 symbols × ~3 stories/day. That's ~1.5 M rows/yr, ~300 MB. Recommend 90-day retention (`DELETE WHERE fetched_at < NOW() - INTERVAL '90 days'` nightly). Briefs small and permanent.
5. **Brief generator model.** GPT-4o-mini is our house choice today. Note model choice in `briefs.model_version` from day one so re-generation is trivial when we upgrade.

---

*Stop here for team review. No implementation until schema, worker cadence, and brief-tier gating are signed off.*
