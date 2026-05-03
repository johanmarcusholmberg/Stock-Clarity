import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useWatchlist } from "@/context/WatchlistContext";
import { getEvents, type EventPeriod, type StockEvent } from "@/services/stockApi";

// Cache keys are versioned — v2 invalidates older caches that stored
// pre-refactor DigestEntry shapes with sourceUrl fields. New entries use
// the StockEvent shape (with event.url) fetched through getEvents().
// v3 keys: cache payload now includes the ticker signature it was built
// from, so changes to the watchlist invalidate stale entries even within
// the same day/week.
const DAILY_CACHE_KEY = "@stockclarify_digest_daily_v3";
const DAILY_DATE_KEY = "@stockclarify_digest_daily_date_v3";
const WEEKLY_CACHE_KEY = "@stockclarify_digest_weekly_v3";
const WEEKLY_DATE_KEY = "@stockclarify_digest_weekly_date_v3";

interface DigestCachePayload {
  tickerSig: string;
  entries: StockEvent[];
}

function tickerSignature(tickers: string[]): string {
  return [...tickers].sort().join(",");
}

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function weekString() {
  const d = new Date();
  const week = Math.ceil(d.getDate() / 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-W${week}`;
}

interface DigestContextValue {
  dailyEntries: StockEvent[];
  dailyLoading: boolean;
  weeklyEntries: StockEvent[];
  weeklyLoading: boolean;
  /** Force=true bypasses the cache and re-fetches. */
  loadDaily: (force?: boolean) => Promise<void>;
  loadWeekly: (force?: boolean) => Promise<void>;
}

const DigestContext = createContext<DigestContextValue | null>(null);

async function fetchAll(tickers: string[], period: EventPeriod): Promise<StockEvent[]> {
  const results = await Promise.allSettled(
    tickers.map(async (ticker) => {
      const evts = await getEvents(ticker, period);
      return evts.slice(0, 3);
    })
  );
  return results
    .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
}

/**
 * Eagerly fetches both the daily and weekly digests at app-root level so
 * they're ready by the time the user opens the Digest tab. Triggered on
 * mount (= login, since this provider lives inside the auth-gated tab
 * tree), whenever the watchlist ticker set changes, and whenever the
 * active portfolio changes. Cached results are persisted under the same
 * AsyncStorage keys the Digest tab already used, so first-render of the
 * tab is instant when a same-day/same-week cache exists.
 */
export function DigestProvider({ children }: { children: React.ReactNode }) {
  const { stocks, activeFolderId } = useWatchlist();
  const [dailyEntries, setDailyEntries] = useState<StockEvent[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyEntries, setWeeklyEntries] = useState<StockEvent[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const loadDigest = useCallback(
    async (
      period: EventPeriod,
      cacheKey: string,
      dateKey: string,
      windowString: string,
      setEntries: (e: StockEvent[]) => void,
      setLoading: (b: boolean) => void,
      force = false,
    ) => {
      const currentTickers = Object.keys(stocks);
      if (!currentTickers.length) {
        setEntries([]);
        return;
      }

      const sig = tickerSignature(currentTickers);
      const cached = await AsyncStorage.getItem(cacheKey);
      const cachedDate = await AsyncStorage.getItem(dateKey);

      // Cache is only reusable when both the time-window AND the ticker
      // signature still match — otherwise watchlist edits would silently
      // serve stale entries until the day/week rolls over.
      if (!force && cached && cachedDate === windowString) {
        try {
          const parsed = JSON.parse(cached) as DigestCachePayload;
          if (parsed.tickerSig === sig && parsed.entries.length > 0) {
            setEntries(parsed.entries);
            return;
          }
        } catch {}
      }

      setLoading(true);
      try {
        const entries = await fetchAll(currentTickers, period);
        setEntries(entries);
        const payload: DigestCachePayload = { tickerSig: sig, entries };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
        await AsyncStorage.setItem(dateKey, windowString);
      } catch {
        if (cached) {
          try {
            const parsed = JSON.parse(cached) as DigestCachePayload;
            if (parsed.tickerSig === sig) setEntries(parsed.entries);
          } catch {}
        }
      } finally {
        setLoading(false);
      }
    },
    [stocks],
  );

  const loadDaily = useCallback(
    (force = false) =>
      loadDigest(
        "day",
        DAILY_CACHE_KEY,
        DAILY_DATE_KEY,
        todayString(),
        setDailyEntries,
        setDailyLoading,
        force,
      ),
    [loadDigest],
  );

  const loadWeekly = useCallback(
    (force = false) =>
      loadDigest(
        "week",
        WEEKLY_CACHE_KEY,
        WEEKLY_DATE_KEY,
        weekString(),
        setWeeklyEntries,
        setWeeklyLoading,
        force,
      ),
    [loadDigest],
  );

  // Eager-load on mount (= login here), whenever the watchlist ticker set
  // changes, and whenever the user switches portfolios. Joining is the
  // cheapest stable key for a Set-of-strings dep that React's shallow
  // comparison can't handle natively. Cache lookups (validated by ticker
  // signature) make portfolio switches free when fresh data exists.
  const tickerKey = Object.keys(stocks).join(",");
  useEffect(() => {
    if (tickerKey.length === 0) {
      setDailyEntries([]);
      setWeeklyEntries([]);
      return;
    }
    loadDaily();
    loadWeekly();
  }, [tickerKey, activeFolderId]);

  return (
    <DigestContext.Provider
      value={{
        dailyEntries,
        dailyLoading,
        weeklyEntries,
        weeklyLoading,
        loadDaily,
        loadWeekly,
      }}
    >
      {children}
    </DigestContext.Provider>
  );
}

export function useDigest(): DigestContextValue {
  const ctx = useContext(DigestContext);
  if (!ctx) throw new Error("useDigest must be used within a DigestProvider");
  return ctx;
}
