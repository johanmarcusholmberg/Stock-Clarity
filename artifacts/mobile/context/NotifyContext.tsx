import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import {
  getNotifyStatus,
  listSubscriptions,
  listNotifyEvents,
  upsertSubscription,
  patchSubscription,
  type NotifyEvent,
  type NotifyKind,
  type NotifySubscription,
  type NotifyStatus,
  type PatchSubscriptionInput,
  type UpsertSubscriptionInput,
} from "@/services/notifyApi";

const FIRST_TIME_KEY = "@stockclarify_notify_optin_shown_v1";
const REFRESH_INTERVAL_MS = 60_000;
const NEWS_DAILY_CAP = 5; // mirrors NEWS_DAILY_CAP in notifyEvaluator.ts

interface NotifyContextValue {
  /** /api/notify/status — server NOTIFY_ENABLED flag */
  enabled: boolean;
  loading: boolean;
  subscriptions: NotifySubscription[];
  defaults: { news: NotifySubscription | null; earnings: NotifySubscription | null };
  events: NotifyEvent[];
  /** Has the first-time opt-in sheet already been shown on this device? */
  firstTimeShown: boolean;
  /** True once the AsyncStorage flag has been read at least once; consumers
   *  use this to avoid flashing the opt-in sheet during hydration. */
  firstTimeHydrated: boolean;
  /** Daily-cap helpers — count of news events fired in the last 24h. */
  newsDailyCap: number;
  newsDailyUsed: number;
  refresh: () => Promise<void>;
  markFirstTimeShown: () => Promise<void>;
  upsert: (input: UpsertSubscriptionInput) => Promise<NotifySubscription | { error: string }>;
  patch: (
    subId: string,
    patch: PatchSubscriptionInput,
  ) => Promise<NotifySubscription | { error: string }>;
  /** Look up the effective subscription for a symbol+kind, falling back to user default. */
  getEffective: (symbol: string, kind: NotifyKind) => NotifySubscription | null;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

export function NotifyProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [subscriptions, setSubscriptions] = useState<NotifySubscription[]>([]);
  const [defaults, setDefaults] = useState<NotifyContextValue["defaults"]>({
    news: null,
    earnings: null,
  });
  const [events, setEvents] = useState<NotifyEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [firstTimeShown, setFirstTimeShown] = useState(false);
  const [firstTimeHydrated, setFirstTimeHydrated] = useState(false);
  const flagLoadedRef = useRef(false);

  // Hydrate the AsyncStorage first-time flag once. Mark hydrated even on
  // failure so consumers don't block forever — failure means we treat the
  // flag as "not shown", which only re-prompts (acceptable degradation).
  useEffect(() => {
    if (flagLoadedRef.current) return;
    flagLoadedRef.current = true;
    AsyncStorage.getItem(FIRST_TIME_KEY)
      .then((v) => {
        setFirstTimeShown(v === "1");
        setFirstTimeHydrated(true);
      })
      .catch(() => {
        setFirstTimeShown(false);
        setFirstTimeHydrated(true);
      });
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !isSignedIn) {
      setEnabled(false);
      setSubscriptions([]);
      setDefaults({ news: null, earnings: null });
      setEvents([]);
      return;
    }
    setLoading(true);
    try {
      const [statusRes, subsRes, eventsRes] = await Promise.all([
        getNotifyStatus(userId),
        listSubscriptions(userId),
        listNotifyEvents(userId, 50),
      ]);
      setEnabled(statusRes.enabled);
      setSubscriptions(subsRes.subscriptions);
      setDefaults(subsRes.defaults);
      setEvents(eventsRes.events);
    } finally {
      setLoading(false);
    }
  }, [userId, isSignedIn]);

  useEffect(() => {
    refresh();
    if (!userId || !isSignedIn) return;
    const i = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(i);
  }, [refresh, userId, isSignedIn]);

  const markFirstTimeShown = useCallback(async () => {
    setFirstTimeShown(true);
    try {
      await AsyncStorage.setItem(FIRST_TIME_KEY, "1");
    } catch {
      // best-effort — if storage fails we'll re-prompt next launch, which is
      // an acceptable degradation
    }
  }, []);

  const upsert = useCallback<NotifyContextValue["upsert"]>(
    async (input) => {
      if (!userId) return { error: "not signed in" };
      const res = await upsertSubscription(userId, input);
      if (!("error" in res)) {
        // Replace-or-append. Match on (symbol, kind) since a row with the
        // same shape is unique server-side.
        setSubscriptions((prev) => {
          const idx = prev.findIndex(
            (s) => s.symbol === res.symbol && s.kind === res.kind,
          );
          if (idx === -1) return [...prev, res];
          const next = prev.slice();
          next[idx] = res;
          return next;
        });
        if (res.symbol === null) {
          setDefaults((prev) => ({ ...prev, [res.kind]: res }));
        }
      }
      return res;
    },
    [userId],
  );

  const patch = useCallback<NotifyContextValue["patch"]>(
    async (subId, patchInput) => {
      if (!userId) return { error: "not signed in" };
      const res = await patchSubscription(userId, subId, patchInput);
      if (!("error" in res)) {
        setSubscriptions((prev) => prev.map((s) => (s.id === subId ? res : s)));
        if (res.symbol === null) {
          setDefaults((prev) => ({ ...prev, [res.kind]: res }));
        }
      }
      return res;
    },
    [userId],
  );

  const getEffective = useCallback(
    (symbol: string, kind: NotifyKind): NotifySubscription | null => {
      const upper = symbol.toUpperCase();
      const perSymbol = subscriptions.find(
        (s) => s.symbol === upper && s.kind === kind,
      );
      if (perSymbol) return perSymbol;
      return defaults[kind];
    },
    [subscriptions, defaults],
  );

  const newsDailyUsed = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return events.filter(
      (e) => e.kind === "news" && new Date(e.fired_at).getTime() > cutoff,
    ).length;
  }, [events]);

  const value = useMemo<NotifyContextValue>(
    () => ({
      enabled,
      loading,
      subscriptions,
      defaults,
      events,
      firstTimeShown,
      firstTimeHydrated,
      newsDailyCap: NEWS_DAILY_CAP,
      newsDailyUsed,
      refresh,
      markFirstTimeShown,
      upsert,
      patch,
      getEffective,
    }),
    [
      enabled,
      loading,
      subscriptions,
      defaults,
      events,
      firstTimeShown,
      firstTimeHydrated,
      newsDailyUsed,
      refresh,
      markFirstTimeShown,
      upsert,
      patch,
      getEffective,
    ],
  );

  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    return {
      enabled: false,
      loading: false,
      subscriptions: [],
      defaults: { news: null, earnings: null },
      events: [],
      firstTimeShown: true,
      firstTimeHydrated: true,
      newsDailyCap: NEWS_DAILY_CAP,
      newsDailyUsed: 0,
      refresh: async () => {},
      markFirstTimeShown: async () => {},
      upsert: async () => ({ error: "provider not mounted" }),
      patch: async () => ({ error: "provider not mounted" }),
      getEffective: () => null,
    };
  }
  return ctx;
}

export type { NotifyKind, NotifyStatus, NotifySubscription, NotifyEvent };
