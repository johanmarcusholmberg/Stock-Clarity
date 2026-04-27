import { execute, query, queryOne } from "../db";
import { holdingsSchemaReady } from "./holdingsSchema";
import { dividendSchemaReady } from "./dividendSchema";
import { YF2, yfFetch } from "./newsSources";
import { parseDividendsAndMeta, type ParsedTickerMeta } from "./dividendParser";
import { logger } from "./logger";

// Daily refresh of dividend_events + holdings.country. For every distinct
// ticker that lives in the holdings table (i.e. tickers users actually own,
// not the global active-stocks union), fetch Yahoo's quoteSummary with
// calendarEvents + summaryDetail + summaryProfile in a single call:
//   calendarEvents → exDividendDate, dividendDate (timestamps)
//   summaryDetail  → lastDividendValue, lastDividendDate, currency
//   summaryProfile → country
//
// Cadence: 24h via setTimeout, with a skip-if-recent guard against the
// service_heartbeats table so deploy churn doesn't hammer Yahoo. Same
// 12h skip threshold as the earnings worker.
//
// Idempotent. dividend_events upserts on (ticker, ex_date). holdings.country
// is set on every row matching the ticker — country is per-symbol, so user
// rows for the same symbol all see the same value.

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SKIP_IF_RECENT_MS = 12 * 60 * 60 * 1000;
const FETCH_CONCURRENCY = 5;

function isEnabled(): boolean {
  return (process.env.HOLDINGS_ENABLED ?? "").toLowerCase() === "true";
}

async function holdingsTickers(): Promise<string[]> {
  const rows = await query<{ ticker: string }>(
    "SELECT DISTINCT UPPER(ticker) AS ticker FROM holdings WHERE ticker IS NOT NULL AND ticker <> ''",
  );
  return rows.map((r) => r.ticker);
}

async function fetchTickerMeta(symbol: string): Promise<ParsedTickerMeta | null> {
  try {
    const url = `${YF2}/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=calendarEvents,summaryDetail,summaryProfile`;
    const data = await yfFetch(url);
    const result = data?.quoteSummary?.result?.[0];
    if (!result) return null;
    return parseDividendsAndMeta(result);
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol }, "dividend worker fetch failed");
    return null;
  }
}

async function persist(symbol: string, meta: ParsedTickerMeta): Promise<void> {
  for (const ev of meta.events) {
    await execute(
      `INSERT INTO dividend_events (ticker, ex_date, pay_date, amount, currency)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ticker, ex_date) DO UPDATE SET
         pay_date   = EXCLUDED.pay_date,
         amount     = EXCLUDED.amount,
         currency   = EXCLUDED.currency,
         fetched_at = NOW()`,
      [symbol, ev.exDate, ev.payDate, ev.amount, ev.currency],
    );
  }
  if (meta.country) {
    // Update country across every user's holding of this ticker. country is
    // per-symbol, so this denormalisation is intentional.
    await execute(`UPDATE holdings SET country = $1 WHERE UPPER(ticker) = $2`, [
      meta.country,
      symbol,
    ]);
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
        logger.warn({ err: err?.message, item: items[i] }, "dividend worker item failed");
      }
    }
  });
  await Promise.all(workers);
}

async function shouldSkipTick(): Promise<boolean> {
  const beat = await queryOne<{ last_beat: string }>(
    "SELECT last_beat FROM service_heartbeats WHERE service = 'dividend_worker'",
  );
  if (!beat) return false;
  const ageMs = Date.now() - new Date(beat.last_beat).getTime();
  return ageMs < SKIP_IF_RECENT_MS;
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('dividend_worker', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

async function tick(): Promise<void> {
  const started = Date.now();

  if (await shouldSkipTick()) {
    logger.info("dividend tick skipped (ran <12h ago)");
    await touchHeartbeat();
    return;
  }

  const symbols = await holdingsTickers();
  if (!symbols.length) {
    await touchHeartbeat();
    return;
  }

  let withDividend = 0;
  let withCountry = 0;
  await runWithConcurrency(symbols, FETCH_CONCURRENCY, async (symbol) => {
    const meta = await fetchTickerMeta(symbol);
    if (!meta) return;
    if (meta.events.length) withDividend++;
    if (meta.country) withCountry++;
    await persist(symbol, meta);
  });

  const ms = Date.now() - started;
  logger.info(
    { symbols: symbols.length, withDividend, withCountry, ms },
    "dividend tick done",
  );
  await touchHeartbeat();
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startDividendWorker(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info("Dividend worker disabled — set HOLDINGS_ENABLED=true to start");
    return;
  }
  running = true;
  await holdingsSchemaReady;
  await dividendSchemaReady;
  logger.info(
    { intervalMs: TICK_INTERVAL_MS, skipIfRecentMs: SKIP_IF_RECENT_MS, concurrency: FETCH_CONCURRENCY },
    "Dividend worker starting",
  );

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Dividend tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };
  loop();
}

export function stopDividendWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
