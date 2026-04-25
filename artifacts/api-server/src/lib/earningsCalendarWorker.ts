import { execute, query, queryOne } from "../db";
import { notifySchemaReady } from "./notifySchema";
import { YF2, yfFetch } from "./newsSources";
import { logger } from "./logger";

// Daily-ish refresh of earnings_calendar. Pulls Yahoo's quoteSummary
// calendarEvents module for every symbol in the active-stocks union (same
// query the news pre-load worker uses) and replaces future earnings rows for
// each symbol with whatever Yahoo says now.
//
// Cadence: 24h via setTimeout, with a skip-if-recent guard so deploy churn
// doesn't hammer Yahoo. The guard reads service_heartbeats — if we ran <12h
// ago we no-op the tick. Wall-clock alignment (e.g. always at 06:00 UTC) can
// land in a follow-up if drift becomes an issue; daily-ish is fine for MVP.
//
// Idempotent. Future-row replace is a per-symbol DELETE-then-INSERT. A crash
// mid-symbol leaves that symbol with no rows until the next tick rebuilds it
// — the evaluator's window logic (PR 3) treats no row as "no upcoming
// earnings" rather than "unknown," so the worst case is one missed alert,
// which the next tick recovers in <24h. Wrap in a transaction if window
// downtime turns out to matter.

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SKIP_IF_RECENT_MS = 12 * 60 * 60 * 1000;
const FETCH_CONCURRENCY = 5;

function isEnabled(): boolean {
  return (process.env.NOTIFY_ENABLED ?? "").toLowerCase() === "true";
}

// Same active-stocks union as newsPreloadWorker. Inlined rather than
// extracted — extract when a third caller appears.
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

interface ParsedEarnings {
  expectedAtMs: number;
  isEstimated: boolean;
}

// Extract earnings dates from Yahoo's calendarEvents module.
//   1 entry  = confirmed date
//   2 entries = date range (between the two); take the earlier as expected_at,
//               flag is_estimated=true
//   0 entries = no upcoming earnings on file (small caps, some non-US)
function parseEarnings(calendarEvents: any): ParsedEarnings[] {
  const dates: any[] = calendarEvents?.earnings?.earningsDate;
  if (!Array.isArray(dates) || dates.length === 0) return [];

  const epochs = dates
    .map((d: any) => Number(d?.raw))
    .filter((n: number) => Number.isFinite(n) && n > 0)
    .map((n: number) => n * 1000)
    .sort((a, b) => a - b);

  if (epochs.length === 0) return [];
  const isEstimated = epochs.length > 1;
  return [{ expectedAtMs: epochs[0], isEstimated }];
}

async function fetchEarningsForSymbol(symbol: string): Promise<ParsedEarnings[]> {
  try {
    const url = `${YF2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents`;
    const data = await yfFetch(url);
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return [];
    return parseEarnings(result.calendarEvents);
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol }, "earnings calendar fetch failed");
    return [];
  }
}

// Per-symbol replace. DELETE future rows, INSERT what Yahoo gave us. Past
// rows stay — useful for the T-after window check in PR 3 (we look back
// at the most recent expected_at).
async function replaceFutureEarnings(symbol: string, parsed: ParsedEarnings[]): Promise<void> {
  await execute(
    `DELETE FROM earnings_calendar WHERE symbol = $1 AND expected_at > NOW()`,
    [symbol],
  );
  for (const row of parsed) {
    if (row.expectedAtMs <= Date.now()) continue; // only persist future dates
    await execute(
      `INSERT INTO earnings_calendar (symbol, expected_at, is_estimated)
       VALUES ($1, $2, $3)
       ON CONFLICT (symbol, expected_at) DO UPDATE SET
         is_estimated = EXCLUDED.is_estimated,
         fetched_at   = NOW()`,
      [symbol, new Date(row.expectedAtMs).toISOString(), row.isEstimated],
    );
  }
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      try {
        await fn(items[i]);
      } catch (err: any) {
        logger.warn({ err: err?.message, item: items[i] }, "earnings worker item failed");
      }
    }
  });
  await Promise.all(workers);
}

async function shouldSkipTick(): Promise<boolean> {
  const beat = await queryOne<{ last_beat: string }>(
    "SELECT last_beat FROM service_heartbeats WHERE service = 'earnings_calendar_worker'",
  );
  if (!beat) return false;
  const ageMs = Date.now() - new Date(beat.last_beat).getTime();
  return ageMs < SKIP_IF_RECENT_MS;
}

async function tick(): Promise<void> {
  const started = Date.now();

  if (await shouldSkipTick()) {
    logger.info("earnings calendar tick skipped (ran <12h ago)");
    await touchHeartbeat();
    return;
  }

  const symbols = await globalActiveStocks();
  if (!symbols.length) {
    await touchHeartbeat();
    return;
  }

  let withDate = 0;
  let withoutDate = 0;
  await runWithConcurrency(symbols, FETCH_CONCURRENCY, async (symbol) => {
    const parsed = await fetchEarningsForSymbol(symbol);
    if (parsed.length === 0) {
      withoutDate++;
      return;
    }
    withDate++;
    await replaceFutureEarnings(symbol, parsed);
  });

  const ms = Date.now() - started;
  logger.info({ symbols: symbols.length, withDate, withoutDate, ms }, "earnings calendar tick done");
  await touchHeartbeat();
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('earnings_calendar_worker', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startEarningsCalendarWorker(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info("Earnings calendar worker disabled — set NOTIFY_ENABLED=true to start");
    return;
  }
  running = true;
  await notifySchemaReady;
  logger.info(
    { intervalMs: TICK_INTERVAL_MS, skipIfRecentMs: SKIP_IF_RECENT_MS, concurrency: FETCH_CONCURRENCY },
    "Earnings calendar worker starting",
  );

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Earnings calendar tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };
  loop();
}

export function stopEarningsCalendarWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

// Exposed for unit tests / dev triggers.
export const __test__ = { parseEarnings };
