import { execute } from "../db";

// Phase 3.4 PR 2 — holdings tracker schema. Same "CREATE TABLE IF NOT EXISTS
// on module load" pattern as notifySchema.ts and alertsSchema.ts.
//
// Tables:
//   holdings             — one row per (user, ticker). Currency is informational;
//                          the real per-lot currency lives on lots.
//   lots                 — purchase records. Multiple lots per holding (DCA, etc).
//                          ON DELETE CASCADE so deleting a holding wipes its history.
//   portfolio_snapshots  — daily value snapshot written by portfolioSnapshotWorker.
//                          UNIQUE (user_id, date) so the worker can upsert idempotently
//                          and reruns within the same UTC day are no-ops.
export const holdingsSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS holdings (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     TEXT NOT NULL,
      ticker      TEXT NOT NULL,
      currency    TEXT NOT NULL DEFAULT 'USD',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, ticker)
    )
  `);

  // Phase 3.4 PR 3 — country denormalised onto holdings, populated by the
  // dividendWorker daily tick from Yahoo's summaryProfile module. Nullable
  // so existing rows don't need a backfill; mobile renders "Unknown" until
  // the next worker tick fills it in. Same per-ticker value across users —
  // refactor to ticker_metadata if a third feature needs the same data.
  await execute(`
    ALTER TABLE holdings ADD COLUMN IF NOT EXISTS country TEXT
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS lots (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      holding_id      UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
      qty             NUMERIC NOT NULL,
      cost_per_share  NUMERIC NOT NULL,
      purchased_at    DATE NOT NULL,
      currency        TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS lots_holding_idx
      ON lots (holding_id)
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS portfolio_snapshots (
      id              BIGSERIAL PRIMARY KEY,
      user_id         TEXT NOT NULL,
      date            DATE NOT NULL,
      value_usd       NUMERIC NOT NULL,
      value_native    NUMERIC NOT NULL,
      holdings_hash   TEXT NOT NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, date)
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS portfolio_snapshots_user_date_idx
      ON portfolio_snapshots (user_id, date DESC)
  `);
})().catch((err) => {
  console.error("[holdingsSchema] Failed to initialise tables:", err?.message);
});
