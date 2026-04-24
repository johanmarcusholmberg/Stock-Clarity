import { useCallback, useMemo } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { CHART_RANGES, getChart } from "../services/stockApi";
import { buildChartSeries } from "../utils/chartSeries";

/** Cached shape per range — prices/timestamps have the prev-close anchor
 * already prepended so the chart component doesn't repeat the shaping. */
export interface RangeChartData {
  prices: number[];
  timestamps: number[];
  previousClose: number | null;
  hasAnchor: boolean;
}

/** Stale-time per range index (milliseconds).
 * Controls how long TanStack Query considers data "fresh" before triggering
 * a background refetch. Shorter ranges = shorter stale times because intraday
 * data changes more frequently. These don't block the UI — stale data is shown
 * while the refetch runs in the background.
 *
 * Manual refresh (Pro/Premium button) calls refreshAll() which cancels any
 * in-flight fetches, bypasses both client stale times AND the server cache
 * (via fresh=1), and populates the cache with the new data.
 */
const STALE_TIMES: number[] = [
  30_000,       // 0 — 1D:  30 s
  5 * 60_000,   // 1 — 5D:  5 min
  5 * 60_000,   // 2 — 1M:  5 min
  30 * 60_000,  // 3 — YTD: 30 min
  30 * 60_000,  // 4 — 1Y:  30 min
  24 * 3600_000, // 5 — 3Y: 24 h
  24 * 3600_000, // 6 — 5Y: 24 h
];

/**
 * Fetches chart data for every range in `CHART_RANGES` in parallel using
 * TanStack Query.  Each range has its own query key and stale time, so
 * switching ranges is an instant view-state swap once the initial fetch
 * completes.
 */
export function useMultiRangeChart(ticker: string | undefined) {
  const queryClient = useQueryClient();

  const queries = useQueries({
    queries: CHART_RANGES.map((r, idx) => ({
      queryKey: ["chart", ticker, r.range, r.interval] as const,
      queryFn: async (): Promise<RangeChartData> => {
        const chart = await getChart(ticker!, r.range, r.interval);
        const prevClose = chart.meta?.chartPreviousClose ?? null;
        // Prepend the opening anchor (= previous period's close) so every
        // range renders the same way: the first plotted point is the open.
        const shaped = buildChartSeries(chart.prices, chart.timestamps, prevClose);
        return {
          prices: shaped.prices,
          timestamps: shaped.timestamps,
          previousClose: prevClose,
          hasAnchor: shaped.hasAnchor,
        };
      },
      enabled: !!ticker,
      staleTime: STALE_TIMES[idx],
      // Keep previous data visible while a background refetch is in-flight
      // so the chart never blanks on a stale-time-triggered refresh.
      placeholderData: (prev: RangeChartData | undefined) => prev,
      // Retry once — keeps the UI responsive if a single range times out
      retry: 1,
    })),
  });

  /** Per-range data lookup (same Record<number, …> shape the component used). */
  const data = useMemo(() => {
    const map: Record<number, RangeChartData | undefined> = {};
    queries.forEach((q, idx) => {
      map[idx] = q.data;
    });
    return map;
  }, [queries]);

  /** Per-range timestamp of when the currently displayed data was received.
   * Drives the "Updated <n> ago" label next to the cooldown. */
  const lastUpdatedAt = useMemo(() => {
    const map: Record<number, number | null> = {};
    queries.forEach((q, idx) => {
      map[idx] = q.dataUpdatedAt || null;
    });
    return map;
  }, [queries]);

  /** Check if a specific range is still in its first fetch. */
  const isLoading = useCallback(
    (rangeIndex: number) => queries[rangeIndex]?.isLoading ?? true,
    [queries],
  );

  /** Check if a specific range's fetch failed. */
  const isError = useCallback(
    (rangeIndex: number) => queries[rangeIndex]?.isError ?? false,
    [queries],
  );

  /** Force-refresh every range for the current ticker.
   *
   * Used by the manual refresh button. Steps:
   *   1. Cancel any in-flight fetches for this ticker.
   *   2. Fetch each range with `fresh=1` so the server cache is bypassed
   *      (the 60s 1D server cache was swallowing refreshes on the 1-min
   *      Premium cooldown — client-side invalidation alone wasn't enough).
   *   3. Write the results into the cache via setQueryData so every
   *      subscribed consumer (chart, mini-charts) re-renders.
   *
   * Throws on any range failure — caller shows a "refresh failed" state.
   */
  const refreshAll = useCallback(async () => {
    if (!ticker) return;
    console.log(`[chart-refresh] triggered for ${ticker}`);
    await queryClient.cancelQueries({ queryKey: ["chart", ticker] });

    const results = await Promise.allSettled(
      CHART_RANGES.map(async (r) => {
        const chart = await getChart(ticker, r.range, r.interval, { fresh: true });
        const prevClose = chart.meta?.chartPreviousClose ?? null;
        const shaped = buildChartSeries(chart.prices, chart.timestamps, prevClose);
        const next: RangeChartData = {
          prices: shaped.prices,
          timestamps: shaped.timestamps,
          previousClose: prevClose,
          hasAnchor: shaped.hasAnchor,
        };
        queryClient.setQueryData(["chart", ticker, r.range, r.interval], next);
        return { range: r.range, points: next.prices.length };
      }),
    );

    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      console.warn(`[chart-refresh] ${failed}/${results.length} ranges failed for ${ticker}`);
      throw new Error("One or more ranges failed to refresh");
    }
    console.log(`[chart-refresh] all ${results.length} ranges refreshed for ${ticker}`);
  }, [queryClient, ticker]);

  return { data, lastUpdatedAt, isLoading, isError, refreshAll };
}
