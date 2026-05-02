import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { onlineManager, focusManager } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

/**
 * NetInfo bridge for the StockClarify app.
 *
 * Two responsibilities:
 *   1. Drive `useOnline()` so any component can render an offline state.
 *   2. Wire React Query's `onlineManager` so queries pause while offline
 *      and auto-resume when connectivity returns.
 *
 * Connectivity signal: we trust `isConnected` as the primary signal and
 * deliberately ignore `isInternetReachable` for two reasons:
 *   - On web, `isInternetReachable` is not actively probed by default and
 *     can lag (or never update) after the browser regains connectivity,
 *     leaving the offline banner stuck.
 *   - The captive-portal case (`isConnected: true, isInternetReachable:
 *     false`) is rare; when it happens, API failures will surface their
 *     own retry/error UI anyway.
 *
 * `isConnected === null` (e.g. brief boot window) is treated as online to
 * avoid flashing the banner while NetInfo seeds.
 */

function deriveOnline(state: NetInfoState): boolean {
  return state.isConnected !== false;
}

let currentOnline = true;
const listeners = new Set<() => void>();

function setOnline(next: boolean) {
  if (next === currentOnline) return;
  currentOnline = next;
  for (const l of listeners) l();
}

let initialised = false;

export function initNetwork(): () => void {
  if (initialised) return () => {};
  initialised = true;

  // Hand React Query its own subscriber so queries pause/resume.
  onlineManager.setEventListener((setOnlineRq) => {
    const unsub = NetInfo.addEventListener((state) => {
      setOnlineRq(deriveOnline(state));
    });
    return () => unsub();
  });

  // Drive our own `useOnline()` hook.
  const detach = NetInfo.addEventListener((state) => {
    setOnline(deriveOnline(state));
  });

  // Seed initial state — addEventListener doesn't fire immediately.
  NetInfo.fetch().then((state) => setOnline(deriveOnline(state))).catch(() => {});

  // React Query refetches on app focus by default; on native we need to
  // bridge AppState to focusManager because the web `focus` event doesn't fire.
  const focusSub = AppState.addEventListener("change", (status: AppStateStatus) => {
    if (Platform.OS !== "web") {
      focusManager.setFocused(status === "active");
    }
  });

  return () => {
    detach();
    focusSub.remove();
    initialised = false;
  };
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot(): boolean {
  return currentOnline;
}

/** True when the device has internet reachability. SSR-safe (defaults true). */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}

/**
 * Imperative read for non-React code paths (e.g. context fetchers).
 * Don't use this from components — use `useOnline()` instead.
 */
export function isOnline(): boolean {
  return currentOnline;
}

/**
 * Convenience hook for screens that want a one-shot reaction to coming
 * back online (e.g. trigger a refetch). Calls `cb` whenever the network
 * transitions from offline -> online while the component is mounted.
 */
export function useOnReconnect(cb: () => void): void {
  const online = useOnline();
  useEffect(() => {
    if (online) cb();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [online]);
}
