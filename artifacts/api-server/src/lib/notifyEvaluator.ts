import { execute } from "../db";
import { notifySchemaReady } from "./notifySchema";
import { logger } from "./logger";

// Notification evaluator skeleton.
//
// PR 1 ships only the lifecycle + heartbeat. The evaluator runs every 60s,
// writes a heartbeat row, and returns. PR 2 fills in the news side (cursor
// over news_cache → fan-out via notify_subscriptions → push), PR 3 the
// earnings side (T-1 / T-open / T-after windows).
//
// The heartbeat is wired now so the mobile Alerts tab's "service delayed"
// banner (alerts.tsx:88) can read this worker's health from day one once
// PR 5 unifies the two banners.

const TICK_INTERVAL_MS = 60 * 1000;

function isEnabled(): boolean {
  return (process.env.NOTIFY_ENABLED ?? "").toLowerCase() === "true";
}

async function tick(): Promise<void> {
  // No-op until PR 2. Heartbeat-only so health monitoring can land alongside
  // the schema.
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
