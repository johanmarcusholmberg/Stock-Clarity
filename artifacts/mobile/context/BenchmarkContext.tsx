import AsyncStorage from "@react-native-async-storage/async-storage";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  BENCHMARKS,
  benchmarkInfo,
  type Benchmark,
} from "@/hooks/useBenchmarkSeries";

const STORAGE_KEY = "@stockclarify_benchmark_v1";

interface BenchmarkContextValue {
  /** "auto" means infer from portfolio currency. */
  selection: Benchmark | "auto";
  /** Resolves "auto" to a concrete Benchmark using `autoFallback`. */
  resolve: (autoFallback: Benchmark) => Benchmark;
  setSelection: (next: Benchmark | "auto") => void;
}

const BenchmarkContext = createContext<BenchmarkContextValue | null>(null);

function isValidBenchmark(value: unknown): value is Benchmark {
  return (
    typeof value === "string" && BENCHMARKS.some((b) => b.id === value)
  );
}

export function BenchmarkProvider({ children }: { children: React.ReactNode }) {
  const [selection, setSelectionState] = useState<Benchmark | "auto">("auto");
  // Tracks whether the user has explicitly set a value during this session.
  // Hydration must NOT overwrite a value the user has already chosen if the
  // AsyncStorage read happens to resolve after the user's tap.
  const userTouched = useRef(false);

  // Hydrate from AsyncStorage on first mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || userTouched.current) return;
        if (raw === "auto" || isValidBenchmark(raw)) {
          setSelectionState(raw);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setSelection = useCallback((next: Benchmark | "auto") => {
    userTouched.current = true;
    setSelectionState(next);
    AsyncStorage.setItem(STORAGE_KEY, next).catch(() => {});
  }, []);

  const resolve = useCallback(
    (autoFallback: Benchmark): Benchmark => {
      if (selection === "auto") return autoFallback;
      // Defensive — if for any reason the stored value is no longer a valid
      // benchmark id (e.g. removed from the catalog) fall back to auto.
      return benchmarkInfo(selection).id;
    },
    [selection],
  );

  const value = useMemo<BenchmarkContextValue>(
    () => ({ selection, resolve, setSelection }),
    [selection, resolve, setSelection],
  );

  return (
    <BenchmarkContext.Provider value={value}>
      {children}
    </BenchmarkContext.Provider>
  );
}

export function useBenchmark(): BenchmarkContextValue {
  const ctx = useContext(BenchmarkContext);
  if (!ctx) {
    throw new Error("useBenchmark must be used inside <BenchmarkProvider>");
  }
  return ctx;
}
