import { useQuery } from "@tanstack/react-query";
import { getChart } from "@/services/stockApi";

export type Benchmark =
  | "SPX"
  | "NDX"
  | "DJI"
  | "RUT"
  | "OMXS30"
  | "STOXX"
  | "FTSE"
  | "DAX"
  | "CAC"
  | "N225"
  | "HSI"
  | "TSX";

export interface BenchmarkInfo {
  id: Benchmark;
  label: string;
  region: string;
  yahooSymbol: string;
}

/**
 * Catalog of all selectable benchmark indices. Order matters — it's the order
 * shown in the picker.
 */
export const BENCHMARKS: BenchmarkInfo[] = [
  { id: "SPX", label: "S&P 500", region: "United States", yahooSymbol: "^GSPC" },
  { id: "NDX", label: "NASDAQ 100", region: "United States", yahooSymbol: "^NDX" },
  { id: "DJI", label: "Dow Jones", region: "United States", yahooSymbol: "^DJI" },
  { id: "RUT", label: "Russell 2000", region: "United States", yahooSymbol: "^RUT" },
  { id: "OMXS30", label: "OMXS30", region: "Sweden", yahooSymbol: "^OMX" },
  { id: "STOXX", label: "STOXX 600", region: "Europe", yahooSymbol: "^STOXX" },
  { id: "FTSE", label: "FTSE 100", region: "United Kingdom", yahooSymbol: "^FTSE" },
  { id: "DAX", label: "DAX 40", region: "Germany", yahooSymbol: "^GDAXI" },
  { id: "CAC", label: "CAC 40", region: "France", yahooSymbol: "^FCHI" },
  { id: "N225", label: "Nikkei 225", region: "Japan", yahooSymbol: "^N225" },
  { id: "HSI", label: "Hang Seng", region: "Hong Kong", yahooSymbol: "^HSI" },
  { id: "TSX", label: "S&P/TSX", region: "Canada", yahooSymbol: "^GSPTSE" },
];

const BY_ID: Record<Benchmark, BenchmarkInfo> = BENCHMARKS.reduce(
  (acc, b) => {
    acc[b.id] = b;
    return acc;
  },
  {} as Record<Benchmark, BenchmarkInfo>,
);

/**
 * Picks a reasonable default benchmark based on the majority currency of a
 * portfolio. SEK → OMXS30, EUR → STOXX 600, GBP → FTSE 100, JPY → Nikkei 225,
 * HKD → Hang Seng, CAD → S&P/TSX, anything else → S&P 500.
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
  if (top === "GBP") return "FTSE";
  if (top === "JPY") return "N225";
  if (top === "HKD") return "HSI";
  if (top === "CAD") return "TSX";
  return "SPX";
}

export function benchmarkLabel(b: Benchmark): string {
  return BY_ID[b]?.label ?? b;
}

export function benchmarkInfo(b: Benchmark): BenchmarkInfo {
  return BY_ID[b] ?? BY_ID.SPX;
}

const STALE_TIME = 30 * 60_000;

/**
 * Fetches 1-year daily closes for a benchmark index. Shares TanStack cache
 * with useMiniCharts / useMultiRangeChart so the same series is reused across
 * the Insights and stock-detail screens.
 */
export function useBenchmarkSeries(benchmark: Benchmark) {
  const symbol = benchmarkInfo(benchmark).yahooSymbol;
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
