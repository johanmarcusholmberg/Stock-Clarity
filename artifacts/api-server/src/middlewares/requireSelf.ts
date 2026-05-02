import type { Request, RequestHandler, Response, NextFunction } from "express";
import { getAuth } from "@clerk/express";
import { logger } from "../lib/logger";

// Cross-cutting authorisation middleware.
//
// Every endpoint that accepts a `userId` (via path param, query string, or
// request body) needs to verify that the caller is acting on THEIR OWN
// account. Without this check any signed-in user could pass another user's
// id and read or modify that user's data — classic IDOR.
//
// Source priority for the "target" userId:
//   1. req.params.userId   (e.g. /holdings/:userId)
//   2. req.query.userId    (e.g. /reports?userId=...)
//   3. req.body.userId     (e.g. POST /payment/checkout { userId })
//
// Behaviour:
//   - 400 if no target userId is present at all (would mean the route was
//     wired up incorrectly — we shouldn't silently allow that).
//   - 401 if no Clerk session is attached to the request.
//   - 403 if the session userId differs from the target userId.
//   - next() on match.
//
// Rollout:
//   `AUTH_ENFORCE_SELF=false` downgrades the 401 (no session) case to a
//   warn-and-allow so older mobile builds that haven't shipped Bearer-token
//   support yet keep working during the transition. The 403 (mismatch) case
//   is ALWAYS enforced — there is never a legitimate reason for user A to
//   act on user B's data, regardless of rollout state.

const ENFORCE_NO_SESSION =
  (process.env.AUTH_ENFORCE_SELF ?? "true").toLowerCase() !== "false";

function pickTargetUserId(req: Request): string | null {
  const fromParams = (req.params as Record<string, unknown> | undefined)?.userId;
  if (typeof fromParams === "string" && fromParams) return fromParams;
  const fromQuery = (req.query as Record<string, unknown> | undefined)?.userId;
  if (typeof fromQuery === "string" && fromQuery) return fromQuery;
  const fromBody = (req.body as Record<string, unknown> | undefined)?.userId;
  if (typeof fromBody === "string" && fromBody) return fromBody;
  return null;
}

// We intentionally type these as `RequestHandler<any, any, any, any>` so the
// middleware doesn't seed restrictive `ParamsDictionary` types into route
// handler inference. Without `<any>`, express infers a union path-param
// shape (`string | string[]`) for handlers chained after this middleware,
// breaking `req.params.userId` consumers across many routes.
export const requireSelf: RequestHandler<any, any, any, any> = (
  req,
  res,
  next,
): void => {
  const target = pickTargetUserId(req as Request);
  if (!target) {
    res.status(400).json({ error: "Missing userId" });
    return;
  }

  let sessionUserId: string | null = null;
  try {
    sessionUserId = getAuth(req as Request)?.userId ?? null;
  } catch {
    sessionUserId = null;
  }

  if (!sessionUserId) {
    if (ENFORCE_NO_SESSION) {
      res.status(401).json({ error: "auth_required" });
      return;
    }
    // Soft rollout: log and allow. Once all clients are sending tokens we
    // flip AUTH_ENFORCE_SELF back to its default (true).
    req.log?.warn(
      { path: req.path, target },
      "[auth] requireSelf: no Clerk session — allowing (AUTH_ENFORCE_SELF=false)",
    );
    next();
    return;
  }

  if (sessionUserId !== target) {
    req.log?.warn(
      { path: req.path, sessionUserId, target },
      "[auth] requireSelf: caller/target mismatch — refusing",
    );
    res.status(403).json({ error: "forbidden" });
    return;
  }

  next();
};

// Variant for endpoints where userId is OPTIONAL (e.g. anonymous status
// checks that pass userId only to look up a per-user rollout bucket). If a
// userId is present it must match the session; if it's absent the request
// is allowed through.
export const requireSelfIfPresent: RequestHandler<any, any, any, any> = (
  req,
  res,
  next,
): void => {
  const target = pickTargetUserId(req as Request);
  if (!target) {
    next();
    return;
  }
  requireSelf(req, res, next);
};

// Module-load smoke log so deployments can confirm the rollout flag in logs.
logger.info(
  { enforceNoSession: ENFORCE_NO_SESSION },
  "[auth] requireSelf middleware loaded",
);
