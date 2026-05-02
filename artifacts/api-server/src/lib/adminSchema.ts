import { execute } from "../db";

// Ensures the admin-subscription tables exist. Same "CREATE TABLE IF NOT
// EXISTS on module load" pattern as alertsSchema.ts and newsSchema.ts.
//
// Tables:
//   admin_grants           — explicit "give this user tier X until Y" grants
//   admin_audit            — append-only history of every admin mutation
//   admin_rate_limit_hits  — sliding-window rate limit for admin mutations
//                            (PR 5a — DB-backed so multi-instance stays sane)
//
// Also adds two nullable IAP tracking columns to `users`. They're unused
// until IAP ships; centralised here so the schema contract for all admin-
// subscription infra lives in one place.
//
// warn_sent_at on admin_grants (added in PR 5a) tracks the 3-day expiry
// warning so the warning worker only fires once per grant. Reset to NULL
// on extend so a re-lengthened grant re-enters the warning pool.
export const adminSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_grants (
      id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id           TEXT NOT NULL,
      tier              TEXT NOT NULL CHECK (tier IN ('pro','premium')),
      expires_at        TIMESTAMPTZ NOT NULL,
      reason            TEXT NOT NULL,
      granted_by_admin  TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','revoked','expired')),
      revoked_at        TIMESTAMPTZ,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  // Partial index: reads on "who has an active grant right now" are the hot
  // path (every /subscription call, every grant-expiry tick).
  await execute(
    `CREATE INDEX IF NOT EXISTS admin_grants_user_active_idx
       ON admin_grants (user_id) WHERE status = 'active'`,
  );
  await execute(
    `CREATE INDEX IF NOT EXISTS admin_grants_expiry_idx
       ON admin_grants (expires_at) WHERE status = 'active'`,
  );

  await execute(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id              BIGSERIAL PRIMARY KEY,
      admin_email     TEXT NOT NULL,
      user_id         TEXT NOT NULL,
      action          TEXT NOT NULL,
      source          TEXT NOT NULL,
      previous_state  JSONB,
      new_state       JSONB,
      reason          TEXT,
      metadata        JSONB,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(
    `CREATE INDEX IF NOT EXISTS admin_audit_user_idx
       ON admin_audit (user_id, created_at DESC)`,
  );
  await execute(
    `CREATE INDEX IF NOT EXISTS admin_audit_admin_idx
       ON admin_audit (admin_email, created_at DESC)`,
  );

  // IAP tracking columns. iap_source + iap_original_transaction_id pre-date
  // the RevenueCat webhook (added speculatively in PR 5a); the rest were
  // added when the RevenueCat webhook (`routes/revenuecat.ts`) shipped:
  //
  //   iap_tier             — what the user is entitled to right now
  //                          ('pro' | 'premium'); NULL = no active IAP sub
  //   iap_product_id       — store-side product id (e.g. `pro_monthly`)
  //                          for audit/debug
  //   iap_expires_at       — when the entitlement runs out. Used by
  //                          computeEffectiveTier to auto-downgrade if
  //                          a CANCELLATION/EXPIRATION webhook is delayed
  //   iap_environment      — 'production' | 'sandbox' so we can filter
  //                          sandbox events out of prod analytics
  //   iap_last_event_id    — RevenueCat event id, for exact-match dedup
  //                          on at-least-once webhook delivery
  //   iap_last_event_at    — event_timestamp_ms of the last applied event
  //                          so out-of-order deliveries don't overwrite
  //                          newer state with older state
  await execute(`
    ALTER TABLE users
      ADD COLUMN IF NOT EXISTS iap_source TEXT,
      ADD COLUMN IF NOT EXISTS iap_original_transaction_id TEXT,
      ADD COLUMN IF NOT EXISTS iap_tier TEXT,
      ADD COLUMN IF NOT EXISTS iap_product_id TEXT,
      ADD COLUMN IF NOT EXISTS iap_expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS iap_environment TEXT,
      ADD COLUMN IF NOT EXISTS iap_last_event_id TEXT,
      ADD COLUMN IF NOT EXISTS iap_last_event_at TIMESTAMPTZ
  `);

  // PR 5a: 3-day expiry warning worker flips this to NOW() after queuing a
  // notification for the owning user. The PATCH /grants/:grantId extend
  // handler resets it to NULL so an extended grant re-enters the warning
  // pool. NULL means "not yet warned".
  await execute(
    `ALTER TABLE admin_grants ADD COLUMN IF NOT EXISTS warn_sent_at TIMESTAMPTZ`,
  );

  // PR 5a: sliding-window rate limit for admin subscription-tool mutations.
  // 10/hour/admin_email (checked in lib/adminRateLimit.ts). DB-backed so it
  // works across multiple server instances — an in-memory counter would
  // undercount under a multi-instance deployment.
  //
  // No cleanup worker. At 10/hour × 5 admins × 24 × 365 ≈ 438K rows/year
  // this is a rounding error on the same Postgres host that carries
  // user_events, and the index keeps reads fast. Revisit if admin count
  // grows by 10x.
  await execute(`
    CREATE TABLE IF NOT EXISTS admin_rate_limit_hits (
      id           BIGSERIAL PRIMARY KEY,
      admin_email  TEXT NOT NULL,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await execute(
    `CREATE INDEX IF NOT EXISTS admin_rate_limit_hits_lookup_idx
       ON admin_rate_limit_hits (admin_email, created_at DESC)`,
  );
})().catch((err) => {
  console.error("[adminSchema] Failed to initialise tables:", err?.message);
});
