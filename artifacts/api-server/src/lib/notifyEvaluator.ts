import { execute, query, queryOne } from "../db";
import { notifySchemaReady } from "./notifySchema";
import { sendExpoPush } from "./pushDelivery";
import { logger } from "./logger";

// Notification evaluator.
//
// PR 1 shipped the lifecycle + heartbeat skeleton. PR 2 (this file) wires up
// the news side:
//   - module-level cursor over news_cache.id, initialised lazily on the first
//     tick so historical rows never fire
//   - fan-out per news row → one row per user via window-function "first
//     match wins" between the per-symbol row and the user's NULL-symbol
//     default row
//   - per-user daily cap (5/24h, sliding) and quiet-hours suppression
//   - push-only delivery in PR 2 (delivery_channel='email'/'both' deferred to
//     a follow-up — schema supports it, evaluator does not yet)
//   - notification_events INSERT first → UNIQUE (subscription_id, source_kind,
//     source_id, kind) handles idempotency. We only send the push if the
//     INSERT actually wrote a row. A missed push beats an untracked one.
//
// Earnings side (T-1 / T-open / T-after) lands in PR 3.

const TICK_INTERVAL_MS = 60 * 1000;
const NEWS_DAILY_CAP = 5;
const NEWS_BATCH_LIMIT = 500;
const PUSH_BODY_MAX_CHARS = 178; // Expo push body soft cap

function isEnabled(): boolean {
  return (process.env.NOTIFY_ENABLED ?? "").toLowerCase() === "true";
}

// ── Cursor ───────────────────────────────────────────────────────────────────
// In-memory only. On process restart we re-init from MAX(id), which means
// rows queued during downtime are skipped. Acceptable for MVP — the design
// doc calls cursor reset out as a known gap and we'd rather lose a few
// alerts than double-send on every redeploy.
let newsCursor: number | null = null;

async function initNewsCursor(): Promise<number> {
  try {
    const row = await queryOne<{ max_id: string | number | null }>(
      "SELECT MAX(id) AS max_id FROM news_cache",
    );
    const raw = row?.max_id;
    if (raw == null) return 0;
    const n = typeof raw === "string" ? Number(raw) : raw;
    return Number.isFinite(n) ? n : 0;
  } catch (err: any) {
    // news_cache may not exist yet on first boot before newsSchemaReady has
    // run. Try again next tick.
    logger.warn({ err: err?.message }, "notify evaluator: news cursor init deferred");
    return -1;
  }
}

// ── Subscriber resolution ────────────────────────────────────────────────────
interface NewsRow {
  id: number;
  symbol: string;
  title: string;
  publisher: string;
  impact_score: number | null;
}

interface SubscriberRow {
  id: string;
  user_id: string;
  symbol: string | null;
  status: "active" | "muted";
  min_impact_score: number | null;
  delivery_channel: "push" | "email" | "both";
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
}

// Per-symbol row wins over the user-default row. If the per-symbol row is
// muted, the user is skipped (explicit mute) — the default does not bubble
// through. If only the default exists, it's used.
async function resolveSubscribers(symbol: string): Promise<SubscriberRow[]> {
  return query<SubscriberRow>(
    `SELECT id, user_id, symbol, status, min_impact_score, delivery_channel,
            quiet_start_hour, quiet_end_hour
       FROM (
         SELECT ns.*,
                ROW_NUMBER() OVER (
                  PARTITION BY user_id
                  ORDER BY (symbol IS NULL) ASC
                ) AS prio
           FROM notify_subscriptions ns
          WHERE kind = 'news'
            AND (symbol = $1 OR symbol IS NULL)
       ) ranked
      WHERE prio = 1`,
    [symbol],
  );
}

// ── Cap + quiet-hours predicates ─────────────────────────────────────────────
async function isOverDailyCap(userId: string): Promise<boolean> {
  const row = await queryOne<{ c: string | number }>(
    `SELECT COUNT(*) AS c
       FROM notification_events
      WHERE user_id = $1
        AND kind = 'news'
        AND fired_at > NOW() - INTERVAL '24 hours'
        AND delivered_via NOT LIKE 'suppressed:%'`,
    [userId],
  );
  const c = Number(row?.c ?? 0);
  return Number.isFinite(c) && c >= NEWS_DAILY_CAP;
}

async function getUserTimezone(userId: string): Promise<string> {
  const row = await queryOne<{ timezone: string | null }>(
    `SELECT timezone FROM expo_push_tokens
      WHERE user_id = $1 AND timezone IS NOT NULL
      ORDER BY last_seen DESC
      LIMIT 1`,
    [userId],
  );
  return row?.timezone || "UTC";
}

function currentHourInTz(now: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: tz,
    }).formatToParts(now);
    const raw = parts.find((p) => p.type === "hour")?.value ?? "";
    const n = Number(raw);
    if (!Number.isFinite(n)) return now.getUTCHours();
    // Some ICU builds return 24 instead of 0 at midnight.
    return n === 24 ? 0 : n;
  } catch {
    return now.getUTCHours();
  }
}

function inQuietWindow(hour: number, start: number, end: number): boolean {
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // Wrap-over-midnight (e.g. start=22, end=6).
  return hour >= start || hour < end;
}

async function isInQuietHours(userId: string, sub: SubscriberRow): Promise<boolean> {
  if (sub.quiet_start_hour == null || sub.quiet_end_hour == null) return false;
  const tz = await getUserTimezone(userId);
  const hour = currentHourInTz(new Date(), tz);
  return inQuietWindow(hour, sub.quiet_start_hour, sub.quiet_end_hour);
}

// ── Push payload formatter ───────────────────────────────────────────────────
function formatPayload(news: NewsRow): { title: string; body: string } {
  const title = news.symbol;
  const raw = `${news.publisher}: ${news.title}`;
  const body =
    raw.length <= PUSH_BODY_MAX_CHARS ? raw : raw.slice(0, PUSH_BODY_MAX_CHARS - 1) + "…";
  return { title, body };
}

async function sendNewsPush(
  userId: string,
  title: string,
  body: string,
  news: NewsRow,
): Promise<"push" | "push:no_token" | "push:failed"> {
  const tokens = await query<{ token: string }>(
    "SELECT token FROM expo_push_tokens WHERE user_id = $1",
    [userId],
  );
  if (!tokens.length) return "push:no_token";
  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default" as const,
    data: { kind: "news_alert", symbol: news.symbol, newsId: news.id },
  }));
  const receipts = await sendExpoPush(messages);
  return receipts.length ? "push" : "push:failed";
}

// ── Telemetry ────────────────────────────────────────────────────────────────
type Outcome = "sent" | "cap" | "quiet";

async function writeTelemetry(
  outcome: Outcome,
  sub: SubscriberRow,
  news: NewsRow,
  finalDeliveredVia: string,
): Promise<void> {
  const eventType =
    outcome === "sent"
      ? "news_alert_sent"
      : outcome === "cap"
        ? "notification_suppressed_cap"
        : "notification_suppressed_quiet_hours";
  try {
    await execute(
      `INSERT INTO user_events (user_id, event_type, payload, ip_address, user_agent)
       VALUES ($1, $2, $3, NULL, NULL)`,
      [
        sub.user_id,
        eventType,
        JSON.stringify({
          subscriptionId: sub.id,
          newsId: news.id,
          symbol: news.symbol,
          impactScore: news.impact_score,
          deliveredVia: finalDeliveredVia,
        }),
      ],
    );
  } catch (err: any) {
    // Telemetry failures must not block the worker.
    logger.warn({ err: err?.message, eventType }, "notify telemetry insert failed");
  }
}

// ── Per-row fan-out + per-user fire ──────────────────────────────────────────
async function fireOne(news: NewsRow, sub: SubscriberRow): Promise<void> {
  const overCap = await isOverDailyCap(sub.user_id);
  const inQuiet = !overCap && (await isInQuietHours(sub.user_id, sub));

  let outcome: Outcome;
  let initialDelivery: string;
  if (overCap) {
    outcome = "cap";
    initialDelivery = "suppressed:cap";
  } else if (inQuiet) {
    outcome = "quiet";
    initialDelivery = "suppressed:quiet_hours";
  } else {
    outcome = "sent";
    // Optimistic — UPDATE below if the push attempt downgraded the result.
    // PR 2 sends push regardless of sub.delivery_channel; email/both is a
    // follow-up.
    initialDelivery = "push";
  }

  const { title, body } = formatPayload(news);

  // INSERT first. UNIQUE (subscription_id, source_kind, source_id, kind)
  // makes this idempotent — if a row already exists, we skip the push and
  // the telemetry. A missed push beats an untracked one.
  const inserted = await queryOne<{ id: string | number }>(
    `INSERT INTO notification_events
       (user_id, subscription_id, symbol, kind, source_kind, source_id, title, body, delivered_via)
     VALUES ($1, $2, $3, 'news', 'news_cache', $4, $5, $6, $7)
     ON CONFLICT (subscription_id, source_kind, source_id, kind) DO NOTHING
     RETURNING id`,
    [sub.user_id, sub.id, news.symbol, news.id, title, body, initialDelivery],
  );
  if (!inserted) return;

  let finalDelivery = initialDelivery;
  if (outcome === "sent") {
    const result = await sendNewsPush(sub.user_id, title, body, news);
    if (result !== "push") {
      finalDelivery = result;
      await execute(
        "UPDATE notification_events SET delivered_via = $1 WHERE id = $2",
        [finalDelivery, inserted.id],
      );
    }
  }

  await writeTelemetry(outcome, sub, news, finalDelivery);
}

async function fanOutNewsRow(news: NewsRow): Promise<void> {
  const subs = await resolveSubscribers(news.symbol);
  for (const sub of subs) {
    if (sub.status === "muted") continue;
    const minImpact = sub.min_impact_score ?? 60;
    if ((news.impact_score ?? 0) < minImpact) continue;
    try {
      await fireOne(news, sub);
    } catch (err: any) {
      logger.warn(
        { err: err?.message, newsId: news.id, subscriptionId: sub.id },
        "notify fireOne failed",
      );
    }
  }
}

// ── News cursor scan ─────────────────────────────────────────────────────────
async function processNewsCursor(): Promise<void> {
  if (newsCursor === null || newsCursor < 0) {
    newsCursor = await initNewsCursor();
    // Still negative → news_cache not ready yet; try again next tick.
    if (newsCursor < 0) return;
    return; // First run after init is the baseline; new rows arrive next tick.
  }

  const rows = await query<NewsRow>(
    `SELECT id, symbol, title, publisher, impact_score
       FROM news_cache
      WHERE id > $1
        AND impact_score IS NOT NULL
      ORDER BY id ASC
      LIMIT $2`,
    [newsCursor, NEWS_BATCH_LIMIT],
  );
  if (!rows.length) return;

  for (const row of rows) {
    try {
      await fanOutNewsRow(row);
    } catch (err: any) {
      logger.warn({ err: err?.message, newsId: row.id }, "notify fan-out failed");
    }
  }
  newsCursor = Number(rows[rows.length - 1].id);
}

async function tick(): Promise<void> {
  await processNewsCursor();
  await touchHeartbeat();
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('notify_evaluator', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startNotifyEvaluator(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info("Notify evaluator disabled — set NOTIFY_ENABLED=true to start");
    return;
  }
  running = true;
  await notifySchemaReady;
  logger.info({ intervalMs: TICK_INTERVAL_MS }, "Notify evaluator starting");

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Notify evaluator tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };
  loop();
}

export function stopNotifyEvaluator(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

// Exposed for unit tests.
export const __test__ = {
  inQuietWindow,
  currentHourInTz,
  formatPayload,
  resetCursorForTest: () => {
    newsCursor = null;
  },
};
