import { execute } from "../db";
import { logger } from "./logger";

// Ensures the alerts-related tables exist. Follows the same "CREATE TABLE IF NOT
// EXISTS on module load" pattern used elsewhere in the codebase (see auth.ts).
//
// Tables:
//   alerts             — user-defined alert rules
//   expo_push_tokens   — per-device push tokens
//   alert_events       — fire history (for cooldowns + last-fired-at UI)
//   service_heartbeats — evaluator dead-man switch
export const alertsSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS alerts (
      id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id          TEXT NOT NULL,
      symbol           TEXT NOT NULL,
      type             TEXT NOT NULL CHECK (type IN ('price_above','price_below','pct_change_day')),
      threshold        NUMERIC NOT NULL,
      status           TEXT NOT NULL DEFAULT 'active'
                       CHECK (status IN ('active','snoozed','triggered','disabled')),
      delivery_channel TEXT NOT NULL DEFAULT 'push'
                       CHECK (delivery_channel IN ('push','email','both')),
      last_fired_at    TIMESTAMPTZ,
      last_side        TEXT,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS alerts_user_symbol_idx ON alerts (user_id, symbol)`);
  await execute(`CREATE INDEX IF NOT EXISTS alerts_active_idx ON alerts (status) WHERE status = 'active'`);

  await execute(`
    CREATE TABLE IF NOT EXISTS expo_push_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      platform   TEXT,
      last_seen  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS expo_push_tokens_user_idx ON expo_push_tokens (user_id)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id            BIGSERIAL PRIMARY KEY,
      alert_id      UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
      fired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      price_at_fire NUMERIC NOT NULL,
      delivered_via TEXT
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS alert_events_alert_idx ON alert_events (alert_id, fired_at DESC)`);

  await execute(`
    CREATE TABLE IF NOT EXISTS service_heartbeats (
      service    TEXT PRIMARY KEY,
      last_beat  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
})().catch((err) => {
  logger.error({ err: err?.message }, "alertsSchema failed to initialise tables");
});
