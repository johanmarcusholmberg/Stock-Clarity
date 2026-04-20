import { createHash } from "node:crypto";

/**
 * Stable hash-based rollout bucketing.
 *
 * Maps a user id to a deterministic bucket 0..99 and compares it to a
 * percentage threshold set via env var. A user in bucket < threshold is "in"
 * the rollout.
 *
 * Using SHA-1 here only to spread the space uniformly — not for security.
 */
export function userBucket(userId: string): number {
  const hash = createHash("sha1").update(userId).digest();
  // Take the first 4 bytes as an unsigned int, then modulo 100.
  const n = hash.readUInt32BE(0);
  return n % 100;
}

export function isInRollout(userId: string | null | undefined, pctEnvVar: string, defaultPct = 0): boolean {
  if (!userId) return false;
  const raw = process.env[pctEnvVar];
  const pct = raw != null ? Number(raw) : defaultPct;
  if (!Number.isFinite(pct) || pct <= 0) return false;
  if (pct >= 100) return true;
  return userBucket(userId) < pct;
}

/** True when the alerts feature is available for this user. */
export function alertsEnabledFor(userId: string | null | undefined): boolean {
  // Rollout pct defaults to 10 per the Phase 2 spec. Override with
  // ALERTS_ROLLOUT_PCT=50 etc. Set to 100 to open it to everyone.
  return isInRollout(userId, "ALERTS_ROLLOUT_PCT", 10);
}
