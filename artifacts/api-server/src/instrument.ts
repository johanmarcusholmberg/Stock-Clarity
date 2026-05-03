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
    // for a git sha later if we ever wire up source-map upload.
    release: process.env.SENTRY_RELEASE ?? "stockclarify-api@1.0.0",
    sendDefaultPii: false,
    // Tracing left at a low sample rate so flipping integrations on later
    // doesn't suddenly blow through the free Sentry quota.
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.05 : 0.5,
    // Default integrations are now ON. They previously had to be off because
    // this file was bundled into the same dist/index.mjs as the server, so
    // Sentry initialized AFTER express had already been required and the OTel
    // hooks couldn't attach (warning: "[Sentry] express is not instrumented").
    // Now this file is built as a separate entry and loaded via
    // `node --import ./dist/instrument.mjs` (see package.json `start`), which
    // runs before any other module — so http/express auto-instrumentation
    // works reliably. tracesSampleRate above keeps span volume in check.
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
