// Server-side Sentry helpers. Init lives in `src/instrument.ts` and runs
// before this module is loaded.
import * as Sentry from "@sentry/node";
import type { ErrorRequestHandler, RequestHandler, Express } from "express";

const enabled = Boolean(process.env.SENTRY_DSN);

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Capture an arbitrary exception with optional context. Safe to call when
 * Sentry isn't configured — no-ops silently.
 */
export function captureSentryException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return;
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
    // never throw from instrumentation
  }
}

/**
 * Express middleware that tags every request scope with the Clerk user id
 * (when present) and a request id, so errors captured later in the
 * lifecycle are filterable in the Sentry dashboard.
 *
 * Mounted AFTER `clerkMiddleware()` so `req.auth()` is available, and
 * BEFORE the route handlers.
 */
export const sentryRequestContext: RequestHandler = (req, _res, next) => {
  if (!enabled) return next();
  try {
    Sentry.withScope((scope) => {
      // express-pino adds req.id; fall back to header-driven trace id.
      const reqId =
        (req as unknown as { id?: string | number }).id ??
        req.headers["x-request-id"] ??
        undefined;
      if (reqId !== undefined) scope.setTag("req_id", String(reqId));

      // Clerk attaches `auth()` to the request. Pull userId without
      // crashing if the middleware isn't installed on this route.
      try {
        const auth = (req as unknown as { auth?: () => { userId?: string | null } }).auth;
        const userId = typeof auth === "function" ? auth().userId : undefined;
        if (userId) scope.setUser({ id: userId });
      } catch {
        // ignore — anonymous request
      }
      next();
    });
  } catch {
    next();
  }
};

/**
 * Express error-logging middleware. Forwards the error to Sentry, then
 * passes it down the chain. Mounted AFTER all routes and BEFORE any
 * response-sending error handler so Sentry sees the original error
 * regardless of how the response is shaped.
 */
export const sentryErrorHandler: ErrorRequestHandler = (err, _req, _res, next) => {
  if (enabled) {
    try {
      Sentry.captureException(err);
    } catch {
      // ignore
    }
  }
  next(err);
};

/**
 * Optional helper — wires Sentry's official Express handler in one place.
 * We install our own request-context middleware above for Clerk awareness
 * and call this as a defense-in-depth fallback.
 */
export function setupExpressSentry(app: Express): void {
  if (!enabled) return;
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch {
    // older sentry/node versions or bundling edge cases — safe to ignore
  }
}
