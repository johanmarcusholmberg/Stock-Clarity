import { createHash } from "node:crypto";
import { execute, query, queryOne } from "../db";
import { holdingsSchemaReady } from "./holdingsSchema";
import { YF2, yfFetch } from "./newsSources";
import { fxToUsd, newFxCache, type FxCache } from "./fxConvert";
import { logger } from "./logger";

// Daily portfolio snapshot. For each user with holdings, fetch current quotes
// for their tickers, compute total value in USD and the user's primary
// currency, hash the (ticker, qty) shape so downstream code can detect
// no-change days, and upsert into portfolio_snapshots.
//
// Cadence: aligned to 06:30 UTC daily. The first scheduled tick computes
// ms-until-next-06:30 so deploys don't immediately re-run the worker; after
// that, 24h intervals. A skip-if-recent guard against service_heartbeats
// (12h) covers deploy churn.
//
// Idempotent. UNIQUE (user_id, date) means a re-tick within the same UTC day
// upserts into the same row — value reflects the latest quote read. Crash
// mid-tick leaves the user without a snapshot for that day until the next
// run; the (user_id, date) constraint stops a duplicate row from sneaking in.

const TICK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SKIP_IF_RECENT_MS = 12 * 60 * 60 * 1000;
const TARGET_HOUR_UTC = 6;
const TARGET_MINUTE_UTC = 30;
const FETCH_CONCURRENCY = 5;

function isEnabled(): boolean {
  return (process.env.HOLDINGS_ENABLED ?? "").toLowerCase() === "true";
}

interface UserHoldings {
  userId: string;
  // ticker -> { totalQty, currency }. Currency is the lot currency (assumed
  // consistent within a holding — enforced upstream where lots are added).
  byTicker: Map<string, { totalQty: number; currency: string }>;
}

async function loadAllHoldings(): Promise<UserHoldings[]> {
  const rows = await query<{
    user_id: string;
    ticker: string;
    total_qty: string;
    currency: string;
  }>(`
    SELECT h.user_id, h.ticker, h.currency, COALESCE(SUM(l.qty), 0) AS total_qty
      FROM holdings h
      LEFT JOIN lots l ON l.holding_id = h.id
     GROUP BY h.id, h.user_id, h.ticker, h.currency
     HAVING COALESCE(SUM(l.qty), 0) > 0
     ORDER BY h.user_id
  `);

  const byUser = new Map<string, UserHoldings>();
  for (const r of rows) {
    let entry = byUser.get(r.user_id);
    if (!entry) {
      entry = { userId: r.user_id, byTicker: new Map() };
      byUser.set(r.user_id, entry);
    }
    entry.byTicker.set(r.ticker.toUpperCase(), {
      totalQty: Number(r.total_qty),
      currency: r.currency,
    });
  }
  return [...byUser.values()];
}

interface QuoteResult {
  price: number;
  currency: string;
}

// Per-tick quote cache so users sharing tickers (e.g. AAPL) don't refetch.
// Cleared at the top of each tick.
const quoteCache = new Map<string, QuoteResult | null>();

async function fetchQuote(symbol: string): Promise<QuoteResult | null> {
  if (quoteCache.has(symbol)) return quoteCache.get(symbol)!;
  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`;
    const data = await yfFetch(url);
    const result = data?.chart?.result?.[0];
    const meta = result?.meta;
    if (!meta) {
      quoteCache.set(symbol, null);
      return null;
    }
    const closes: number[] = result?.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c: any) => c != null && !isNaN(c)) as number[];
    const price: number | null = meta.regularMarketPrice ?? validCloses.at(-1) ?? null;
    if (price == null) {
      quoteCache.set(symbol, null);
      return null;
    }
    const quote: QuoteResult = { price, currency: meta.currency ?? "USD" };
    quoteCache.set(symbol, quote);
    return quote;
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol }, "portfolio snapshot quote fetch failed");
    quoteCache.set(symbol, null);
    return null;
  }
}

// FX rates to USD via the shared fxConvert helper — same fallback (1.0 + warn
// log) as the holdings CSV export uses, so both stay aligned on Yahoo failure.
// Cache is per-tick (cleared at the top of tick()) so a stale rate doesn't
// outlive the worker run.
let fxCache: FxCache = newFxCache();

interface SnapshotComputed {
  valueUsd: number;
  valueNative: number;
  holdingsHash: string;
}

// holdings_hash is sha256 of sorted "TICKER:qty" pairs joined by '|'. qty is
// the sum across all lots for the holding. Stable across reorderings; changes
// when shares move.
function computeHoldingsHash(byTicker: Map<string, { totalQty: number }>): string {
  const pairs: string[] = [];
  for (const [ticker, { totalQty }] of byTicker) {
    pairs.push(`${ticker}:${totalQty}`);
  }
  pairs.sort();
  return createHash("sha256").update(pairs.join("|")).digest("hex");
}

async function computeSnapshot(user: UserHoldings): Promise<SnapshotComputed | null> {
  // Per-currency totals before FX. We pick value_native to be the currency
  // that holds the largest USD-equivalent value. For all-USD users this
  // degenerates to value_native = value_usd, which is the common case.
  const perCurrency = new Map<string, number>();
  let valueUsd = 0;
  let anyQuotePresent = false;

  for (const [ticker, { totalQty, currency: holdingCurrency }] of user.byTicker) {
    const quote = await fetchQuote(ticker);
    if (!quote) continue;
    anyQuotePresent = true;
    const native = totalQty * quote.price;
    // Quote currency is authoritative — `holdings.currency` is informational.
    // If they disagree, the quote wins (e.g. user mistyped currency on add).
    const cur = quote.currency || holdingCurrency || "USD";
    perCurrency.set(cur, (perCurrency.get(cur) ?? 0) + native);
    const fx = await fxToUsd(cur, fxCache);
    valueUsd += native * fx;
  }

  if (!anyQuotePresent) return null;

  // Pick the dominant currency by USD-equivalent value.
  let dominantCur = "USD";
  let dominantUsd = -1;
  for (const [cur, native] of perCurrency) {
    const fx = await fxToUsd(cur, fxCache);
    const usd = native * fx;
    if (usd > dominantUsd) {
      dominantUsd = usd;
      dominantCur = cur;
    }
  }
  const valueNative = perCurrency.get(dominantCur) ?? valueUsd;
  const holdingsHash = computeHoldingsHash(user.byTicker);

  return { valueUsd, valueNative, holdingsHash };
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
        logger.warn({ err: err?.message, item: (items[i] as any)?.userId }, "portfolio snapshot worker item failed");
      }
    }
  });
  await Promise.all(workers);
}

async function shouldSkipTick(): Promise<boolean> {
  const beat = await queryOne<{ last_beat: string }>(
    "SELECT last_beat FROM service_heartbeats WHERE service = 'portfolio_snapshot_worker'",
  );
  if (!beat) return false;
  const ageMs = Date.now() - new Date(beat.last_beat).getTime();
  return ageMs < SKIP_IF_RECENT_MS;
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('portfolio_snapshot_worker', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

async function tick(): Promise<void> {
  const started = Date.now();

  if (await shouldSkipTick()) {
    logger.info("portfolio snapshot tick skipped (ran <12h ago)");
    await touchHeartbeat();
    return;
  }

  quoteCache.clear();
  fxCache = newFxCache();

  const users = await loadAllHoldings();
  if (!users.length) {
    await touchHeartbeat();
    return;
  }

  const todayUtc = new Date().toISOString().slice(0, 10);
  let written = 0;

  await runWithConcurrency(users, FETCH_CONCURRENCY, async (user) => {
    const snap = await computeSnapshot(user);
    if (!snap) return;
    await execute(
      `INSERT INTO portfolio_snapshots (user_id, date, value_usd, value_native, holdings_hash)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, date) DO UPDATE SET
         value_usd     = EXCLUDED.value_usd,
         value_native  = EXCLUDED.value_native,
         holdings_hash = EXCLUDED.holdings_hash`,
      [user.userId, todayUtc, snap.valueUsd, snap.valueNative, snap.holdingsHash],
    );
    written++;
  });

  const ms = Date.now() - started;
  logger.info({ users: users.length, written, ms }, "portfolio snapshot tick done");
  await touchHeartbeat();
}

// Wall-clock alignment to 06:30 UTC. Computes ms until next target moment.
function msUntilNextTargetUtc(): number {
  const now = new Date();
  const next = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    TARGET_HOUR_UTC,
    TARGET_MINUTE_UTC,
    0,
    0,
  ));
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.getTime() - now.getTime();
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startPortfolioSnapshotWorker(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info("Portfolio snapshot worker disabled — set HOLDINGS_ENABLED=true to start");
    return;
  }
  running = true;
  await holdingsSchemaReady;

  const initialDelayMs = msUntilNextTargetUtc();
  logger.info(
    {
      targetUtc: `${TARGET_HOUR_UTC.toString().padStart(2, "0")}:${TARGET_MINUTE_UTC.toString().padStart(2, "0")}`,
      initialDelayMs,
      intervalMs: TICK_INTERVAL_MS,
      concurrency: FETCH_CONCURRENCY,
    },
    "Portfolio snapshot worker starting",
  );

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Portfolio snapshot tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };

  timer = setTimeout(loop, initialDelayMs);
}

export function stopPortfolioSnapshotWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

export const __test__ = { computeHoldingsHash, msUntilNextTargetUtc };
