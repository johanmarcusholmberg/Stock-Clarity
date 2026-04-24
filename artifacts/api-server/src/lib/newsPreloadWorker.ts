import { execute, query } from "../db";
import { newsSchemaReady } from "./newsSchema";
import { fetchGoogleNewsRSS, fetchYahooNews, type NewsItem } from "./newsSources";
import { scoreUnscored, upsertNewsItem, urlHash } from "./newsCache";
import { logger } from "./logger";

// ── Cadence & concurrency ────────────────────────────────────────────────────
const TICK_INTERVAL_MS = 15 * 60 * 1000; // 15 min
const FETCH_CONCURRENCY = 5;              // per-tick parallel symbols

// ── Enablement flag ──────────────────────────────────────────────────────────
// Off by default. Flip NEWS_PRELOAD_ENABLED=true to start the worker.
function isEnabled(): boolean {
  return (process.env.NEWS_PRELOAD_ENABLED ?? "").toLowerCase() === "true";
}

// ── Active-stocks set ────────────────────────────────────────────────────────
// Global union of (a) portfolio + watchlist tickers, (b) any ticker viewed by
// any user in the last 7 days. Recomputed every tick — the query is a single
// range scan + hash aggregate and runs in <100ms at current row counts.
async function globalActiveStocks(): Promise<string[]> {
  const rows = await query<{ symbol: string }>(`
    WITH user_tickers AS (
      SELECT DISTINCT UPPER(ticker) AS symbol
        FROM users u
        CROSS JOIN LATERAL jsonb_array_elements(COALESCE(u.watchlist_data, '[]'::jsonb)) f
        CROSS JOIN LATERAL jsonb_array_elements_text(COALESCE(f->'tickers', '[]'::jsonb)) ticker
       WHERE u.watchlist_data IS NOT NULL
      UNION
      SELECT DISTINCT UPPER(ticker) AS symbol
        FROM stock_views
       WHERE user_id IS NOT NULL
         AND created_at > NOW() - INTERVAL '7 days'
    )
    SELECT symbol FROM user_tickers WHERE symbol IS NOT NULL AND symbol <> ''
  `);
  return rows.map((r) => r.symbol);
}

// ── Single-symbol ingest ─────────────────────────────────────────────────────
async function ingestSymbol(symbol: string): Promise<{ inserted: number; duplicates: number; failed: number }> {
  const [yahoo, google] = await Promise.allSettled([
    fetchYahooNews(symbol),
    fetchGoogleNewsRSS(`${symbol} stock`),
  ]);

  const entries: Array<{ item: NewsItem; source: "yahoo" | "google_rss" }> = [];
  if (yahoo.status === "fulfilled") {
    for (const item of yahoo.value) entries.push({ item, source: "yahoo" });
  }
  if (google.status === "fulfilled") {
    for (const item of google.value) entries.push({ item, source: "google_rss" });
  }

  let inserted = 0;
  let duplicates = 0;
  let failed = 0;
  for (const { item, source } of entries) {
    try {
      const wasInserted = await upsertNewsItem(symbol, item, source);
      if (wasInserted) inserted++;
      else duplicates++;
    } catch (err: any) {
      failed++;
      logger.warn({ err: err?.message, symbol }, "news_cache insert failed");
    }
  }
  return { inserted, duplicates, failed };
}

// ── Concurrency pool ─────────────────────────────────────────────────────────
async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
      } catch (err: any) {
        logger.warn({ err: err?.message, item: items[i] }, "news worker item failed");
      }
    }
  });
  await Promise.all(workers);
}

// ── Single tick ──────────────────────────────────────────────────────────────
// Phases are independent and each idempotent, so a crashed tick mid-run is
// safe to retry: ingest upserts on UNIQUE, scoring only targets NULL rows.
async function tick(): Promise<void> {
  const started = Date.now();
  const symbols = await globalActiveStocks();

  if (!symbols.length) {
    await touchHeartbeat();
    return;
  }

  // Phase 1 — ingest.
  const totals = { inserted: 0, duplicates: 0, failed: 0 };
  await runWithConcurrency(symbols, FETCH_CONCURRENCY, async (symbol) => {
    const r = await ingestSymbol(symbol);
    totals.inserted += r.inserted;
    totals.duplicates += r.duplicates;
    totals.failed += r.failed;
  });

  // Phase 2 — impact scoring. Runs after ingest so newly-inserted rows are
  // scored in the same tick. The upsert path also writes an initial score,
  // so this mainly backfills rows inserted before scoring was wired up and
  // any rescores if we ever clear impact_score manually.
  let scored = 0;
  try {
    scored = await scoreUnscored(started);
  } catch (err: any) {
    logger.warn({ err: err?.message }, "news impact scoring failed");
  }

  const ms = Date.now() - started;
  logger.info({ symbols: symbols.length, ...totals, scored, ms }, "news preload tick done");
  await touchHeartbeat();
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('news_preload_worker', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

// ── Public lifecycle ─────────────────────────────────────────────────────────
let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startNewsPreloadWorker(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info("News preload worker disabled — set NEWS_PRELOAD_ENABLED=true to start");
    return;
  }
  running = true;
  await newsSchemaReady;
  logger.info({ intervalMs: TICK_INTERVAL_MS, concurrency: FETCH_CONCURRENCY }, "News preload worker starting");

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "News preload tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };
  loop();
}

export function stopNewsPreloadWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

// Exposed for unit testing the pure bits. urlHash is re-exported from
// newsCache; the existing tests import via this module.
export const __test__ = { urlHash };
