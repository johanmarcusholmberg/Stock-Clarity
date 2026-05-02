// Sentry instrumentation. MUST be imported before anything else in the
// server entrypoint (`index.ts`) so the SDK is live before Express, the
// HTTP module, or any other auto-instrumented dependency loads.
//
// Best-effort: silently no-ops without SENTRY_DSN so local dev and
// preview deployments work without configuration.
import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // The bundled output is one big esm file — use the package version
    // baked at install time as a stable release identifier. Easy to swap
    // for a git sha later if we ever wire up source-map upload via EAS.
    release: process.env.SENTRY_RELEASE ?? "stockclarify-api@1.0.0",
    sendDefaultPii: false,
    // Keep low so we don't blow through the free Sentry quota at launch.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.5,
    // We ship via esbuild bundle with most @opentelemetry/* and
    // @sentry/profiling-node externalized in build.mjs. Manual error
    // capture (setupExpressErrorHandler, captureException) works
    // regardless; auto-instrumentation may be limited until we either
    // un-bundle Sentry or run via `--import` flag.
    integrations: [],
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = (err instanceof Error ? err.message : String(err ?? event.message ?? ""))
        .toLowerCase();
      // Don't ship 4xx-style noise: payment-required throws, validation
      // errors, deliberate "not found" responses. These already surface
      // in our pino logs.
      if (
        msg.includes("validationerror") ||
        msg.includes("zodvalidationerror") ||
        msg.includes("payment required") ||
        msg.includes("forbidden") ||
        msg.includes("not found") ||
        msg.includes("unauthorized")
      ) {
        return null;
      }
      return event;
    },
  });
}
