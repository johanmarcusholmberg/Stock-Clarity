import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { Linking } from "react-native";
import { useAuth } from "@clerk/expo";
import { useUser } from "@clerk/expo";

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

// Per-tier limits for the stock detail page
export const TIER_LIMITS: Record<Tier, { stocksPerDay: number; summariesPerStock: number }> = {
  free:    { stocksPerDay: 3,        summariesPerStock: 1 },
  pro:     { stocksPerDay: 10,       summariesPerStock: 3 },
  premium: { stocksPerDay: Infinity, summariesPerStock: 5 },
};

interface SubscriptionState {
  tier: Tier;
  isLoading: boolean;
  isAdmin: boolean;
  // Per-stock tracking (stock detail page)
  stocksSeenToday: string[];
  stocksLimit: number;
  summariesPerStockLimit: number;
  canViewStock: (ticker: string) => boolean;
  canUseAIForStock: (ticker: string) => boolean;
  recordStockView: (ticker: string) => void;
  recordAIUsageForStock: (ticker: string) => void;
  aiUsageForStock: (ticker: string) => number;
  // Legacy global AI tracking (EventCard in digest/insights)
  aiSummariesUsedToday: number;
  aiSummariesLimit: number;
  aiSummariesRemaining: number;
  canUseAI: boolean;
  recordAIUsage: () => void;
  // Plans / checkout
  plans: Plan[];
  plansLoading: boolean;
  checkoutUrl: string | null;
  subscriptionStatus: "active" | "trialing" | null;
  refresh: () => void;
  fetchPlans: () => void;
  startCheckout: (priceId: string) => Promise<string | null>;
  openPortal: () => Promise<string | null>;
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
  canUseAIForStock: () => true,
  recordStockView: () => {},
  recordAIUsageForStock: () => {},
  aiUsageForStock: () => 0,
  aiSummariesUsedToday: 0,
  aiSummariesLimit: 1,
  aiSummariesRemaining: 1,
  canUseAI: true,
  recordAIUsage: () => {},
  plans: [],
  plansLoading: false,
  checkoutUrl: null,
  subscriptionStatus: null,
  refresh: () => {},
  fetchPlans: () => {},
  startCheckout: async () => null,
  openPortal: async () => null,
  adminOverrideTier: async () => false,
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser();
  const [tier, setTier] = useState<Tier>("free");
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Per-stock tracking
  const [stocksSeen, setStocksSeen] = useState<string[]>([]);
  const [aiUsageByStock, setAiUsageByStock] = useState<Record<string, number>>({});

  // Legacy global AI count (for EventCard in digest/insights)
  const [aiUsedGlobal, setAiUsedGlobal] = useState(0);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "trialing" | null>(null);
  const lastResetDate = useRef<string>("");

  const email = user?.primaryEmailAddress?.emailAddress;

  const tierLimits = TIER_LIMITS[tier];
  const stocksLimit = tierLimits.stocksPerDay;
  const summariesPerStockLimit = tierLimits.summariesPerStock;

  // Legacy global limit (5 for free, effectively unlimited for paid)
  const globalAiLimit = tier === "free" ? 5 : 9999;
  const aiSummariesRemaining = Math.max(0, globalAiLimit - aiUsedGlobal);
  const canUseAI = aiSummariesRemaining > 0;

  const canViewStock = useCallback((ticker: string): boolean => {
    if (stocksLimit === Infinity) return true;
    if (stocksSeen.includes(ticker)) return true;
    return stocksSeen.length < stocksLimit;
  }, [stocksSeen, stocksLimit]);

  const canUseAIForStock = useCallback((ticker: string): boolean => {
    return (aiUsageByStock[ticker] ?? 0) < summariesPerStockLimit;
  }, [aiUsageByStock, summariesPerStockLimit]);

  const recordStockView = useCallback((ticker: string) => {
    setStocksSeen((prev) => {
      if (prev.includes(ticker)) return prev;
      return [...prev, ticker];
    });
  }, []);

  const recordAIUsageForStock = useCallback((ticker: string) => {
    setAiUsageByStock((prev) => ({
      ...prev,
      [ticker]: (prev[ticker] ?? 0) + 1,
    }));
    // Also track globally for analytics
    if (userId) {
      fetch(`${API_BASE}/analytics/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, eventType: "ai_summary_viewed", metadata: { ticker } }),
      }).catch(() => {});
    }
  }, [userId]);

  const aiUsageForStock = useCallback((ticker: string): number => {
    return aiUsageByStock[ticker] ?? 0;
  }, [aiUsageByStock]);

  // Legacy global record (EventCard in digest/insights)
  const recordAIUsage = useCallback(() => {
    setAiUsedGlobal((prev) => prev + 1);
    if (userId) {
      fetch(`${API_BASE}/analytics/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, eventType: "ai_summary_viewed" }),
      }).catch(() => {});
    }
  }, [userId]);

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
        body: JSON.stringify({ priceId, userId }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.url ?? null;
      }
    } catch {}
    return null;
  }, [userId]);

  const openPortal = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch(`${API_BASE}/payment/portal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) {
        const data = await res.json();
        return data.url ?? null;
      }
    } catch {}
    return null;
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

  // Reset daily counters at midnight
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (lastResetDate.current !== today) {
      lastResetDate.current = today;
      setAiUsedGlobal(0);
      setStocksSeen([]);
      setAiUsageByStock({});
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

  const aiSummariesUsedToday = Object.values(aiUsageByStock).reduce((a, b) => a + b, 0) + aiUsedGlobal;

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
        canUseAIForStock,
        recordStockView,
        recordAIUsageForStock,
        aiUsageForStock,
        aiSummariesUsedToday,
        aiSummariesLimit: summariesPerStockLimit,
        aiSummariesRemaining,
        canUseAI,
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
