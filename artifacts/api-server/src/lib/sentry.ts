// Server-side Sentry helpers. Init lives in `src/instrument.ts` and runs
// before this module is loaded.
import * as Sentry from "@sentry/node";
import type { RequestHandler, Express, ErrorRequestHandler } from "express";

const enabled = Boolean(process.env.SENTRY_DSN);

export function isSentryEnabled(): boolean {
  return enabled;
}

/**
 * Capture an arbitrary exception with optional context. Safe to call when
 * Sentry isn't configured — no-ops silently.
 *
 * Uses `withIsolationScope` (AsyncLocalStorage-backed) so the extras stay
 * attached to the captured event even when the call site is async.
 */
export function captureSentryException(
  err: unknown,
  context?: Record<string, unknown>,
): void {
  if (!enabled) return;
  try {
    if (context && Object.keys(context).length > 0) {
      Sentry.withIsolationScope((scope) => {
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
 * Express middleware that tags every request's isolation scope with the
 * Clerk user id (when present) and a request id, so errors captured later
 * in the lifecycle are filterable in the Sentry dashboard.
 *
 * Critical detail: we use `Sentry.withIsolationScope(cb)` — NOT
 * `withScope(cb)`. `withScope` is synchronously popped when `cb` returns,
 * which happens before `next()`'s async continuations run, so any tags
 * set there would be gone by the time a route handler throws. Isolation
 * scope is backed by AsyncLocalStorage and propagates through the entire
 * request's async tree.
 *
 * Mounted AFTER `clerkMiddleware()` so `req.auth()` is available, and
 * BEFORE all route handlers.
 */
export const sentryRequestContext: RequestHandler = (req, _res, next) => {
  if (!enabled) return next();
  try {
    Sentry.withIsolationScope((scope) => {
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
 * Wires an express error middleware that forwards uncaught route errors
 * to Sentry. Equivalent to `Sentry.setupExpressErrorHandler(app)` but
 * without the auto-instrumentation precheck that prints "[Sentry] express
 * is not instrumented" at startup — that check fires unconditionally in
 * a bundled build because esbuild inlines express into the output, so
 * Sentry's require-in-the-middle hook can never see it. Tracing /
 * performance auto-instrumentation isn't a launch goal; error capture is.
 *
 * The middleware reads the active isolation scope (set by
 * `sentryRequestContext` above) so our req_id / userId tags stick, then
 * forwards via `next(err)` so the existing `logError` middleware still
 * runs.
 */
export function setupExpressSentry(app: Express): void {
  if (!enabled) return;
  const sentryErrorMiddleware: ErrorRequestHandler = (err, _req, _res, next) => {
    try {
      Sentry.captureException(err);
    } catch {
      // never throw from instrumentation
    }
    next(err);
  };
  app.use(sentryErrorMiddleware);
}
