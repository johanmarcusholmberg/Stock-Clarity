/**
 * Single source of truth for the API base URL the mobile app talks to.
 *
 * In development this comes from `EXPO_PUBLIC_API_URL` set by the Expo
 * workflow command (e.g. `https://<repl>.replit.dev/api`).
 *
 * For native production builds (TestFlight, App Store, Play Store), this
 * value MUST be baked in at build time via the EAS env config — env vars
 * prefixed `EXPO_PUBLIC_` are inlined into the JS bundle. If it's missing
 * we fail loudly at first call rather than silently falling through to
 * something like `http://localhost:8080`, which would always fail on a
 * real device and confuse users with cryptic network errors.
 */

let cached: string | null = null;

export function getApiBase(): string {
  if (cached !== null) return cached;
  const raw = process.env.EXPO_PUBLIC_API_URL;
  if (!raw || !raw.trim()) {
    throw new Error(
      "EXPO_PUBLIC_API_URL is not set. The app cannot reach its backend. " +
        "In development, ensure the Expo workflow exports it. " +
        "In production builds, set it via EAS (eas.json env or `eas secret:create`).",
    );
  }
  const trimmed = raw.replace(/\/$/, "");
  cached = trimmed;
  return trimmed;
}
