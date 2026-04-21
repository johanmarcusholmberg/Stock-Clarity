import { execute } from "../db";

// Ensures the news pre-load tables exist. Follows the same "CREATE TABLE IF
// NOT EXISTS on module load" pattern as alertsSchema.ts.
//
// Tables:
//   news_cache — one row per (symbol, story). Dedup via url_hash UNIQUE.
//   briefs     — one row per (symbol, kind, period_date). AI summaries.
export const newsSchemaReady: Promise<void> = (async () => {
  await execute(`
    CREATE TABLE IF NOT EXISTS news_cache (
      id            BIGSERIAL PRIMARY KEY,
      symbol        TEXT NOT NULL,
      url_hash      TEXT NOT NULL,
      url           TEXT NOT NULL,
      title         TEXT NOT NULL,
      publisher     TEXT NOT NULL,
      published_at  TIMESTAMPTZ NOT NULL,
      fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      source        TEXT NOT NULL,
      impact_score  SMALLINT,
      UNIQUE (symbol, url_hash)
    )
  `);
  await execute(`CREATE INDEX IF NOT EXISTS news_cache_symbol_pub_idx ON news_cache (symbol, published_at DESC)`);
  await execute(`
    CREATE INDEX IF NOT EXISTS news_cache_impact_idx
      ON news_cache (symbol, impact_score DESC, published_at DESC)
      WHERE impact_score IS NOT NULL
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS briefs (
      id              BIGSERIAL PRIMARY KEY,
      symbol          TEXT NOT NULL,
      kind            TEXT NOT NULL CHECK (kind IN ('daily','weekly')),
      period_date     DATE NOT NULL,
      summary         TEXT NOT NULL,
      bullets         JSONB NOT NULL DEFAULT '[]'::jsonb,
      model_version   TEXT NOT NULL,
      generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      input_news_ids  BIGINT[],
      UNIQUE (symbol, kind, period_date)
    )
  `);
  await execute(`
    CREATE INDEX IF NOT EXISTS briefs_symbol_kind_date_idx
      ON briefs (symbol, kind, period_date DESC)
  `);

  // Shared heartbeat table. Also created by alertsSchema.ts — both paths use
  // IF NOT EXISTS so whichever schema loads first wins.
  await execute(`
    CREATE TABLE IF NOT EXISTS service_heartbeats (
      service    TEXT PRIMARY KEY,
      last_beat  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
})().catch((err) => {
  console.error("[newsSchema] Failed to initialise tables:", err?.message);
});
