import { execute } from "../db";
import { logger } from "./logger";

// Tables for the SEC reports feature.
//
//   report_summaries     — persisted Anthropic-generated summaries keyed by
//                          (ticker, accession). Replaces the in-memory cache
//                          so summaries survive restart and are shared across
//                          users (LLM output is identical per filing).
//   report_subscriptions — per-user opt-in to be notified when a new 10-K /
//                          10-Q drops for a symbol. Kept separate from the
//                          existing notify_subscriptions table so we don't
//                          have to alter its CHECK constraint.
//   report_filings_seen  — cursor table for the reports worker. One row per
//                          (symbol, accession) it has already processed; the
//                          worker only fans out filings whose accession isn't
//                          in here yet.
export const reportsSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS report_summaries (
      ticker      TEXT NOT NULL,
      accession   TEXT NOT NULL,
      type        TEXT NOT NULL,
      filing      JSONB NOT NULL,
      summary     JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (ticker, accession)
    )
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS report_subscriptions (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          TEXT NOT NULL,
      symbol           TEXT NOT NULL,
      delivery_channel TEXT NOT NULL DEFAULT 'push'
                       CHECK (delivery_channel IN ('push','email','both')),
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (user_id, symbol)
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS report_sub_symbol_idx
      ON report_subscriptions (symbol)
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS report_filings_seen (
      symbol     TEXT NOT NULL,
      accession  TEXT NOT NULL,
      type       TEXT NOT NULL,
      filed_at   TEXT,
      first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (symbol, accession)
    )
  `);
})().catch((err) => {
  logger.error({ err: err?.message }, "[reportsSchema] init failed");
});
