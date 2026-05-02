import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

// Exported so tests can assert the on-disk contract without duplicating the
// string. If this key ever changes we want every existing user to re-see the
// walkthrough — bump the version suffix (e.g. _v2) rather than mutating in
// place.
export const ONBOARDING_KEY = "@stockclarify_onboarding_completed_v1";

export type Status = "loading" | "needed" | "completed";

// Pure function so the AsyncStorage hydration logic is unit-testable without
// React or the native module. The persisted value is intentionally narrow:
// the literal string "1" means completed; anything else (including null or a
// stale legacy value) means the user still needs the walkthrough.
export function parseStoredValue(raw: string | null): "needed" | "completed" {
  return raw === "1" ? "completed" : "needed";
}

let cached: boolean | null = null;
const listeners = new Set<(s: Status) => void>();

function notify(s: Status) {
  listeners.forEach((l) => l(s));
}

export async function markOnboardingComplete(): Promise<void> {
  cached = true;
  try {
    await AsyncStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    // best-effort: even if persistence fails the in-memory cache prevents
    // repeated walkthroughs in this session
  }
  notify("completed");
}

export async function resetOnboardingForTesting(): Promise<void> {
  cached = false;
  try {
    await AsyncStorage.removeItem(ONBOARDING_KEY);
  } catch {}
  notify("needed");
}

export function useOnboarding(): Status {
  const [status, setStatus] = useState<Status>(() => {
    if (cached === true) return "completed";
    if (cached === false) return "needed";
    return "loading";
  });

  useEffect(() => {
    let alive = true;
    if (cached === null) {
      AsyncStorage.getItem(ONBOARDING_KEY)
        .then((val) => {
          cached = parseStoredValue(val) === "completed";
          if (alive) setStatus(cached ? "completed" : "needed");
        })
        .catch(() => {
          // Treat read failures as "completed" so we never block the user
          // behind a broken AsyncStorage.
          cached = true;
          if (alive) setStatus("completed");
        });
    }
    const listener = (s: Status) => {
      if (alive) setStatus(s);
    };
    listeners.add(listener);
    return () => {
      alive = false;
      listeners.delete(listener);
    };
  }, []);

  return status;
}
