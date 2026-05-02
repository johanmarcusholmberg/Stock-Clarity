import { execute } from "../db";
import { logger } from "./logger";

// Phase 3.4 PR 3 — upcoming dividend events keyed by ticker. Populated by
// dividendWorker daily from Yahoo quoteSummary?modules=calendarEvents. One
// row per (ticker, ex_date); pay_date and amount are best-effort (Yahoo
// sometimes omits one or both). amount is per-share in `currency`.
//
// UNIQUE (ticker, ex_date) lets the worker upsert idempotently as Yahoo
// refines its forecast. Past rows are kept for history — the API filters
// to ex_date >= CURRENT_DATE on read.
export const dividendSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS dividend_events (
      id          BIGSERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      ex_date     DATE NOT NULL,
      pay_date    DATE,
      amount      NUMERIC(18, 6),
      currency    TEXT,
      fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (ticker, ex_date)
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS dividend_events_ticker_ex_idx
      ON dividend_events (ticker, ex_date DESC)
  `);
})().catch((err) => {
  logger.error({ err: err?.message }, "dividendSchema failed to initialise tables");
});
