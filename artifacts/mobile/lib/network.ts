import NetInfo, { NetInfoState } from "@react-native-community/netinfo";
import { onlineManager, focusManager } from "@tanstack/react-query";
import { useEffect, useSyncExternalStore } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

/**
 * Network bridge for the StockClarify app.
 *
 * Two responsibilities:
 *   1. Drive `useOnline()` so any component can render an offline state.
 *   2. Wire React Query's `onlineManager` so queries pause while offline
 *      and auto-resume when connectivity returns.
 *
 * Implementation differs by platform:
 *
 *   - **Web**: we listen directly to the browser's `online`/`offline`
 *     window events and read `navigator.onLine` synchronously. We do NOT
 *     route through NetInfo on web because:
 *       - Its background `_internetReachability` probe fetches an external
 *         URL (`clients3.google.com/generate_204`) that fails in sandboxed
 *         envs and pins `isInternetReachable: false` indefinitely.
 *       - The event delivery chain (window event → nativeHandler →
 *         NativeEventEmitter → state machine) sometimes drops the
 *         online-recovery event in test browsers.
 *     The browser events are reliable and synchronous.
 *
 *   - **Native (iOS/Android)**: we use NetInfo, which is the right tool
 *     for native (handles airplane mode, captive-portal style probes,
 *     cellular vs wifi, etc).
 *
 * `isConnected === null` is treated as online to avoid flashing the
 * banner during the brief boot window before the first event fires.
 */

function deriveOnlineFromNetInfo(state: NetInfoState): boolean {
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

  const cleanups: Array<() => void> = [];

  if (Platform.OS === "web") {
    // Direct browser API path.
    if (typeof window !== "undefined" && typeof navigator !== "undefined") {
      const apply = () => {
        const next = navigator.onLine !== false;
        setOnline(next);
      };
      apply();

      const onOnline = () => apply();
      const onOffline = () => apply();
      window.addEventListener("online", onOnline);
      window.addEventListener("offline", onOffline);
      cleanups.push(() => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
      });

      // React Query's onlineManager — feed it the same signal.
      onlineManager.setEventListener((setOnlineRq) => {
        const update = () => setOnlineRq(navigator.onLine !== false);
        update();
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
          window.removeEventListener("online", update);
          window.removeEventListener("offline", update);
        };
      });
    }
  } else {
    // Native: NetInfo path.
    onlineManager.setEventListener((setOnlineRq) => {
      const unsub = NetInfo.addEventListener((state) => {
        setOnlineRq(deriveOnlineFromNetInfo(state));
      });
      return () => unsub();
    });

    const detach = NetInfo.addEventListener((state) => {
      setOnline(deriveOnlineFromNetInfo(state));
    });
    cleanups.push(detach);

    NetInfo.fetch()
      .then((state) => setOnline(deriveOnlineFromNetInfo(state)))
      .catch(() => {});

    // RQ refetches on app focus by default; on native we need to bridge
    // AppState to focusManager because the web `focus` event doesn't fire.
    const focusSub = AppState.addEventListener(
      "change",
      (status: AppStateStatus) => {
        focusManager.setFocused(status === "active");
      },
    );
    cleanups.push(() => focusSub.remove());
  }

  return () => {
    for (const c of cleanups) c();
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
