import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWatchlist } from "@/context/WatchlistContext";
import { getEvents, type StockEvent } from "@/services/stockApi";

// Cache keys are versioned — v2 invalidates older caches that stored
// pre-refactor DigestEntry shapes with sourceUrl fields. New entries use
// the StockEvent shape (with event.url) fetched through getEvents().
const DAILY_CACHE_KEY = "@stockclarify_digest_daily_v2";
const DAILY_DATE_KEY = "@stockclarify_digest_daily_date_v2";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

interface DigestContextValue {
  dailyEntries: StockEvent[];
  dailyLoading: boolean;
  /** Force=true bypasses the daily cache and re-fetches. */
  loadDaily: (force?: boolean) => Promise<void>;
}

const DigestContext = createContext<DigestContextValue | null>(null);

/**
 * Eagerly fetches the daily digest at app-root level so it's ready by the
 * time the user opens the Digest tab. Triggered on mount (= login, since
 * this provider lives inside the auth-gated tab tree) and whenever the
 * watchlist ticker set changes. Cached results are persisted under the
 * same AsyncStorage keys the Digest tab already used, so first-render of
 * the tab is instant when a same-day cache exists.
 */
export function DigestProvider({ children }: { children: React.ReactNode }) {
  const { stocks } = useWatchlist();
  const [dailyEntries, setDailyEntries] = useState<StockEvent[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);

  const loadDaily = useCallback(async (force = false) => {
    const currentTickers = Object.keys(stocks);
    if (!currentTickers.length) {
      setDailyEntries([]);
      return;
    }

    const cached = await AsyncStorage.getItem(DAILY_CACHE_KEY);
    const cachedDate = await AsyncStorage.getItem(DAILY_DATE_KEY);

    if (!force && cached && cachedDate === todayString()) {
      try {
        const parsed = JSON.parse(cached) as StockEvent[];
        if (parsed.length > 0) {
          setDailyEntries(parsed);
          return;
        }
      } catch {}
    }

    setDailyLoading(true);
    try {
      const results = await Promise.allSettled(
        currentTickers.map(async (ticker) => {
          const evts = await getEvents(ticker, "day");
          return evts.slice(0, 3);
        })
      );
      const entries = results
        .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
        );
      setDailyEntries(entries);
      await AsyncStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(entries));
      await AsyncStorage.setItem(DAILY_DATE_KEY, todayString());
    } catch {
      if (cached) {
        try {
          setDailyEntries(JSON.parse(cached));
        } catch {}
      }
    } finally {
      setDailyLoading(false);
    }
  }, [stocks]);

  // Eager-load on mount (= login here) and whenever the watchlist ticker
  // set changes. Joining is the cheapest stable key for a Set-of-strings
  // dep that React's shallow comparison can't handle natively.
  const tickerKey = Object.keys(stocks).join(",");
  useEffect(() => {
    if (tickerKey.length > 0) {
      loadDaily();
    }
  }, [tickerKey]);

  return (
    <DigestContext.Provider value={{ dailyEntries, dailyLoading, loadDaily }}>
      {children}
    </DigestContext.Provider>
  );
}

export function useDigest(): DigestContextValue {
  const ctx = useContext(DigestContext);
  if (!ctx) throw new Error("useDigest must be used within a DigestProvider");
  return ctx;
}
