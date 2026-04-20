import { Router } from "express";
import { execute, query, queryOne } from "../db";
import { alertsSchemaReady } from "../lib/alertsSchema";
import { alertsEnabledFor } from "../lib/featureFlags";

const router = Router();

const VALID_TYPES = new Set(["price_above", "price_below", "pct_change_day"]);
const VALID_CHANNELS = new Set(["push", "email", "both"]);
const VALID_STATUSES = new Set(["active", "snoozed", "triggered", "disabled"]);
const HEARTBEAT_STALE_MS = 10 * 60 * 1000;

router.use(async (_req, _res, next) => {
  await alertsSchemaReady;
  next();
});

// ── Feature availability + service health ────────────────────────────────────
router.get("/status", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : null;
  const enabled = alertsEnabledFor(userId);
  const beat = await queryOne<{ last_beat: string }>(
    "SELECT last_beat FROM service_heartbeats WHERE service = 'alerts_evaluator'",
  );
  const lastBeat = beat?.last_beat ? new Date(beat.last_beat).getTime() : 0;
  const evaluatorHealthy = lastBeat > 0 && Date.now() - lastBeat < HEARTBEAT_STALE_MS;
  res.json({ enabled, evaluatorHealthy, lastBeat: beat?.last_beat ?? null });
});

// ── List alerts for a user ───────────────────────────────────────────────────
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  try {
    const rows = await query(
      `SELECT a.id, a.symbol, a.type, a.threshold, a.status, a.delivery_channel,
              a.last_fired_at, a.created_at,
              (SELECT COUNT(*) FROM alert_events e WHERE e.alert_id = a.id) AS fire_count
         FROM alerts a
        WHERE a.user_id = $1
        ORDER BY a.symbol ASC, a.created_at DESC`,
      [userId],
    );
    res.json({ alerts: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Create an alert ──────────────────────────────────────────────────────────
router.post("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  if (!alertsEnabledFor(userId)) {
    return void res.status(403).json({ error: "Alerts not enabled for this account yet" });
  }

  const { symbol, type, threshold, deliveryChannel } = req.body ?? {};
  if (typeof symbol !== "string" || !symbol.trim()) {
    return void res.status(400).json({ error: "symbol required" });
  }
  if (!VALID_TYPES.has(type)) {
    return void res.status(400).json({ error: "type must be price_above | price_below | pct_change_day" });
  }
  const numThreshold = Number(threshold);
  if (!Number.isFinite(numThreshold) || numThreshold <= 0) {
    return void res.status(400).json({ error: "threshold must be a positive number" });
  }
  const channel = typeof deliveryChannel === "string" && VALID_CHANNELS.has(deliveryChannel)
    ? deliveryChannel
    : "push";

  try {
    const row = await queryOne<any>(
      `INSERT INTO alerts (user_id, symbol, type, threshold, delivery_channel)
       VALUES ($1, UPPER($2), $3, $4, $5)
       RETURNING id, symbol, type, threshold, status, delivery_channel, last_fired_at, created_at`,
      [userId, symbol.trim(), type, numThreshold, channel],
    );
    res.json({ alert: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Update status / threshold / channel ──────────────────────────────────────
router.patch("/:userId/:alertId", async (req, res) => {
  const { userId, alertId } = req.params;
  const { status, threshold, deliveryChannel } = req.body ?? {};

  const sets: string[] = [];
  const values: any[] = [];
  let i = 1;

  if (status !== undefined) {
    if (!VALID_STATUSES.has(status)) {
      return void res.status(400).json({ error: "invalid status" });
    }
    sets.push(`status = $${i++}`);
    values.push(status);
  }
  if (threshold !== undefined) {
    const n = Number(threshold);
    if (!Number.isFinite(n) || n <= 0) {
      return void res.status(400).json({ error: "threshold must be a positive number" });
    }
    sets.push(`threshold = $${i++}`);
    values.push(n);
    // Changing the threshold resets the re-cross bookkeeping so the next
    // crossing can fire immediately rather than being suppressed as the
    // "same side" as before.
    sets.push(`last_side = NULL`);
  }
  if (deliveryChannel !== undefined) {
    if (!VALID_CHANNELS.has(deliveryChannel)) {
      return void res.status(400).json({ error: "invalid deliveryChannel" });
    }
    sets.push(`delivery_channel = $${i++}`);
    values.push(deliveryChannel);
  }
  if (!sets.length) return void res.status(400).json({ error: "nothing to update" });

  sets.push(`updated_at = NOW()`);
  values.push(userId, alertId);

  try {
    const row = await queryOne<any>(
      `UPDATE alerts SET ${sets.join(", ")}
        WHERE user_id = $${i++} AND id = $${i}
       RETURNING id, symbol, type, threshold, status, delivery_channel, last_fired_at, created_at`,
      values,
    );
    if (!row) return void res.status(404).json({ error: "not found" });
    res.json({ alert: row });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete an alert ──────────────────────────────────────────────────────────
router.delete("/:userId/:alertId", async (req, res) => {
  const { userId, alertId } = req.params;
  try {
    await execute("DELETE FROM alerts WHERE user_id = $1 AND id = $2", [userId, alertId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Recent fires (for the global Alerts screen) ──────────────────────────────
router.get("/:userId/events", async (req, res) => {
  const { userId } = req.params;
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  try {
    const rows = await query(
      `SELECT e.id, e.alert_id, e.fired_at, e.price_at_fire, e.delivered_via,
              a.symbol, a.type, a.threshold
         FROM alert_events e
         JOIN alerts a ON a.id = e.alert_id
        WHERE a.user_id = $1
        ORDER BY e.fired_at DESC
        LIMIT $2`,
      [userId, limit],
    );
    res.json({ events: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
