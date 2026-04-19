import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { useUser } from "@clerk/expo";
import { applyEventExpansion } from "@/utils/aiQuota";

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

export type Tier = "free" | "pro" | "premium";

export interface Plan {
  id: string;
  name: string;
  description: string;
  metadata: { tier: Tier; sort_order: string };
  prices: Array<{
    id: string;
    unit_amount: number;
    currency: string;
    interval: "month" | "year" | null;
  }>;
}

// Per-tier limits.
// `aiSummariesPerDay` is a single shared daily pool that every AI summary
// expansion in the app deducts from (Digest briefs + Stock-page Recent News).
// `summariesPerStock` is kept for legacy/account display only.
export const TIER_LIMITS: Record<Tier, {
  stocksPerDay: number;
  aiSummariesPerDay: number;
  summariesPerStock: number;
}> = {
  free:    { stocksPerDay: 3,        aiSummariesPerDay: 5,        summariesPerStock: 1 },
  pro:     { stocksPerDay: 10,       aiSummariesPerDay: 30,       summariesPerStock: 3 },
  premium: { stocksPerDay: Infinity, aiSummariesPerDay: Infinity, summariesPerStock: 5 },
};

export interface EventExpansionResult {
  recorded: boolean;
  cached?: boolean;
  outOfQuota?: boolean;
}

interface SubscriptionState {
  tier: Tier;
  isLoading: boolean;
  isAdmin: boolean;
  // Stock views/day (separate concept from AI summaries).
  stocksSeenToday: string[];
  stocksLimit: number;
  summariesPerStockLimit: number;
  canViewStock: (ticker: string) => boolean;
  recordStockView: (ticker: string) => void;
  // Shared global AI summary quota.
  aiSummariesUsedToday: number;
  aiSummariesLimit: number;
  aiSummariesRemaining: number;
  canUseAI: boolean;
  /** True if this event's AI summary has been generated before (cached). */
  hasExpandedEvent: (eventId: string) => boolean;
  /**
   * Idempotent quota gate for expanding an AI summary.
   *   - Already expanded before → `{ recorded: false, cached: true }`, no quota change.
   *   - Quota available         → decrements, caches, returns `{ recorded: true }`.
   *   - Out of quota             → `{ recorded: false, outOfQuota: true }`, no cache change.
   */
  recordEventExpansion: (eventId: string) => EventExpansionResult;
  // Legacy per-stock wrappers (now back the global pool for back-compat).
  canUseAIForStock: (ticker: string) => boolean;
  recordAIUsageForStock: (ticker: string) => void;
  aiUsageForStock: (ticker: string) => number;
  recordAIUsage: () => void;
  // Plans / checkout
  plans: Plan[];
  plansLoading: boolean;
  checkoutUrl: string | null;
  subscriptionStatus: "active" | "trialing" | null;
  refresh: () => void;
  fetchPlans: () => void;
  startCheckout: (priceId: string) => Promise<string | null>;
  openPortal: () => Promise<{ url: string | null; error?: string }>;
  adminOverrideTier: (tier: Tier, targetUserId?: string) => Promise<boolean>;
}

const SubscriptionContext = createContext<SubscriptionState>({
  tier: "free",
  isLoading: true,
  isAdmin: false,
  stocksSeenToday: [],
  stocksLimit: 3,
  summariesPerStockLimit: 1,
  canViewStock: () => true,
  recordStockView: () => {},
  aiSummariesUsedToday: 0,
  aiSummariesLimit: 5,
  aiSummariesRemaining: 5,
  canUseAI: true,
  hasExpandedEvent: () => false,
  recordEventExpansion: () => ({ recorded: false }),
  canUseAIForStock: () => true,
  recordAIUsageForStock: () => {},
  aiUsageForStock: () => 0,
  recordAIUsage: () => {},
  plans: [],
  plansLoading: false,
  checkoutUrl: null,
  subscriptionStatus: null,
  refresh: () => {},
  fetchPlans: () => {},
  startCheckout: async () => null,
  openPortal: async () => ({ url: null }),
  adminOverrideTier: async () => false,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const [tier, setTier] = useState<Tier>("free");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Stock views/day (unrelated to AI quota).
  const [stocksSeen, setStocksSeen] = useState<string[]>([]);

  // Shared global AI counter — every AI summary expansion in the app deducts
  // from this single pool.  Reset daily at midnight.
  const [aiUsedGlobal, setAiUsedGlobal] = useState(0);

  // Persistent cache of event IDs whose AI summary has already been
  // generated/viewed by this user.  Re-opening a cached item is free —
  // the summary is displayed without another quota deduction.
  // Persisted to AsyncStorage per-user so it survives app restarts.
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "trialing" | null>(null);
  const lastResetDate = useRef<string>("");

  const email = user?.primaryEmailAddress?.emailAddress;

  const tierLimits = TIER_LIMITS[tier];
  const stocksLimit = tierLimits.stocksPerDay;
  const summariesPerStockLimit = tierLimits.summariesPerStock;
  const aiSummariesLimit = tierLimits.aiSummariesPerDay;

  // For "unlimited" tiers we surface a large finite number so callers that
  // render this value directly don't have to special-case Infinity.
  // Callers that need the capability check use `canUseAI` or compare
  // `aiSummariesLimit === Infinity`.
  const aiSummariesRemaining = aiSummariesLimit === Infinity
    ? 9999
    : Math.max(0, aiSummariesLimit - aiUsedGlobal);
  const canUseAI = aiSummariesLimit === Infinity || aiSummariesRemaining > 0;

  const expandedKey = userId ? `@stockclarify_expanded_events_v1:${userId}` : null;

  // Refs mirror the two pieces of quota state.  Reading through refs in
  // `recordEventExpansion` avoids stale-closure races: a second tap that
  // lands in the same React tick as a first tap sees the incremented
  // counter and fresh expanded-id set, rather than the pre-tap snapshot.
  const aiUsedRef = useRef(0);
  const expandedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => { aiUsedRef.current = aiUsedGlobal; }, [aiUsedGlobal]);
  useEffect(() => { expandedIdsRef.current = expandedEventIds; }, [expandedEventIds]);

  // Hydrate expanded-events cache on user change.
  useEffect(() => {
    if (!expandedKey) {
      setExpandedEventIds(new Set());
      expandedIdsRef.current = new Set();
      return;
    }
    AsyncStorage.getItem(expandedKey).then((raw) => {
      if (!raw) return;
      try {
        const arr = JSON.parse(raw) as string[];
        if (Array.isArray(arr)) {
          const hydrated = new Set(arr);
          setExpandedEventIds(hydrated);
          expandedIdsRef.current = hydrated;
        }
      } catch {}
    }).catch(() => {});
  }, [expandedKey]);

  const persistExpanded = useCallback((next: Set<string>) => {
    if (!expandedKey) return;
    AsyncStorage.setItem(expandedKey, JSON.stringify(Array.from(next))).catch(() => {});
  }, [expandedKey]);

  const canViewStock = useCallback((ticker: string): boolean => {
    if (stocksLimit === Infinity) return true;
    if (stocksSeen.includes(ticker)) return true;
    return stocksSeen.length < stocksLimit;
  }, [stocksSeen, stocksLimit]);

  const recordStockView = useCallback((ticker: string) => {
    setStocksSeen((prev) => {
      if (prev.includes(ticker)) return prev;
      return [...prev, ticker];
    });
  }, []);

  const hasExpandedEvent = useCallback((eventId: string): boolean => {
    return expandedEventIds.has(eventId);
  }, [expandedEventIds]);

  // Core quota+cache primitive.  Delegates the decision to `applyEventExpansion`
  // (pure function in utils/aiQuota.ts) — this component just commits the
  // resulting state, persists the cache, and updates the refs so rapid
  // successive calls see the latest values.
  const recordEventExpansion = useCallback((eventId: string): EventExpansionResult => {
    const { state: next, result } = applyEventExpansion(
      { used: aiUsedRef.current, limit: aiSummariesLimit, expandedIds: expandedIdsRef.current },
      eventId,
    );
    if (result.recorded) {
      aiUsedRef.current = next.used;
      expandedIdsRef.current = next.expandedIds;
      setAiUsedGlobal(next.used);
      setExpandedEventIds(next.expandedIds);
      persistExpanded(next.expandedIds);
      if (userId) {
        fetch(`${API_BASE}/analytics/track`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId, eventType: "ai_summary_viewed", metadata: { eventId } }),
        }).catch(() => {});
      }
    }
    return result;
  }, [aiSummariesLimit, persistExpanded, userId]);

  // Legacy per-stock wrappers — now back the global pool for back-compat.
  // Call sites should migrate to `canUseAI` / `recordEventExpansion`.
  const canUseAIForStock = useCallback((_ticker: string): boolean => canUseAI, [canUseAI]);
  const recordAIUsageForStock = useCallback((ticker: string) => {
    recordEventExpansion(`legacy:${ticker}:${Date.now()}`);
  }, [recordEventExpansion]);
  const aiUsageForStock = useCallback((_ticker: string): number => aiUsedGlobal, [aiUsedGlobal]);
  const recordAIUsage = useCallback(() => {
    recordEventExpansion(`legacy:global:${Date.now()}`);
  }, [recordEventExpansion]);

  const fetchSubscription = useCallback(async () => {
    if (!userId || !isSignedIn) {
      setTier("free");
      setIsLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/payment/subscription/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setTier(data.tier ?? "free");
        setSubscriptionStatus(data.subscription?.status ?? null);
      }
    } catch {
      // Network error — keep current tier
    } finally {
      setIsLoading(false);
    }
  }, [userId, isSignedIn]);

  const checkAdminStatus = useCallback(async () => {
    if (!userId || !email) return;
    try {
      const res = await fetch(
        `${API_BASE}/admin/check?userId=${encodeURIComponent(userId)}&email=${encodeURIComponent(email)}`
      );
      if (res.ok) {
        const data = await res.json();
        setIsAdmin(data.isAdmin === true);
      }
    } catch {
      setIsAdmin(false);
    }
  }, [userId, email]);

  const fetchPlans = useCallback(async () => {
    if (plansLoading || plans.length > 0) return;
    setPlansLoading(true);
    try {
      const res = await fetch(`${API_BASE}/payment/plans`);
      if (res.ok) {
        const data = await res.json();
        setPlans(data.plans ?? []);
      }
    } catch {
      // ignore
    } finally {
      setPlansLoading(false);
    }
  }, [plansLoading, plans.length]);

  const startCheckout = useCallback(async (priceId: string): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/payment/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, userId, email }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.url ?? null;
      }
    } catch {}
    return null;
  }, [userId, email]);

  const openPortal = useCallback(async (): Promise<{ url: string | null; error?: string }> => {
    try {
      const res = await fetch(`${API_BASE}/payment/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (res.ok) return { url: data.url ?? null };
      return { url: null, error: data.error ?? "Portal unavailable" };
    } catch {
      return { url: null, error: "Network error" };
    }
  }, [userId]);

  const adminOverrideTier = useCallback(async (newTier: Tier, targetUserId?: string): Promise<boolean> => {
    if (!userId || !email) return false;
    try {
      const res = await fetch(`${API_BASE}/admin/override-tier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requesterId: userId,
          requesterEmail: email,
          targetUserId: targetUserId ?? userId,
          tier: newTier,
        }),
      });
      if (res.ok) {
        if (!targetUserId || targetUserId === userId) {
          setTier(newTier);
        }
        return true;
      }
    } catch {}
    return false;
  }, [userId, email]);

  // Reset daily counters at midnight.  Note: `expandedEventIds` is NOT
  // reset — it persists forever so that re-opening a previously viewed
  // summary stays free across days (per the "one AI gen per item, ever"
  // contract).
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (lastResetDate.current !== today) {
      lastResetDate.current = today;
      setAiUsedGlobal(0);
      aiUsedRef.current = 0;
      setStocksSeen([]);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  useEffect(() => {
    if (email && userId) {
      checkAdminStatus();
    }
  }, [checkAdminStatus, email, userId]);

  const handledUrls = useRef<Set<string>>(new Set());

  useEffect(() => {
    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      if (handledUrls.current.has(url)) return;
      if (url.startsWith("stockclarify://checkout/success")) {
        handledUrls.current.add(url);
        fetchSubscription();
      }
    };

    Linking.getInitialURL().then(handleDeepLink).catch(() => {});

    const subscription = Linking.addEventListener("url", (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [fetchSubscription]);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        isLoading,
        isAdmin,
        stocksSeenToday: stocksSeen,
        stocksLimit,
        summariesPerStockLimit,
        canViewStock,
        recordStockView,
        aiSummariesUsedToday: aiUsedGlobal,
        aiSummariesLimit,
        aiSummariesRemaining,
        canUseAI,
        hasExpandedEvent,
        recordEventExpansion,
        canUseAIForStock,
        recordAIUsageForStock,
        aiUsageForStock,
        recordAIUsage,
        plans,
        plansLoading,
        checkoutUrl: null,
        subscriptionStatus,
        refresh: fetchSubscription,
        fetchPlans,
        startCheckout,
        openPortal,
        adminOverrideTier,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
