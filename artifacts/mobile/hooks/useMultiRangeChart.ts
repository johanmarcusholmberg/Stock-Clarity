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
 * Manual refresh (Pro/Premium button) calls invalidateAll() which bypasses
 * stale times and forces an immediate refetch of every range.
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

  /** Invalidate all chart queries for the current ticker (manual refresh). */
  const invalidateAll = useCallback(() => {
    if (!ticker) return;
    queryClient.invalidateQueries({ queryKey: ["chart", ticker] });
  }, [queryClient, ticker]);

  return { data, isLoading, isError, invalidateAll };
}
