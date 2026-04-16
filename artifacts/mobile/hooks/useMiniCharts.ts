import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { getChart } from "../services/stockApi";

/**
 * Dedicated mini-chart data source for the Home / watchlist screen.
 *
 * Fetches 1Y chart data for every ticker in `tickers` using per-ticker
 * TanStack Query caching.  Query keys match the pattern used by
 * useMultiRangeChart ("chart", ticker, range, interval) so the cache is
 * shared with the stock detail page — navigating to a stock and back
 * doesn't re-fetch.
 *
 * Returns a single `Record<string, number[]>` that updates as queries
 * resolve.  Because all queries fire in parallel (no artificial delays),
 * React 18 automatic batching collapses the state updates into very few
 * renders instead of one-per-row cascading redraws.
 */

const MINI_CHART_RANGE = "1y";
const MINI_CHART_INTERVAL = "1d";
const STALE_TIME = 30 * 60_000; // 30 minutes — matches the 1Y stale time in useMultiRangeChart

export interface MiniChartMap {
  /** ticker -> 1Y price array.  Missing key = not yet loaded. */
  charts: Record<string, number[]>;
  /** True while *any* ticker's chart is still in its initial fetch. */
  isLoading: boolean;
}

export function useMiniCharts(tickers: string[]): MiniChartMap {
  // Sort tickers so the hook identity is stable regardless of render-time
  // ordering.  useQueries is order-sensitive for its internal array, but
  // we always map back by ticker so the output is order-independent.
  const sortedTickers = useMemo(
    () => [...tickers].sort(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tickers.join(",")],
  );

  const queries = useQueries({
    queries: sortedTickers.map((ticker) => ({
      queryKey: ["chart", ticker, MINI_CHART_RANGE, MINI_CHART_INTERVAL] as const,
      queryFn: async () => {
        const chart = await getChart(ticker, MINI_CHART_RANGE, MINI_CHART_INTERVAL);
        // Guard: treat empty API responses as errors so TanStack Query
        // preserves the previously cached mini-chart instead of replacing
        // good data with nothing. This prevents sparklines from vanishing
        // after "Refresh Stock" triggers a cache invalidation.
        if (!chart.prices?.length) {
          throw new Error(`Empty 1Y chart data for ${ticker}`);
        }
        return chart.prices;
      },
      staleTime: STALE_TIME,
      // Keep previous data so charts don't blank on background refetch
      placeholderData: (prev: number[] | undefined) => prev,
      retry: 1,
      enabled: !!ticker,
    })),
  });

  // Build a lightweight identity string from query data lengths so the memo
  // only recomputes when actual data changes, not on every render (useQueries
  // returns a new array reference each time).
  const dataIdentity = queries
    .map((q) => (q.data ? q.data.length : "x"))
    .join(",");

  const charts = useMemo(() => {
    const map: Record<string, number[]> = {};
    queries.forEach((q, idx) => {
      const prices = q.data;
      // Only include entries with enough data points for a meaningful sparkline
      if (prices && prices.length >= 4) {
        map[sortedTickers[idx]] = prices;
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataIdentity, sortedTickers]);

  const isLoading = queries.some((q) => q.isLoading);

  return { charts, isLoading };
}
