import { query, execute } from "../db";
import { adminSchemaReady } from "./adminSchema";
import { computeEffectiveTier, writeAdminAudit } from "./tierService";
import { storage } from "../storage";
import { logger } from "./logger";

// Hourly once we're healthy. 30s retry until the first tick succeeds so we
// catch anything that expired during downtime even if the DB isn't accepting
// connections the instant the worker starts. adminSchemaReady resolves even
// on failure (it swallows errors to keep the import side-effect non-fatal),
// so we can't rely on it alone as a DB-ready signal.
const INTERVAL_MS = 60 * 60 * 1000;
const BOOT_RETRY_MS = 30 * 1000;

// Flip status='active' → 'expired' for any grant whose expires_at has passed.
// Idempotent: the status filter guarantees we only touch each row once, even
// if two ticks race.
//
// Returns the rows we flipped so the caller can recompute effective tier and
// write audit rows. We do the RETURNING + per-row work rather than a pure
// UPDATE-without-returning because the downstream bookkeeping (tier
// projection, audit log) needs the user id + previous tier per grant.
async function tick(): Promise<{ expired: number }> {
  const expired = await query<{
    id: string;
    user_id: string;
    tier: "pro" | "premium";
    expires_at: Date | string;
  }>(
    `UPDATE admin_grants
        SET status = 'expired'
      WHERE status = 'active'
        AND expires_at < NOW()
      RETURNING id, user_id, tier, expires_at`,
  );

  for (const row of expired) {
    try {
      const before = await storage.getUserByClerkId(row.user_id);
      const previousTier = before?.tier ?? "free";

      // Recompute from scratch now the grant is no longer active. For a user
      // who still has a Stripe sub this drops them to the Stripe tier; for a
      // user with no sub this drops them to 'free'.
      const effective = await computeEffectiveTier(row.user_id);
      if (effective.tier !== previousTier) {
        await storage.updateUserTier(row.user_id, effective.tier);
      }

      await writeAdminAudit({
        adminEmail: "system",
        userId: row.user_id,
        action: "expire",
        source: "manual",
        previousState: { tier: previousTier, grantId: row.id, grantTier: row.tier },
        newState: { tier: effective.tier, source: effective.source },
        reason: "grant expired",
        metadata: { grantId: row.id, grantTier: row.tier, grantExpiresAt: row.expires_at },
      });
    } catch (err: any) {
      // Don't let one corrupted grant kill the whole tick. Row is already
      // flipped to 'expired' by the UPDATE above, so the next tick won't
      // re-attempt it — we log and move on.
      logger.warn(
        { err: err?.message, grantId: row.id, userId: row.user_id },
        "Grant expiry bookkeeping failed",
      );
    }
  }

  if (expired.length > 0) {
    logger.info({ count: expired.length }, "Grant expiry tick processed expirations");
  }
  return { expired: expired.length };
}

let running = false;
let timer: NodeJS.Timeout | null = null;
let hasSucceededOnce = false;

export async function startGrantExpiryWorker(): Promise<void> {
  if (running) return;
  running = true;
  await adminSchemaReady;
  logger.info(
    { intervalMs: INTERVAL_MS, bootRetryMs: BOOT_RETRY_MS },
    "Grant expiry worker starting",
  );

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
      hasSucceededOnce = true;
    } catch (err: any) {
      // First-tick failures usually mean the DB isn't ready yet. Keep the
      // fast retry cadence until we've succeeded at least once so we don't
      // lose an hour of catch-up work after a cold boot.
      logger.warn(
        { err: err?.message, retryingIn: hasSucceededOnce ? INTERVAL_MS : BOOT_RETRY_MS },
        "Grant expiry tick failed",
      );
    } finally {
      if (running) {
        const next = hasSucceededOnce ? INTERVAL_MS : BOOT_RETRY_MS;
        timer = setTimeout(loop, next);
      }
    }
  };
  loop();
}

export function stopGrantExpiryWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

// Exposed so dev/admin callers can force a tick from a route during QA.
export const __test__ = { tick };
