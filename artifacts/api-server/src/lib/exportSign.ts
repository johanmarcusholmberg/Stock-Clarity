import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

// Short-lived HMAC-signed URLs for the /export/portfolio.* endpoints.
//
// Why: the mobile client triggers exports via Linking.openURL (so the
// resulting file can be opened/saved by the OS browser). That code path
// can't attach an `Authorization: Bearer <token>` header, so we can't gate
// the export routes on `requireSelf` directly without breaking the user
// flow. Instead we:
//   1. expose a tiny `POST /export/sign` endpoint that IS gated on
//      requireSelf (Bearer-authenticated) and returns a one-time URL
//      containing an HMAC signature over (userId, folderId, format,
//      delimiter, expiry);
//   2. let the export routes verify that signature in lieu of a session.
//
// This means an attacker can no longer just guess `?userId=victim` — they
// would need a valid signature, which can only be obtained via the
// authenticated /sign endpoint that already enforces requireSelf.

const SECRET = (() => {
  const fromEnv = process.env.EXPORT_SIGNING_SECRET;
  if (fromEnv && fromEnv.length >= 16) return fromEnv;
  const generated = randomBytes(32).toString("hex");
  logger.warn(
    {},
    "[exportSign] EXPORT_SIGNING_SECRET not set — using per-process random secret. " +
      "Signed export URLs will not survive a server restart. Set EXPORT_SIGNING_SECRET in production.",
  );
  return generated;
})();

const SIGNED_URL_TTL_SEC = 5 * 60; // 5 minutes — plenty for the OS to open the URL

export interface SignedExportParams {
  userId: string;
  format: "portfolio.csv" | "portfolio.xlsx" | "portfolio.html";
  folderId?: string;
  delimiter?: string;
}

function canonical(p: SignedExportParams, exp: number): string {
  // Order-stable canonicalisation. Empty / undefined values are excluded so
  // the verifier can recompute the same string when those query params are
  // absent on the URL.
  const parts: string[] = [
    `userId=${p.userId}`,
    `format=${p.format}`,
    `exp=${exp}`,
  ];
  if (p.folderId) parts.push(`folderId=${p.folderId}`);
  if (p.delimiter) parts.push(`delimiter=${p.delimiter}`);
  return parts.join("&");
}

function hmacB64url(input: string): string {
  return createHmac("sha256", SECRET)
    .update(input)
    .digest("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

export function signExportRequest(p: SignedExportParams): {
  exp: number;
  sig: string;
} {
  const exp = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SEC;
  return { exp, sig: hmacB64url(canonical(p, exp)) };
}

export interface VerifyResult {
  ok: boolean;
  reason?: "expired" | "bad_signature" | "missing";
}

export function verifyExportSignature(
  p: SignedExportParams,
  exp: number,
  sig: string,
): VerifyResult {
  if (!sig || !exp) return { ok: false, reason: "missing" };
  if (exp < Math.floor(Date.now() / 1000)) return { ok: false, reason: "expired" };
  const expected = hmacB64url(canonical(p, exp));
  // timingSafeEqual requires equal-length buffers; if not, it's just wrong.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return { ok: false, reason: "bad_signature" };
  return timingSafeEqual(a, b)
    ? { ok: true }
    : { ok: false, reason: "bad_signature" };
}
