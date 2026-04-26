import { Router } from "express";
import { execute, query, queryOne } from "../db";
import { notifySchemaReady } from "../lib/notifySchema";

const router = Router();

const VALID_KINDS = new Set(["news", "earnings"]);
const VALID_STATUSES = new Set(["active", "muted"]);
const VALID_CHANNELS = new Set(["push", "email", "both"]);

const DEFAULT_EVENT_LIMIT = 50;
const MAX_EVENT_LIMIT = 100;

router.use(async (_req, _res, next) => {
  await notifySchemaReady;
  next();
});

// ── Feature flag exposure for the mobile client ─────────────────────────────
router.get("/status", (_req, res) => {
  const enabled = (process.env.NOTIFY_ENABLED ?? "").toLowerCase() === "true";
  res.json({ enabled });
});

interface SubscriptionRow {
  id: string;
  user_id: string;
  symbol: string | null;
  kind: "news" | "earnings";
  status: "active" | "muted";
  min_impact_score: number | null;
  delivery_channel: "push" | "email" | "both";
  quiet_start_hour: number | null;
  quiet_end_hour: number | null;
  created_at: string;
  updated_at: string;
}

const SUB_COLUMNS = `id, user_id, symbol, kind, status, min_impact_score,
  delivery_channel, quiet_start_hour, quiet_end_hour, created_at, updated_at`;

// Validates an integer-or-null field. Returns { ok: true, value } on success;
// `value` is the coerced integer or null. On invalid input returns { ok: false }.
function parseIntOrNull(
  raw: unknown,
  min: number,
  max: number,
): { ok: true; value: number | null } | { ok: false } {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

// ── List subscriptions + user-default fallback per kind ─────────────────────
router.get("/subscriptions/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  try {
    // ORDER puts user-default rows (symbol IS NULL) first so the client can
    // index defaults by kind in a single pass.
    const rows = await query<SubscriptionRow>(
      `SELECT ${SUB_COLUMNS}
         FROM notify_subscriptions
        WHERE user_id = $1
        ORDER BY (symbol IS NULL) DESC, kind ASC, symbol ASC`,
      [userId],
    );
    const defaults: { news: SubscriptionRow | null; earnings: SubscriptionRow | null } = {
      news: null,
      earnings: null,
    };
    for (const r of rows) {
      if (r.symbol === null) {
        if (r.kind === "news" && !defaults.news) defaults.news = r;
        else if (r.kind === "earnings" && !defaults.earnings) defaults.earnings = r;
      }
    }
    res.json({ subscriptions: rows, defaults });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create or update a subscription (upsert on user_id, symbol, kind) ──────
router.post("/subscriptions/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });

  const body = req.body ?? {};
  const { kind } = body;
  if (typeof kind !== "string" || !VALID_KINDS.has(kind)) {
    return void res.status(400).json({ error: "kind must be news | earnings" });
  }

  let symbol: string | null = null;
  if (body.symbol !== undefined && body.symbol !== null) {
    if (typeof body.symbol !== "string" || !body.symbol.trim()) {
      return void res.status(400).json({ error: "symbol must be a non-empty string when provided" });
    }
    symbol = body.symbol.trim().toUpperCase();
  }

  let status: "active" | "muted" = "active";
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return void res.status(400).json({ error: "status must be active | muted" });
    }
    status = body.status as "active" | "muted";
  }

  let deliveryChannel: "push" | "email" | "both" = "push";
  if (body.delivery_channel !== undefined) {
    if (typeof body.delivery_channel !== "string" || !VALID_CHANNELS.has(body.delivery_channel)) {
      return void res.status(400).json({ error: "delivery_channel must be push | email | both" });
    }
    deliveryChannel = body.delivery_channel as "push" | "email" | "both";
  }

  const impactCheck = parseIntOrNull(body.min_impact_score, 0, 100);
  if (!impactCheck.ok) {
    return void res.status(400).json({ error: "min_impact_score must be an integer 0-100 or null" });
  }
  const startCheck = parseIntOrNull(body.quiet_start_hour, 0, 23);
  if (!startCheck.ok) {
    return void res.status(400).json({ error: "quiet_start_hour must be an integer 0-23 or null" });
  }
  const endCheck = parseIntOrNull(body.quiet_end_hour, 0, 23);
  if (!endCheck.ok) {
    return void res.status(400).json({ error: "quiet_end_hour must be an integer 0-23 or null" });
  }
  // Either both quiet hours set or neither — the evaluator treats one-NULL as
  // "no quiet window" so a half-set pair would silently disable suppression.
  const startSet = startCheck.value !== null;
  const endSet = endCheck.value !== null;
  if (startSet !== endSet) {
    return void res.status(400).json({
      error: "quiet_start_hour and quiet_end_hour must be set together or both null",
    });
  }

  try {
    // Two partial unique indexes (one per shape) → two upsert paths. The
    // schema already enforces (user_id, symbol, kind) uniqueness for symbol
    // IS NOT NULL and (user_id, kind) for symbol IS NULL.
    const conflictTarget =
      symbol === null ? "(user_id, kind) WHERE symbol IS NULL" : "(user_id, symbol, kind) WHERE symbol IS NOT NULL";
    const row = await queryOne<SubscriptionRow>(
      `INSERT INTO notify_subscriptions
         (user_id, symbol, kind, status, min_impact_score, delivery_channel,
          quiet_start_hour, quiet_end_hour)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT ${conflictTarget}
         DO UPDATE SET
           status = EXCLUDED.status,
           min_impact_score = EXCLUDED.min_impact_score,
           delivery_channel = EXCLUDED.delivery_channel,
           quiet_start_hour = EXCLUDED.quiet_start_hour,
           quiet_end_hour = EXCLUDED.quiet_end_hour,
           updated_at = NOW()
       RETURNING ${SUB_COLUMNS}`,
      [
        userId,
        symbol,
        kind,
        status,
        impactCheck.value,
        deliveryChannel,
        startCheck.value,
        endCheck.value,
      ],
    );
    res.json({ subscription: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Patch a single subscription (mute, channel, threshold, quiet hours) ────
router.patch("/subscriptions/:userId/:subId", async (req, res) => {
  const { userId, subId } = req.params;
  if (!userId || !subId) return void res.status(400).json({ error: "Missing userId or subId" });

  const body = req.body ?? {};
  const sets: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !VALID_STATUSES.has(body.status)) {
      return void res.status(400).json({ error: "status must be active | muted" });
    }
    sets.push(`status = $${i++}`);
    values.push(body.status);
  }
  if (body.delivery_channel !== undefined) {
    if (typeof body.delivery_channel !== "string" || !VALID_CHANNELS.has(body.delivery_channel)) {
      return void res.status(400).json({ error: "delivery_channel must be push | email | both" });
    }
    sets.push(`delivery_channel = $${i++}`);
    values.push(body.delivery_channel);
  }
  if (body.min_impact_score !== undefined) {
    const c = parseIntOrNull(body.min_impact_score, 0, 100);
    if (!c.ok) return void res.status(400).json({ error: "min_impact_score must be an integer 0-100 or null" });
    sets.push(`min_impact_score = $${i++}`);
    values.push(c.value);
  }
  if (body.quiet_start_hour !== undefined) {
    const c = parseIntOrNull(body.quiet_start_hour, 0, 23);
    if (!c.ok) return void res.status(400).json({ error: "quiet_start_hour must be an integer 0-23 or null" });
    sets.push(`quiet_start_hour = $${i++}`);
    values.push(c.value);
  }
  if (body.quiet_end_hour !== undefined) {
    const c = parseIntOrNull(body.quiet_end_hour, 0, 23);
    if (!c.ok) return void res.status(400).json({ error: "quiet_end_hour must be an integer 0-23 or null" });
    sets.push(`quiet_end_hour = $${i++}`);
    values.push(c.value);
  }

  if (!sets.length) return void res.status(400).json({ error: "nothing to update" });

  sets.push(`updated_at = NOW()`);
  values.push(userId, subId);

  try {
    const row = await queryOne<SubscriptionRow>(
      `UPDATE notify_subscriptions SET ${sets.join(", ")}
        WHERE user_id = $${i++} AND id = $${i}
       RETURNING ${SUB_COLUMNS}`,
      values,
    );
    if (!row) return void res.status(404).json({ error: "not found" });
    res.json({ subscription: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete a per-symbol override (user-default row protected) ──────────────
router.delete("/subscriptions/:userId/:subId", async (req, res) => {
  const { userId, subId } = req.params;
  if (!userId || !subId) return void res.status(400).json({ error: "Missing userId or subId" });
  try {
    const existing = await queryOne<{ symbol: string | null }>(
      "SELECT symbol FROM notify_subscriptions WHERE user_id = $1 AND id = $2",
      [userId, subId],
    );
    if (!existing) return void res.status(404).json({ error: "not found" });
    if (existing.symbol === null) {
      return void res.status(400).json({
        error: "user-default subscription cannot be deleted; update it via POST/PATCH",
      });
    }
    await execute(
      "DELETE FROM notify_subscriptions WHERE user_id = $1 AND id = $2",
      [userId, subId],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Inbox: paginated notification_events read ──────────────────────────────
router.get("/events/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });

  const rawLimit = Number(req.query.limit);
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(Math.floor(rawLimit), MAX_EVENT_LIMIT)
    : DEFAULT_EVENT_LIMIT;

  const beforeRaw = req.query.before;
  let before: Date | null = null;
  if (beforeRaw !== undefined) {
    if (typeof beforeRaw !== "string") {
      return void res.status(400).json({ error: "before must be an ISO timestamp string" });
    }
    const parsed = new Date(beforeRaw);
    if (Number.isNaN(parsed.getTime())) {
      return void res.status(400).json({ error: "before must be a valid ISO timestamp" });
    }
    before = parsed;
  }

  try {
    const rows = before
      ? await query<any>(
          `SELECT id, user_id, subscription_id, symbol, kind, source_kind,
                  source_id, title, body, fired_at, delivered_via
             FROM notification_events
            WHERE user_id = $1 AND fired_at < $2
            ORDER BY fired_at DESC
            LIMIT $3`,
          [userId, before.toISOString(), limit],
        )
      : await query<any>(
          `SELECT id, user_id, subscription_id, symbol, kind, source_kind,
                  source_id, title, body, fired_at, delivered_via
             FROM notification_events
            WHERE user_id = $1
            ORDER BY fired_at DESC
            LIMIT $2`,
          [userId, limit],
        );
    // Cursor for the next page = fired_at of the last row, or null when we
    // exhausted the result set (fewer rows than limit means no more pages).
    const nextBefore = rows.length === limit ? rows[rows.length - 1].fired_at : null;
    res.json({ events: rows, nextBefore });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
