import { execute, query } from "../db";
import { adminSchemaReady } from "./adminSchema";
import { logger } from "./logger";

// 3-day pre-expiry warning worker for admin_grants (Phase 3.2 PR 5a).
//
// Runs daily. For each active grant whose expires_at is within 3 days AND
// whose warn_sent_at is NULL, writes a user_events row
// { event_type: 'grant_expiry_warned', grant_id, expires_at } and flips
// warn_sent_at = NOW(). Idempotent — the NULL filter and the flip together
// guarantee exactly-once semantics per grant (unless an admin extends the
// grant, which resets warn_sent_at to NULL in PATCH /grants/:grantId).
//
// IMPORTANT: THIS WORKER DOES NOT SEND EMAILS.
//
// The design doc §5 referred to a "Stripe-sender plumbing from Phase 2" for
// alert emails. That plumbing is actually a stub — alertEvaluator.ts:199
// only logs 'email:queued' and defers to a future email worker. We match
// that pattern here: the queued user_events row is the hand-off signal.
// When (if) a real transactional email worker lands, it'll pick up both
// the alert queue and this one without any change here.
//
// Cadence & catch-up: every 24 hours. If the worker cold-boots during a
// warning window (e.g. a grant expired 4 days from now but the service was
// down for the nightly tick), the next tick catches it. No lost warnings as
// long as the service runs at least once every ~3 days.

const INTERVAL_MS = 24 * 60 * 60 * 1000;
const BOOT_RETRY_MS = 30 * 1000;
const WARNING_WINDOW_DAYS = 3;

interface WarnRow {
  id: string;
  user_id: string;
  tier: "pro" | "premium";
  expires_at: Date | string;
}

async function tick(): Promise<{ warned: number }> {
  const rows = await query<WarnRow>(
    `SELECT id, user_id, tier, expires_at
       FROM admin_grants
      WHERE status = 'active'
        AND warn_sent_at IS NULL
        AND expires_at > NOW()
        AND expires_at < NOW() + ($1 || ' days')::interval
      ORDER BY expires_at ASC`,
    [String(WARNING_WINDOW_DAYS)],
  );

  let warned = 0;
  for (const row of rows) {
    try {
      const expiresAtIso =
        row.expires_at instanceof Date
          ? row.expires_at.toISOString()
          : new Date(row.expires_at).toISOString();

      await execute(
        `INSERT INTO user_events (user_id, event_type, payload, ip_address, user_agent)
         VALUES ($1, $2, $3, NULL, NULL)`,
        [
          row.user_id,
          "grant_expiry_warned",
          JSON.stringify({
            grantId: row.id,
            grantTier: row.tier,
            expiresAt: expiresAtIso,
            warningWindowDays: WARNING_WINDOW_DAYS,
          }),
        ],
      );

      // Flip warn_sent_at only after the event-row insert succeeds. If the
      // insert fails we'll retry on the next tick rather than silently
      // dropping the warning.
      await execute(
        `UPDATE admin_grants SET warn_sent_at = NOW()
          WHERE id = $1 AND warn_sent_at IS NULL`,
        [row.id],
      );
      warned++;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, grantId: row.id, userId: row.user_id },
        "Grant expiry warning bookkeeping failed",
      );
    }
  }

  if (warned > 0) {
    logger.info({ count: warned }, "Grant expiry warning tick queued notifications");
  }
  return { warned };
}

let running = false;
let timer: NodeJS.Timeout | null = null;
let hasSucceededOnce = false;

export async function startGrantExpiryWarningWorker(): Promise<void> {
  if (running) return;
  running = true;
  await adminSchemaReady;
  logger.info(
    { intervalMs: INTERVAL_MS, bootRetryMs: BOOT_RETRY_MS },
    "Grant expiry warning worker starting",
  );

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
      hasSucceededOnce = true;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, retryingIn: hasSucceededOnce ? INTERVAL_MS : BOOT_RETRY_MS },
        "Grant expiry warning tick failed",
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

export function stopGrantExpiryWarningWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

export const __test__ = { tick };
