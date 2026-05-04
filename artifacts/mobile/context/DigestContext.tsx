import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@/lib/clerk";
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
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
// v5 keys are additionally namespaced by activeFolderId — fetches now
// scope to the active portfolio's tickers only, and each portfolio gets
// its own persisted cache. Also coincides with the weekString switch to
// ISO 8601 format (v4 weekly cache entries from the old format are
// effectively orphaned and will be re-fetched on first read).
const DAILY_PREFIX = "@stockclarify_digest_daily_v5";
const WEEKLY_PREFIX = "@stockclarify_digest_weekly_v5";

// Max parallel getEvents requests. Keeps large watchlists from
// hammering the API and from stalling on flaky mobile networks.
const FETCH_CONCURRENCY = 8;

function dailyCacheKey(userId: string, folderId: string) {
  return `${DAILY_PREFIX}:${userId}:${folderId}`;
}
function dailyDateKey(userId: string, folderId: string) {
  return `${DAILY_PREFIX}_date:${userId}:${folderId}`;
}
function weeklyCacheKey(userId: string, folderId: string) {
  return `${WEEKLY_PREFIX}:${userId}:${folderId}`;
}
function weeklyDateKey(userId: string, folderId: string) {
  return `${WEEKLY_PREFIX}_date:${userId}:${folderId}`;
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

// ISO 8601 week number — week starts Monday, week 1 is the week
// containing the year's first Thursday. Avoids the previous bug where
// `Math.ceil(date / 7)` reset week numbers mid-month (e.g. Jan 31 →
// Feb 1 jumped from W5 back to W1) and caused the weekly cache window
// to expire incorrectly.
function weekString() {
  const d = new Date();
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7; // Sun=0 → 7
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const isoYear = target.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
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

/**
 * Run an async mapping function over `items` with at most `limit`
 * promises in flight at once. Order of returned results matches input.
 * Used to cap parallel `getEvents` calls so a 50-ticker watchlist
 * doesn't fire 50 simultaneous requests.
 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  const safeLimit = Math.max(1, Math.min(limit, items.length));
  const workers = Array.from({ length: safeLimit }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        results[i] = { status: "fulfilled", value: await fn(items[i], i) };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchAll(tickers: string[], period: EventPeriod): Promise<StockEvent[]> {
  const results = await mapWithConcurrency(tickers, FETCH_CONCURRENCY, async (ticker) => {
    const evts = await getEvents(ticker, period);
    return evts.slice(0, 3);
  });
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
 * tree), whenever the active portfolio's ticker set changes, and
 * whenever the user switches portfolios. Cache keys are scoped per
 * (userId, activeFolderId) and cached payloads carry a ticker signature
 * so portfolio/watchlist edits never serve stale data.
 *
 * Stale-while-revalidate: when the cache is present but its ticker
 * signature differs from the current portfolio (e.g. user just added a
 * stock), we keep the old entries on screen and fetch in the background
 * instead of flashing a spinner.
 */
export function DigestProvider({ children }: { children: React.ReactNode }) {
  const { folders, activeFolderId } = useWatchlist();
  const { userId } = useAuth();
  const [dailyEntries, setDailyEntries] = useState<StockEvent[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyEntries, setWeeklyEntries] = useState<StockEvent[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  // Resolve the active portfolio's ticker list. The sentinel "default"
  // folder shows the union of every folder's tickers.
  const portfolioTickers = useMemo(() => {
    if (activeFolderId === "default") {
      return Array.from(new Set(folders.flatMap((f) => f.tickers)));
    }
    const f = folders.find((x) => x.id === activeFolderId);
    return f?.tickers ?? [];
  }, [folders, activeFolderId]);

  // Per-stream request epochs. Each load() increments the counter and
  // captures a token; only the latest in-flight request is allowed to
  // commit results. This guards against stale async fetches overwriting
  // state after a user switch, portfolio switch, or rapid watchlist edit.
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
      requestFolderId: string,
      requestTickers: string[],
      force = false,
    ) => {
      const token = ++epochRef.current;
      const isCurrent = () =>
        token === epochRef.current &&
        requestUserId === userId &&
        requestFolderId === activeFolderId;

      if (!requestTickers.length) {
        if (isCurrent()) setEntries([]);
        return;
      }

      const sig = tickerSignature(requestTickers);
      const cached = await AsyncStorage.getItem(cacheKey);
      const cachedDate = await AsyncStorage.getItem(dateKey);
      if (!isCurrent()) return;

      let hasUsableCache = false;
      let sigMatches = false;
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
          }
        } catch {}
      }

      // Fresh cache hit and no force-refresh — nothing else to do.
      if (!force && hasUsableCache && sigMatches) return;

      // Only show the spinner when there's nothing to display. If we
      // already painted stale entries, refresh silently in the background.
      if (!hasUsableCache) setLoading(true);
      try {
        const entries = await fetchAll(requestTickers, period);
        if (!isCurrent()) return;
        setEntries(entries);
        const payload: DigestCachePayload = { tickerSig: sig, entries };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(payload));
        await AsyncStorage.setItem(dateKey, windowString);
      } catch {
        // Cached entries (if any) are already on screen; nothing to undo.
      } finally {
        if (!hasUsableCache && isCurrent()) setLoading(false);
      }
    },
    [userId, activeFolderId],
  );

  const loadDaily = useCallback(
    async (force = false) => {
      if (!userId) return;
      await loadDigest(
        "day",
        dailyCacheKey(userId, activeFolderId),
        dailyDateKey(userId, activeFolderId),
        todayString(),
        setDailyEntries,
        setDailyLoading,
        dailyEpoch,
        userId,
        activeFolderId,
        portfolioTickers,
        force,
      );
    },
    [loadDigest, userId, activeFolderId, portfolioTickers],
  );

  const loadWeekly = useCallback(
    async (force = false) => {
      if (!userId) return;
      await loadDigest(
        "week",
        weeklyCacheKey(userId, activeFolderId),
        weeklyDateKey(userId, activeFolderId),
        weekString(),
        setWeeklyEntries,
        setWeeklyLoading,
        weeklyEpoch,
        userId,
        activeFolderId,
        portfolioTickers,
        force,
      );
    },
    [loadDigest, userId, activeFolderId, portfolioTickers],
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

  // Eager-load on mount (= login), whenever the active portfolio's
  // ticker set changes, and whenever the user switches portfolios.
  // Joining is the cheapest stable key for an array dep that React's
  // shallow comparison can't handle natively. Cache lookups (validated
  // by ticker signature) make portfolio switches free when fresh data
  // exists for that portfolio.
  //
  // Bump both epochs unconditionally before deciding what to do, so any
  // in-flight fetches from the previous folder/ticker-set are rejected
  // when they resolve — including the early-return empty-folder branch
  // (otherwise a slow prior fetch could repaint stale cross-portfolio
  // entries on top of the now-empty state).
  const tickerKey = portfolioTickers.join(",");
  useEffect(() => {
    dailyEpoch.current++;
    weeklyEpoch.current++;
    if (!userId || tickerKey.length === 0) {
      setDailyEntries([]);
      setWeeklyEntries([]);
      return;
    }
    loadDaily();
    loadWeekly();
  }, [tickerKey, activeFolderId, userId]);

  // Refresh when the app comes back to the foreground so an overnight
  // session never serves yesterday's brief. Force=true: when the
  // date/week window rolled over, the cache is invalid and we want a
  // fresh fetch; when it didn't, cached entries stay on screen (SWR)
  // while a background revalidation runs.
  const lastForegroundRef = useRef<{ day: string; week: string }>({
    day: todayString(),
    week: weekString(),
  });
  useEffect(() => {
    if (!userId) return;
    const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
      if (next !== "active") return;
      lastForegroundRef.current.day = todayString();
      lastForegroundRef.current.week = weekString();
      loadDaily(true);
      loadWeekly(true);
    });
    return () => sub.remove();
  }, [userId, loadDaily, loadWeekly]);

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
