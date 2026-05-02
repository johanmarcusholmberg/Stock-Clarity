import { execute } from "../db";
import { alertsSchemaReady } from "./alertsSchema";
import { logger } from "./logger";

// Ensures the news/earnings notification tables exist. Same "CREATE TABLE IF
// NOT EXISTS on module load" pattern as alertsSchema.ts and newsSchema.ts.
//
// Tables added here:
//   notify_subscriptions  — per-(user, symbol, kind) opt-in. symbol=NULL is
//                           the user-default row.
//   earnings_calendar     — fetched daily from Yahoo quoteSummary.
//   notification_events   — sibling of alert_events; one row per fired
//                           news/earnings notification.
//
// We also extend expo_push_tokens with a timezone column. The table itself is
// owned by alertsSchema.ts; we await that before running the ALTER so the
// column add is safe regardless of which schema module loads first.
export const notifySchemaReady: Promise<void> = (async () => {
  await alertsSchemaReady;

  await execute(`
    CREATE TABLE IF NOT EXISTS notify_subscriptions (
      id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id            TEXT NOT NULL,
      symbol             TEXT,
      kind               TEXT NOT NULL CHECK (kind IN ('news','earnings')),
      status             TEXT NOT NULL DEFAULT 'active'
                         CHECK (status IN ('active','muted')),
      min_impact_score   SMALLINT,
      delivery_channel   TEXT NOT NULL DEFAULT 'push'
                         CHECK (delivery_channel IN ('push','email','both')),
      quiet_start_hour   SMALLINT,
      quiet_end_hour     SMALLINT,
      created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Postgres treats two NULLs as distinct in a UNIQUE constraint, so
  // (user_id, NULL, kind) wouldn't be unique on its own. The partial unique
  // indexes below handle both shapes — exact match for per-symbol rows and
  // one user-default row per (user, kind).
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS notify_sub_user_symbol_kind_uidx
      ON notify_subscriptions (user_id, symbol, kind)
      WHERE symbol IS NOT NULL
  `);
  await execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS notify_sub_user_default_kind_uidx
      ON notify_subscriptions (user_id, kind)
      WHERE symbol IS NULL
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS notify_sub_user_idx
      ON notify_subscriptions (user_id) WHERE status = 'active'
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS notify_sub_symbol_idx
      ON notify_subscriptions (symbol, kind)
      WHERE status = 'active' AND symbol IS NOT NULL
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS earnings_calendar (
      id           BIGSERIAL PRIMARY KEY,
      symbol       TEXT NOT NULL,
      expected_at  TIMESTAMPTZ NOT NULL,
      is_estimated BOOLEAN NOT NULL DEFAULT FALSE,
      fetched_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (symbol, expected_at)
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS earnings_cal_window_idx
      ON earnings_calendar (expected_at)
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS earnings_cal_symbol_idx
      ON earnings_calendar (symbol, expected_at DESC)
  `);

  await execute(`
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
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS notification_events_user_idx
      ON notification_events (user_id, fired_at DESC)
  `);

  // IANA timezone (e.g. "Europe/Stockholm") on the device row. Used by
  // notifyEvaluator (PR 2) to evaluate quiet hours per-user. Optional —
  // resolver falls back to UTC when NULL.
  await execute(`
    ALTER TABLE expo_push_tokens
    ADD COLUMN IF NOT EXISTS timezone TEXT
  `);
})().catch((err) => {
  logger.error({ err: err?.message }, "notifySchema failed to initialise tables");
});
