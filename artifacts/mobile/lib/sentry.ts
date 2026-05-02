import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
const release = (Constants.expoConfig?.version ?? "1.0.0").trim();
const env =
  process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT ??
  (__DEV__ ? "development" : "production");

let initialized = false;

/**
 * Initialize Sentry. Best-effort: silently no-ops if EXPO_PUBLIC_SENTRY_DSN
 * isn't set so the app still runs cleanly without a DSN configured.
 *
 * Called once at module-scope from `app/_layout.tsx`, before any provider
 * mounts, so the SDK is live for the very first render — including any
 * error in fontsLoaded / ClerkProvider hydration.
 */
export function initSentry(): void {
  if (initialized) return;
  if (!dsn) return;

  try {
    Sentry.init({
      dsn,
      environment: env,
      release,
      // Only enable native crash reporting on iOS/Android. On web (Expo web,
      // Replit preview) the @sentry/react-native package falls back to the
      // browser SDK automatically; we don't need to disable it explicitly,
      // but we also don't enable performance tracing on web.
      enableNative: Platform.OS !== "web",
      // Keep the default integrations (BreadcrumbsIntegration, ErrorEvents,
      // ScopeIntegration). The full feedback widget is intentionally NOT
      // wired up — we have an in-app feedback flow already.
      enableAutoSessionTracking: true,
      sessionTrackingIntervalMillis: 30_000,
      // Performance tracing — keep low so we don't blow through the free
      // Sentry quota on launch. Easy to bump later via dashboard.
      tracesSampleRate: env === "production" ? 0.1 : 1.0,
      // Don't send IP / cookies. We send Clerk user id explicitly via
      // setSentryUser() once the user signs in.
      sendDefaultPii: false,
      // Don't capture console.error as a breadcrumb in dev — it's noisy
      // and we already log to console.error from ErrorBoundary.
      attachStacktrace: true,
      // Drop events that are clearly not actionable.
      beforeSend(event, hint) {
        const err = hint?.originalException;
        // Network errors that surface as plain "Network request failed" on
        // RN are almost always offline blips; OfflineBanner already shows
        // them. Filtering keeps the Sentry feed signal-rich.
        const msg =
          (err instanceof Error ? err.message : String(err ?? event.message ?? ""))
            .toLowerCase();
        if (
          msg.includes("network request failed") ||
          msg.includes("aborted") ||
          msg.includes("the operation couldn't be completed")
        ) {
          return null;
        }
        return event;
      },
    });
    initialized = true;
  } catch (e) {
    // Initialization should never crash the app. If Sentry itself throws
    // (e.g. missing native module on web), swallow and log so we know.
    // eslint-disable-next-line no-console
    console.warn("[sentry] init failed", e);
  }
}

/**
 * Capture an exception. No-op if Sentry isn't initialized.
 */
export function captureSentryException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!initialized) return;
  try {
    if (context && Object.keys(context).length > 0) {
      Sentry.withScope((scope) => {
        for (const [k, v] of Object.entries(context)) {
          scope.setExtra(k, v);
        }
        Sentry.captureException(err);
      });
    } else {
      Sentry.captureException(err);
    }
  } catch {
    // Never let Sentry errors propagate.
  }
}

/**
 * Identify the current user on the Sentry scope. Called from a Clerk-aware
 * effect in `_layout.tsx` so events grouped by user are filterable in the
 * Sentry dashboard.
 *
 * PII policy: we send ONLY the Clerk user id. Email is intentionally
 * dropped — the Clerk dashboard is the source of truth for {id -> email}
 * lookups, so duplicating it into Sentry just bloats our PII surface
 * without adding signal. Keep the parameter shape extensible for future
 * non-PII context (e.g. tier).
 */
export function setSentryUser(user: { id: string }): void {
  if (!initialized) return;
  try {
    Sentry.setUser({ id: user.id });
  } catch {
    // ignore
  }
}

/**
 * Clear the user on sign-out so subsequent events aren't attributed to
 * the previous account.
 */
export function clearSentryUser(): void {
  if (!initialized) return;
  try {
    Sentry.setUser(null);
  } catch {
    // ignore
  }
}

/**
 * Whether Sentry is wired up. Useful for tests and for hiding "report bug"
 * affordances if the DSN isn't configured.
 */
export function isSentryEnabled(): boolean {
  return initialized;
}
