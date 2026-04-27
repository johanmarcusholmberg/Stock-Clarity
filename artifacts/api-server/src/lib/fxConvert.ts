import { YF2, yfFetch } from "./newsSources";
import { logger } from "./logger";

// FX rates to USD via Yahoo's `${cur}USD=X` chart pseudo-ticker. Shared by
// the portfolio snapshot worker and the holdings CSV export route so both
// behave identically on Yahoo failure: fall back to 1.0 and warn. The
// snapshot or export still completes — value_usd / current_value_usd will
// self-correct on the next successful FX read.
//
// Pass a fresh cache map per call site (or per tick) — there's no shared
// global cache so a stale rate from one caller can't bleed into another.

export type FxCache = Map<string, number>;

export function newFxCache(): FxCache {
  return new Map<string, number>();
}

export async function fxToUsd(currency: string, cache: FxCache): Promise<number> {
  const cur = (currency || "USD").toUpperCase();
  if (cur === "USD") return 1.0;
  const cached = cache.get(cur);
  if (cached !== undefined) return cached;
  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(`${cur}USD=X`)}?range=1d&interval=5m`;
    const data = await yfFetch(url);
    const meta = data?.chart?.result?.[0]?.meta;
    const rate = meta?.regularMarketPrice;
    if (typeof rate === "number" && rate > 0) {
      cache.set(cur, rate);
      return rate;
    }
    logger.warn({ currency: cur }, "FX rate unavailable, falling back to 1.0");
    cache.set(cur, 1.0);
    return 1.0;
  } catch (err: any) {
    logger.warn({ err: err?.message, currency: cur }, "FX rate fetch failed, falling back to 1.0");
    cache.set(cur, 1.0);
    return 1.0;
  }
}
