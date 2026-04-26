import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/expo";
import {
  addHolding,
  addLot,
  deleteHolding,
  deleteLot,
  getHoldingsStatus,
  listHoldings,
  type AddHoldingInput,
  type AddLotInput,
  type ApiError,
  type Holding,
} from "@/services/holdingsApi";

interface HoldingsContextValue {
  /** /api/holdings/status — server HOLDINGS_ENABLED flag. Used to gate the tab. */
  enabled: boolean;
  /** True until the first status fetch resolves; consumers can avoid flashing
   *  the tab in/out during initial hydration. */
  hydrated: boolean;
  loading: boolean;
  holdings: Holding[];
  refresh: () => Promise<void>;
  add: (input: AddHoldingInput) => Promise<Holding | ApiError>;
  addLotTo: (holdingId: string, input: AddLotInput) => Promise<true | ApiError>;
  remove: (holdingId: string) => Promise<true | ApiError>;
  removeLot: (holdingId: string, lotId: string) => Promise<true | ApiError>;
}

const HoldingsContext = createContext<HoldingsContextValue | null>(null);

export function HoldingsProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(false);

  // Fetch the feature flag once on mount. Independent of auth state — the
  // flag itself doesn't require sign-in, and we want to stop fetching the
  // (auth-required) holdings list when the flag is off.
  useEffect(() => {
    let cancelled = false;
    getHoldingsStatus()
      .then((res) => {
        if (cancelled) return;
        setEnabled(res.enabled);
      })
      .finally(() => {
        if (!cancelled) setHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !userId || !isSignedIn) {
      setHoldings([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listHoldings(userId);
      setHoldings(res.holdings);
    } finally {
      setLoading(false);
    }
  }, [enabled, userId, isSignedIn]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const add = useCallback<HoldingsContextValue["add"]>(
    async (input) => {
      if (!userId) return { error: "not signed in" };
      const res = await addHolding(userId, input);
      if ("error" in res) return res;
      // Replace-or-insert by id. Server upserts on (user_id, ticker), so
      // an existing holding gets the new lot appended; a new ticker is
      // inserted in alphabetical order.
      const existing = holdings.find((h) => h.id === res.holding.id);
      const merged: Holding = {
        ...res.holding,
        lots: [...(existing?.lots ?? []), res.lot],
      };
      setHoldings((prev) => {
        const idx = prev.findIndex((h) => h.id === merged.id);
        if (idx === -1) return [...prev, merged].sort((a, b) => a.ticker.localeCompare(b.ticker));
        const next = prev.slice();
        next[idx] = merged;
        return next;
      });
      return merged;
    },
    [userId, holdings],
  );

  const addLotTo = useCallback<HoldingsContextValue["addLotTo"]>(
    async (holdingId, input) => {
      if (!userId) return { error: "not signed in" };
      const res = await addLot(userId, holdingId, input);
      if ("error" in res) return res;
      setHoldings((prev) =>
        prev.map((h) =>
          h.id === holdingId ? { ...h, lots: [...h.lots, res.lot] } : h,
        ),
      );
      return true;
    },
    [userId],
  );

  const remove = useCallback<HoldingsContextValue["remove"]>(
    async (holdingId) => {
      if (!userId) return { error: "not signed in" };
      const res = await deleteHolding(userId, holdingId);
      if ("error" in res) return res;
      setHoldings((prev) => prev.filter((h) => h.id !== holdingId));
      return true;
    },
    [userId],
  );

  const removeLot = useCallback<HoldingsContextValue["removeLot"]>(
    async (holdingId, lotId) => {
      if (!userId) return { error: "not signed in" };
      const res = await deleteLot(userId, holdingId, lotId);
      if ("error" in res) return res;
      setHoldings((prev) =>
        prev.map((h) =>
          h.id === holdingId ? { ...h, lots: h.lots.filter((l) => l.id !== lotId) } : h,
        ),
      );
      return true;
    },
    [userId],
  );

  const value = useMemo<HoldingsContextValue>(
    () => ({ enabled, hydrated, loading, holdings, refresh, add, addLotTo, remove, removeLot }),
    [enabled, hydrated, loading, holdings, refresh, add, addLotTo, remove, removeLot],
  );

  return <HoldingsContext.Provider value={value}>{children}</HoldingsContext.Provider>;
}

export function useHoldings(): HoldingsContextValue {
  const ctx = useContext(HoldingsContext);
  if (!ctx) {
    return {
      enabled: false,
      hydrated: true,
      loading: false,
      holdings: [],
      refresh: async () => {},
      add: async () => ({ error: "provider not mounted" }),
      addLotTo: async () => ({ error: "provider not mounted" }),
      remove: async () => ({ error: "provider not mounted" }),
      removeLot: async () => ({ error: "provider not mounted" }),
    };
  }
  return ctx;
}
