import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";

const ONBOARDING_KEY = "@stockclarify_onboarding_completed_v1";

type Status = "loading" | "needed" | "completed";

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
          cached = val === "1";
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
