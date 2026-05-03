import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useWatchlist } from "@/context/WatchlistContext";
import { getEvents, type EventPeriod, type StockEvent } from "@/services/stockApi";

// Cache keys are versioned — v2 invalidates older caches that stored
// pre-refactor DigestEntry shapes with sourceUrl fields. New entries use
// the StockEvent shape (with event.url) fetched through getEvents().
// v3 keys: cache payload includes the ticker signature it was built
// from, so changes to the watchlist invalidate stale entries even within
// the same day/week.
// v4 keys are namespaced per Clerk userId so a shared device never
// shows one user's brief to another after sign-out / sign-in.
const DAILY_PREFIX = "@stockclarify_digest_daily_v4";
const WEEKLY_PREFIX = "@stockclarify_digest_weekly_v4";

function dailyCacheKey(userId: string) {
  return `${DAILY_PREFIX}:${userId}`;
}
function dailyDateKey(userId: string) {
  return `${DAILY_PREFIX}_date:${userId}`;
}
function weeklyCacheKey(userId: string) {
  return `${WEEKLY_PREFIX}:${userId}`;
}
function weeklyDateKey(userId: string) {
  return `${WEEKLY_PREFIX}_date:${userId}`;
}

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
 * active portfolio changes. Cache keys are scoped per Clerk userId, and
 * cached payloads carry a ticker signature so portfolio/watchlist edits
 * never serve stale data.
 *
 * Stale-while-revalidate: when the cache is present but its ticker
 * signature differs from the current watchlist (e.g. user just added a
 * stock), we keep the old entries on screen and fetch in the background
 * instead of flashing a spinner.
 */
export function DigestProvider({ children }: { children: React.ReactNode }) {
  const { stocks, activeFolderId } = useWatchlist();
  const { userId } = useAuth();
  const [dailyEntries, setDailyEntries] = useState<StockEvent[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyEntries, setWeeklyEntries] = useState<StockEvent[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Per-stream request epochs. Each load() increments the counter and
  // captures a token; only the latest in-flight request is allowed to
  // commit results. This guards against stale async fetches overwriting
  // state after a user switch or a rapid watchlist change.
  const dailyEpoch = useRef(0);
  const weeklyEpoch = useRef(0);

  const loadDigest = useCallback(
    async (
      period: EventPeriod,
      cacheKey: string,
      dateKey: string,
      windowString: string,
      setEntries: (e: StockEvent[]) => void,
      setLoading: (b: boolean) => void,
      epochRef: React.MutableRefObject<number>,
      requestUserId: string,
      force = false,
    ) => {
      const token = ++epochRef.current;
      const isCurrent = () =>
        token === epochRef.current && requestUserId === userId;

      const currentTickers = Object.keys(stocks);
      if (!currentTickers.length) {
        if (isCurrent()) setEntries([]);
        return;
      }

      const sig = tickerSignature(currentTickers);
      const cached = await AsyncStorage.getItem(cacheKey);
      const cachedDate = await AsyncStorage.getItem(dateKey);
      if (!isCurrent()) return;

      let hasUsableCache = false;
      let sigMatches = false;
      let cachedIsEmptyForWindow = false;
      if (cached && cachedDate === windowString) {
        try {
          const parsed = JSON.parse(cached) as DigestCachePayload;
          sigMatches = parsed.tickerSig === sig;
          if (parsed.entries.length > 0) {
            // Show what we have so the UI has something to render while a
            // background refresh runs (stale-while-revalidate).
            setEntries(parsed.entries);
            hasUsableCache = true;
          } else if (sigMatches) {
            // Legitimate empty result for this exact ticker set in this
            // window — treat as a cache hit so we don't flash a spinner.
            setEntries([]);
            hasUsableCache = true;
            cachedIsEmptyForWindow = true;
          }
        } catch {}
      }

      // Fresh cache hit and no force-refresh — nothing else to do.
      if (!force && hasUsableCache && sigMatches) return;

      // Only show the spinner when there's nothing to display. If we
      // already painted stale entries, refresh silently in the background.
      if (!hasUsableCache) setLoading(true);
      try {
        const entries = await fetchAll(currentTickers, period);
        if (!isCurrent()) return;
        setEntries(entries);
        const payload: DigestCachePayload = { tickerSig: sig, entries };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
        await AsyncStorage.setItem(dateKey, windowString);
      } catch {
        // Cached entries (if any) are already on screen; nothing to undo.
        // Suppress unused-var lint in the empty-cache branch.
        void cachedIsEmptyForWindow;
      } finally {
        if (!hasUsableCache && isCurrent()) setLoading(false);
      }
    },
    [stocks, userId],
  );

  const loadDaily = useCallback(
    async (force = false) => {
      if (!userId) return;
      await loadDigest(
        "day",
        dailyCacheKey(userId),
        dailyDateKey(userId),
        todayString(),
        setDailyEntries,
        setDailyLoading,
        dailyEpoch,
        userId,
        force,
      );
    },
    [loadDigest, userId],
  );

  const loadWeekly = useCallback(
    async (force = false) => {
      if (!userId) return;
      await loadDigest(
        "week",
        weeklyCacheKey(userId),
        weeklyDateKey(userId),
        weekString(),
        setWeeklyEntries,
        setWeeklyLoading,
        weeklyEpoch,
        userId,
        force,
      );
    },
    [loadDigest, userId],
  );

  // Reset in-memory state and bump epochs when the signed-in user
  // changes so a fresh login never momentarily sees the previous user's
  // entries, and any in-flight fetches from before the switch are
  // rejected when they resolve.
  useEffect(() => {
    dailyEpoch.current++;
    weeklyEpoch.current++;
    setDailyEntries([]);
    setWeeklyEntries([]);
  }, [userId]);

  // Eager-load on mount (= login here), whenever the watchlist ticker set
  // changes, and whenever the user switches portfolios. Joining is the
  // cheapest stable key for a Set-of-strings dep that React's shallow
  // comparison can't handle natively. Cache lookups (validated by ticker
  // signature) make portfolio switches free when fresh data exists.
  const tickerKey = Object.keys(stocks).join(",");
  useEffect(() => {
    if (!userId || tickerKey.length === 0) {
      setDailyEntries([]);
      setWeeklyEntries([]);
      return;
    }
    loadDaily();
    loadWeekly();
  }, [tickerKey, activeFolderId, userId]);

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
