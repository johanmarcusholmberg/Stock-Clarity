import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "@clerk/expo";

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

interface SubscriptionState {
  tier: Tier;
  isLoading: boolean;
  aiSummariesUsedToday: number;
  aiSummariesLimit: number; // 5 for free, 999 for pro/premium
  aiSummariesRemaining: number;
  canUseAI: boolean;
  plans: Plan[];
  plansLoading: boolean;
  checkoutUrl: string | null;
  subscriptionStatus: "active" | "trialing" | null;
  refresh: () => void;
  fetchPlans: () => void;
  startCheckout: (priceId: string) => Promise<string | null>;
  openPortal: () => Promise<string | null>;
  recordAIUsage: () => void;
}

const SubscriptionContext = createContext<SubscriptionState>({
  tier: "free",
  isLoading: true,
  aiSummariesUsedToday: 0,
  aiSummariesLimit: 5,
  aiSummariesRemaining: 5,
  canUseAI: true,
  plans: [],
  plansLoading: false,
  checkoutUrl: null,
  subscriptionStatus: null,
  refresh: () => {},
  fetchPlans: () => {},
  startCheckout: async () => null,
  openPortal: async () => null,
  recordAIUsage: () => {},
});

export function SubscriptionProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [tier, setTier] = useState<Tier>("free");
  const [isLoading, setIsLoading] = useState(true);
  const [aiUsed, setAiUsed] = useState(0);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState<"active" | "trialing" | null>(null);
  const lastResetDate = useRef<string>("");

  const limits: Record<Tier, number> = { free: 5, pro: 999, premium: 9999 };

  const getTodayKey = () => new Date().toISOString().split("T")[0];

  const aiLimit = limits[tier];
  const aiRemaining = Math.max(0, aiLimit - aiUsed);
  const canUseAI = aiRemaining > 0;

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

  const recordAIUsage = useCallback(() => {
    setAiUsed((prev) => prev + 1);
    // Fire-and-forget analytics
    if (userId) {
      fetch(`${API_BASE}/analytics/track`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, eventType: "ai_summary_viewed" }),
      }).catch(() => {});
    }
  }, [userId]);

  useEffect(() => {
    // Reset AI usage counter at the start of a new day
    const today = getTodayKey();
    if (lastResetDate.current !== today) {
      lastResetDate.current = today;
      setAiUsed(0);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription]);

  return (
    <SubscriptionContext.Provider
      value={{
        tier,
        isLoading,
        aiSummariesUsedToday: aiUsed,
        aiSummariesLimit: aiLimit,
        aiSummariesRemaining: aiRemaining,
        canUseAI,
        plans,
        plansLoading,
        checkoutUrl: null,
        subscriptionStatus,
        refresh: fetchSubscription,
        fetchPlans,
        startCheckout,
        openPortal,
        recordAIUsage,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
