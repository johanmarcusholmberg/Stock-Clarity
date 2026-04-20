import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/** Shared preference: show price change as % or absolute. Consumed by Home,
 * Insights, and any other surface that presents change values.
 *
 * Persisted under `@stockclarify_show_percent` — the key the Home screen used
 * when the state lived locally — so upgrading doesn't reset the setting. */
const STORAGE_KEY = "@stockclarify_show_percent";

// Module-level subscribers so a toggle on one screen propagates to every
// mounted consumer without routing through a provider.
type Listener = (next: boolean) => void;
const listeners = new Set<Listener>();
let currentValue = true;
let hydrated = false;
let hydratePromise: Promise<void> | null = null;

function ensureHydrated(): Promise<void> {
  if (hydrated) return Promise.resolve();
  if (hydratePromise) return hydratePromise;
  hydratePromise = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw !== null) currentValue = raw === "true";
      hydrated = true;
      listeners.forEach((l) => l(currentValue));
    })
    .catch(() => {
      hydrated = true;
    });
  return hydratePromise;
}

function setShowPercent(next: boolean) {
  if (currentValue === next) return;
  currentValue = next;
  AsyncStorage.setItem(STORAGE_KEY, String(next)).catch(() => {});
  listeners.forEach((l) => l(next));
}

export interface DisplayModeApi {
  /** true = render changes as percentages, false = as absolute currency. */
  showPercent: boolean;
  toggle: () => void;
  setShowPercent: (next: boolean) => void;
}

export function useDisplayMode(): DisplayModeApi {
  const [value, setValue] = useState<boolean>(currentValue);

  useEffect(() => {
    ensureHydrated();
    const listener: Listener = (next) => setValue(next);
    listeners.add(listener);
    // If hydration completed before we subscribed, sync once.
    if (currentValue !== value) setValue(currentValue);
    return () => {
      listeners.delete(listener);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = useCallback(() => {
    setShowPercent(!currentValue);
  }, []);

  const setExplicit = useCallback((next: boolean) => {
    setShowPercent(next);
  }, []);

  return { showPercent: value, toggle, setShowPercent: setExplicit };
}
