import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useAuth } from "@clerk/expo";
import {
  AlertEvent,
  AlertStatusResponse,
  UserAlert,
  createAlert as createAlertApi,
  deleteAlert as deleteAlertApi,
  getAlertStatus,
  listAlerts,
  listAlertEvents,
  updateAlert as updateAlertApi,
  type AlertDeliveryChannel,
  type AlertType,
} from "@/services/alertsApi";
import { registerForAlerts } from "@/services/pushRegistration";

interface AlertsContextValue {
  /** Is the alerts feature enabled for this user (rollout)? */
  enabled: boolean;
  /** Is the evaluator running recently (dead-man switch)? */
  evaluatorHealthy: boolean;
  alerts: UserAlert[];
  events: AlertEvent[];
  loading: boolean;
  refresh: () => Promise<void>;
  createAlert: (
    input: { symbol: string; type: AlertType; threshold: number; deliveryChannel?: AlertDeliveryChannel },
  ) => Promise<UserAlert | { error: string }>;
  updateAlert: (
    alertId: string,
    patch: Partial<Pick<UserAlert, "status" | "threshold" | "deliveryChannel">>,
  ) => Promise<UserAlert | null>;
  deleteAlert: (alertId: string) => Promise<boolean>;
  getAlertsForSymbol: (symbol: string) => UserAlert[];
}

const AlertsContext = createContext<AlertsContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60_000;

export function AlertsProvider({ children }: { children: React.ReactNode }) {
  const { userId, isSignedIn } = useAuth();
  const [alerts, setAlerts] = useState<UserAlert[]>([]);
  const [events, setEvents] = useState<AlertEvent[]>([]);
  const [status, setStatus] = useState<AlertStatusResponse>({
    enabled: false,
    evaluatorHealthy: false,
    lastBeat: null,
  });
  const [loading, setLoading] = useState(false);
  const registeredForRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!userId || !isSignedIn) {
      setAlerts([]);
      setEvents([]);
      setStatus({ enabled: false, evaluatorHealthy: false, lastBeat: null });
      return;
    }
    setLoading(true);
    try {
      const [statusRes, alertsRes, eventsRes] = await Promise.all([
        getAlertStatus(userId),
        listAlerts(userId),
        listAlertEvents(userId, 50),
      ]);
      setStatus(statusRes);
      setAlerts(alertsRes);
      setEvents(eventsRes);
    } finally {
      setLoading(false);
    }
  }, [userId, isSignedIn]);

  // Refresh on sign-in + every minute.
  useEffect(() => {
    refresh();
    if (!userId || !isSignedIn) return;
    const i = setInterval(refresh, REFRESH_INTERVAL_MS);
    return () => clearInterval(i);
  }, [refresh, userId, isSignedIn]);

  // Register for push once per user once the feature is enabled for them.
  useEffect(() => {
    if (!status.enabled || !userId || registeredForRef.current === userId) return;
    registeredForRef.current = userId;
    registerForAlerts(userId).catch(() => {
      // swallow — registration is best-effort
    });
  }, [status.enabled, userId]);

  const createAlert = useCallback<AlertsContextValue["createAlert"]>(async (input) => {
    if (!userId) return { error: "not signed in" };
    const res = await createAlertApi(userId, input);
    if ("error" in res) return res;
    setAlerts((prev) => [res, ...prev]);
    return res;
  }, [userId]);

  const updateAlert = useCallback<AlertsContextValue["updateAlert"]>(async (alertId, patch) => {
    if (!userId) return null;
    const res = await updateAlertApi(userId, alertId, patch);
    if (!res) return null;
    setAlerts((prev) => prev.map((a) => (a.id === alertId ? res : a)));
    return res;
  }, [userId]);

  const deleteAlert = useCallback<AlertsContextValue["deleteAlert"]>(async (alertId) => {
    if (!userId) return false;
    const ok = await deleteAlertApi(userId, alertId);
    if (ok) setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    return ok;
  }, [userId]);

  const getAlertsForSymbol = useCallback(
    (symbol: string) => alerts.filter((a) => a.symbol === symbol.toUpperCase()),
    [alerts],
  );

  const value = useMemo<AlertsContextValue>(
    () => ({
      enabled: status.enabled,
      evaluatorHealthy: status.evaluatorHealthy,
      alerts,
      events,
      loading,
      refresh,
      createAlert,
      updateAlert,
      deleteAlert,
      getAlertsForSymbol,
    }),
    [status, alerts, events, loading, refresh, createAlert, updateAlert, deleteAlert, getAlertsForSymbol],
  );

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlerts(): AlertsContextValue {
  const ctx = useContext(AlertsContext);
  if (!ctx) {
    // Fallback — return a disabled stub when the provider isn't mounted,
    // so components can render safely outside of user scope.
    return {
      enabled: false,
      evaluatorHealthy: false,
      alerts: [],
      events: [],
      loading: false,
      refresh: async () => {},
      createAlert: async () => ({ error: "provider not mounted" }),
      updateAlert: async () => null,
      deleteAlert: async () => false,
      getAlertsForSymbol: () => [],
    };
  }
  return ctx;
}
