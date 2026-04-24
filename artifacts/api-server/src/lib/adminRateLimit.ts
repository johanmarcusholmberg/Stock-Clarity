import { execute, queryOne } from "../db";
import { adminSchemaReady } from "./adminSchema";

// Sliding-window rate limit for admin subscription-tool MUTATIONS. Shared
// across server instances via admin_rate_limit_hits — a single in-memory
// counter wouldn't hold up under multi-instance. 10 actions /
// admin_email / hour per design doc §6.
//
// Reads aren't counted; only routes that mutate state (grants create/
// extend/revoke, Stripe cancel/refund, IAP stubs). The stubs count even
// though they return 501, because they still write an admin_audit row and
// we want to rate-limit audit-noise the same way as real mutations.
//
// Ordering: COUNT before INSERT. A race between two concurrent mutations
// can let an 11th action slip through (both see count=9, both insert, end
// at 11). At our admin scale (~5 active admins) this is acceptable slop;
// tightening with advisory locks would add complexity without a real
// threat model.

export const MAX_ACTIONS_PER_HOUR = 10;

export interface RateLimitResult {
  allowed: boolean;
  // Count INCLUDING the current row when allowed, otherwise the pre-attempt
  // count (nothing was inserted). Useful for response diagnostics.
  count: number;
  // Seconds until the oldest in-window row falls off. Populated on reject
  // so clients can set a meaningful retry timer; null on allow.
  retryAfterSec: number | null;
}

// Checks the per-email budget; on allow, records a new hit before returning
// so the caller can proceed with the mutation without a second DB round
// trip. On reject, returns the retry-after in seconds derived from the
// oldest row in the window.
export async function checkAndRecordAdminAction(
  adminEmail: string,
): Promise<RateLimitResult> {
  await adminSchemaReady;
  const email = adminEmail.toLowerCase().trim();

  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM admin_rate_limit_hits
      WHERE admin_email = $1
        AND created_at > NOW() - INTERVAL '1 hour'`,
    [email],
  );
  const count = parseInt(countRow?.count ?? "0", 10);

  if (count >= MAX_ACTIONS_PER_HOUR) {
    const oldest = await queryOne<{ created_at: Date | string }>(
      `SELECT created_at FROM admin_rate_limit_hits
        WHERE admin_email = $1
          AND created_at > NOW() - INTERVAL '1 hour'
        ORDER BY created_at ASC LIMIT 1`,
      [email],
    );
    const oldestMs =
      oldest?.created_at instanceof Date
        ? oldest.created_at.getTime()
        : oldest?.created_at
          ? new Date(oldest.created_at).getTime()
          : Date.now();
    const expiresAtMs = oldestMs + 60 * 60 * 1000;
    const waitMs = Math.max(0, expiresAtMs - Date.now());
    return { allowed: false, count, retryAfterSec: Math.ceil(waitMs / 1000) };
  }

  await execute(
    `INSERT INTO admin_rate_limit_hits (admin_email) VALUES ($1)`,
    [email],
  );
  return { allowed: true, count: count + 1, retryAfterSec: null };
}
