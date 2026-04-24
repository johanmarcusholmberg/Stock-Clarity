import { useQuery } from "@tanstack/react-query";
import { getChart } from "@/services/stockApi";

export type Benchmark = "SPX" | "OMXS30" | "STOXX";

/**
 * Picks a reasonable default benchmark based on the majority currency of a
 * portfolio. SEK → OMXS30, EUR → STOXX 600, anything else → S&P 500.
 */
export function inferBenchmark(currencies: string[]): Benchmark {
  const tally: Record<string, number> = {};
  for (const c of currencies) {
    if (!c) continue;
    tally[c] = (tally[c] ?? 0) + 1;
  }
  const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0]?.[0];
  if (top === "SEK") return "OMXS30";
  if (top === "EUR") return "STOXX";
  return "SPX";
}

export function benchmarkLabel(b: Benchmark): string {
  if (b === "OMXS30") return "OMXS30";
  if (b === "STOXX") return "STOXX 600";
  return "S&P 500";
}

// Yahoo symbols for the indices.
const YAHOO_SYMBOL: Record<Benchmark, string> = {
  SPX: "^GSPC",
  OMXS30: "^OMX",
  STOXX: "^STOXX",
};

const STALE_TIME = 30 * 60_000;

/**
 * Fetches 1-year daily closes for a benchmark index. Shares TanStack cache
 * with useMiniCharts / useMultiRangeChart so the same series is reused across
 * the Insights and stock-detail screens.
 */
export function useBenchmarkSeries(benchmark: Benchmark) {
  const symbol = YAHOO_SYMBOL[benchmark];
  return useQuery({
    queryKey: ["chart", symbol, "1y", "1d"],
    queryFn: async () => {
      const chart = await getChart(symbol, "1y", "1d");
      return chart;
    },
    staleTime: STALE_TIME,
    gcTime: STALE_TIME * 2,
  });
}
