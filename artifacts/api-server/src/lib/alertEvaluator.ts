import { execute, query, queryOne } from "../db";
import { alertsSchemaReady } from "./alertsSchema";
import { alertsEnabledFor } from "./featureFlags";
import { sendExpoPush } from "./pushDelivery";
import { sendEmail, alertNotificationEmail } from "./email";
import { logger } from "./logger";

type AlertRow = {
  id: string;
  user_id: string;
  symbol: string;
  type: "price_above" | "price_below" | "pct_change_day";
  threshold: string;        // numeric comes back as string from pg
  delivery_channel: "push" | "email" | "both";
  last_fired_at: string | null;
  last_side: string | null;
};

type Quote = { price: number; changePct: number };

const EVALUATOR_INTERVAL_MS = 60 * 1000;
const PCT_COOLDOWN_MS = 15 * 60 * 1000;

// ── Quote fetcher ────────────────────────────────────────────────────────────
// Route through the internal /api/stocks/quote endpoint so we reuse its
// Yahoo crumb/cookie auth and its 5-minute cache. Practical effect: alerts
// fire within 60s–5min of a threshold cross (good enough for MVP).
// If/when we need <60s end-to-end, we'll shorten the cache TTL in stocks.ts
// or add a short-circuit path for symbols with active alerts.

const PORT = process.env.PORT ?? "8080";
const INTERNAL_BASE = `http://127.0.0.1:${PORT}/api`;

async function fetchQuote(symbol: string): Promise<Quote | null> {
  try {
    const url = `${INTERNAL_BASE}/stocks/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { quotes?: any[] };
    const q = Array.isArray(data?.quotes) ? data.quotes[0] : null;
    if (!q) return null;
    const price = Number(q.regularMarketPrice);
    const changePct = Number(q.regularMarketChangePercent);
    if (!Number.isFinite(price) || price <= 0) return null;
    return {
      price,
      changePct: Number.isFinite(changePct) ? changePct : 0,
    };
  } catch {
    return null;
  }
}

// ── Predicate evaluation + side tracking ─────────────────────────────────────
function shouldFire(alert: AlertRow, quote: Quote): { fires: boolean; newSide: string | null } {
  const threshold = Number(alert.threshold);
  if (!Number.isFinite(threshold)) return { fires: false, newSide: alert.last_side };

  if (alert.type === "price_above") {
    const nowAbove = quote.price >= threshold;
    if (nowAbove && alert.last_side !== "above") return { fires: true, newSide: "above" };
    if (!nowAbove && alert.last_side !== null) return { fires: false, newSide: null };
    return { fires: false, newSide: alert.last_side };
  }
  if (alert.type === "price_below") {
    const nowBelow = quote.price <= threshold;
    if (nowBelow && alert.last_side !== "below") return { fires: true, newSide: "below" };
    if (!nowBelow && alert.last_side !== null) return { fires: false, newSide: null };
    return { fires: false, newSide: alert.last_side };
  }
  // pct_change_day — fire when |changePct| >= threshold and cooldown elapsed
  if (alert.type === "pct_change_day") {
    if (Math.abs(quote.changePct) < threshold) return { fires: false, newSide: null };
    const last = alert.last_fired_at ? new Date(alert.last_fired_at).getTime() : 0;
    if (Date.now() - last < PCT_COOLDOWN_MS) return { fires: false, newSide: alert.last_side };
    return { fires: true, newSide: null };
  }
  return { fires: false, newSide: alert.last_side };
}

function formatMessage(alert: AlertRow, quote: Quote): { title: string; body: string } {
  const t = Number(alert.threshold);
  if (alert.type === "price_above") {
    return {
      title: `${alert.symbol} above ${t}`,
      body: `${alert.symbol} is at ${quote.price.toFixed(2)} — passed your ${t} target.`,
    };
  }
  if (alert.type === "price_below") {
    return {
      title: `${alert.symbol} below ${t}`,
      body: `${alert.symbol} is at ${quote.price.toFixed(2)} — under your ${t} target.`,
    };
  }
  const dir = quote.changePct >= 0 ? "up" : "down";
  return {
    title: `${alert.symbol} moved ${quote.changePct.toFixed(1)}% today`,
    body: `${alert.symbol} is ${dir} ${Math.abs(quote.changePct).toFixed(1)}% today — past your ±${t}% threshold.`,
  };
}

// ── Single tick ──────────────────────────────────────────────────────────────
async function tick(): Promise<void> {
  const alerts = await query<AlertRow>(
    `SELECT id, user_id, symbol, type, threshold::text AS threshold, delivery_channel,
            last_fired_at, last_side
       FROM alerts
      WHERE status = 'active'`,
  );

  if (!alerts.length) {
    await touchHeartbeat();
    return;
  }

  // Skip users not in the rollout — no point spending Yahoo bandwidth on them.
  const eligible = alerts.filter((a) => alertsEnabledFor(a.user_id));
  if (!eligible.length) {
    await touchHeartbeat();
    return;
  }

  const uniqueSymbols = Array.from(new Set(eligible.map((a) => a.symbol)));
  const quotes = new Map<string, Quote>();
  await Promise.all(
    uniqueSymbols.map(async (s) => {
      const q = await fetchQuote(s);
      if (q) quotes.set(s, q);
    }),
  );

  for (const alert of eligible) {
    const quote = quotes.get(alert.symbol);
    if (!quote) continue;

    const decision = shouldFire(alert, quote);

    if (decision.fires) {
      await fireAlert(alert, quote, decision.newSide);
    } else if (decision.newSide !== alert.last_side) {
      // Reset side bookkeeping when the price moves out of the triggered region
      // (so a re-cross can fire again).
      await execute("UPDATE alerts SET last_side = $1, updated_at = NOW() WHERE id = $2", [
        decision.newSide,
        alert.id,
      ]);
    }
  }

  await touchHeartbeat();
}

async function fireAlert(alert: AlertRow, quote: Quote, newSide: string | null): Promise<void> {
  const { title, body } = formatMessage(alert, quote);
  const deliveredVia = await deliver(alert, title, body);

  await execute(
    `UPDATE alerts
        SET last_fired_at = NOW(), last_side = $2, updated_at = NOW()
      WHERE id = $1`,
    [alert.id, newSide],
  );
  await execute(
    `INSERT INTO alert_events (alert_id, price_at_fire, delivered_via) VALUES ($1, $2, $3)`,
    [alert.id, quote.price, deliveredVia],
  );
}

async function deliver(alert: AlertRow, title: string, body: string): Promise<string> {
  const channels = new Set<string>();
  if (alert.delivery_channel === "push" || alert.delivery_channel === "both") channels.add("push");
  if (alert.delivery_channel === "email" || alert.delivery_channel === "both") channels.add("email");

  const results: string[] = [];

  if (channels.has("push")) {
    const tokens = await query<{ token: string }>(
      "SELECT token FROM expo_push_tokens WHERE user_id = $1",
      [alert.user_id],
    );
    if (tokens.length) {
      const messages = tokens.map((t) => ({
        to: t.token,
        title,
        body,
        sound: "default" as const,
        data: { kind: "alert", alertId: alert.id, symbol: alert.symbol },
      }));
      const receipts = await sendExpoPush(messages);
      results.push(receipts.length ? "push" : "push:failed");
    } else {
      results.push("push:no_token");
    }
  }

  if (channels.has("email")) {
    const userRow = await queryOne<{ email: string | null }>(
      "SELECT email FROM users WHERE clerk_user_id = $1",
      [alert.user_id],
    );
    const email = userRow?.email ?? null;
    if (!email) {
      results.push("email:no_address");
    } else {
      const sendResult = await sendEmail(
        alertNotificationEmail({ to: email, title, body, symbol: alert.symbol }),
      );
      if (sendResult.ok) {
        results.push("email");
      } else if ("skipped" in sendResult && sendResult.skipped) {
        results.push("email:not_configured");
      } else {
        results.push("email:failed");
      }
    }
  }

  return results.join(",") || "none";
}

async function touchHeartbeat(): Promise<void> {
  await execute(
    `INSERT INTO service_heartbeats (service, last_beat) VALUES ('alerts_evaluator', NOW())
     ON CONFLICT (service) DO UPDATE SET last_beat = NOW()`,
  );
}

// ── Public lifecycle ─────────────────────────────────────────────────────────
let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startAlertEvaluator(): Promise<void> {
  if (running) return;
  running = true;
  await alertsSchemaReady;
  logger.info({ intervalMs: EVALUATOR_INTERVAL_MS }, "Alert evaluator starting");

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Alert evaluator tick error");
    } finally {
      if (running) timer = setTimeout(loop, EVALUATOR_INTERVAL_MS);
    }
  };
  loop();
}

export function stopAlertEvaluator(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}

// Exposed for unit testing the predicate logic.
export const __test__ = { shouldFire, formatMessage };
