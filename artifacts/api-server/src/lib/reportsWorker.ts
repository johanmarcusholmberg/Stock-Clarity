// Reports notification worker.
//
// Polls SEC EDGAR for each symbol that has at least one active
// report_subscriptions row. New filings (accession numbers not yet in
// report_filings_seen) trigger a push (and/or email) to all subscribers.
//
// On cold start we seed report_filings_seen with whatever EDGAR currently
// returns so we don't blast subscribers with the entire backlog. After the
// seed, only genuinely new filings fan out.
//
// Cadence: 1 hour, gated on REPORTS_NOTIFY_ENABLED=true. The schema is
// always created (cheap), but the worker only runs when explicitly enabled.

import { execute, query, queryOne } from "../db";
import { logger } from "./logger";
import { reportsSchemaReady } from "./reportsSchema";
import { sendExpoPush } from "./pushDelivery";
import { sendEmail, alertNotificationEmail } from "./email";
import { getCIKFromTicker, getFilings, type Filing } from "./reports";
import { storage } from "../storage";

const TICK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

function isEnabled(): boolean {
  return (process.env.REPORTS_NOTIFY_ENABLED ?? "").toLowerCase() === "true";
}

async function distinctSubscribedSymbols(): Promise<string[]> {
  const rows = await query<{ symbol: string }>(
    `SELECT DISTINCT symbol FROM report_subscriptions`,
  );
  return rows.map((r) => r.symbol);
}

async function subscribersFor(symbol: string): Promise<
  Array<{ user_id: string; delivery_channel: "push" | "email" | "both" }>
> {
  return query<{ user_id: string; delivery_channel: "push" | "email" | "both" }>(
    `SELECT user_id, delivery_channel
       FROM report_subscriptions
      WHERE symbol = $1`,
    [symbol],
  );
}

async function alreadySeen(symbol: string, accession: string): Promise<boolean> {
  const row = await queryOne<{ accession: string }>(
    `SELECT accession FROM report_filings_seen WHERE symbol = $1 AND accession = $2`,
    [symbol, accession],
  );
  return !!row;
}

async function recordSeen(symbol: string, f: Filing): Promise<void> {
  await execute(
    `INSERT INTO report_filings_seen (symbol, accession, type, filed_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (symbol, accession) DO NOTHING`,
    [symbol, f.accessionNumber, f.type, f.filedAt],
  );
}

async function isSymbolSeeded(symbol: string): Promise<boolean> {
  const row = await queryOne<{ count: string | number }>(
    `SELECT COUNT(*)::int AS count FROM report_filings_seen WHERE symbol = $1`,
    [symbol],
  );
  const n = Number(row?.count ?? 0);
  return n > 0;
}

async function pushToUser(
  userId: string,
  symbol: string,
  filing: Filing,
): Promise<void> {
  const tokens = await query<{ token: string }>(
    `SELECT token FROM expo_push_tokens WHERE user_id = $1`,
    [userId],
  );
  if (!tokens.length) return;
  const title = `${symbol} filed a new ${filing.type}`;
  const body = filing.reportDate
    ? `Period ${filing.reportDate} · filed ${filing.filedAt}`
    : `Filed ${filing.filedAt}`;
  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    sound: "default" as const,
    data: {
      kind: "report_alert",
      symbol,
      accession: filing.accessionNumber,
      type: filing.type,
    },
  }));
  await sendExpoPush(messages);
}

async function emailToUser(
  userId: string,
  symbol: string,
  filing: Filing,
): Promise<void> {
  try {
    const user = await storage.getUserByClerkId(userId);
    const to = (user as any)?.email;
    if (!to) return;
    const title = `${symbol} filed a new ${filing.type}`;
    const body = filing.reportDate
      ? `Period ending ${filing.reportDate}, filed ${filing.filedAt}. Open StockClarify to read the AI summary.`
      : `Filed ${filing.filedAt}. Open StockClarify to read the AI summary.`;
    await sendEmail(alertNotificationEmail({ to, title, body, symbol }));
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol, userId }, "report email send failed");
  }
}

async function processSymbol(symbol: string): Promise<void> {
  let filings: Filing[];
  try {
    const cik = await getCIKFromTicker(symbol);
    filings = await getFilings(cik, 20);
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol }, "reports worker: filings fetch failed");
    return;
  }
  if (!filings.length) return;

  const seeded = await isSymbolSeeded(symbol);
  if (!seeded) {
    // First-time seed: mark everything as seen without notifying. Avoids the
    // "subscribed and got 20 alerts at once" cold-start failure mode.
    for (const f of filings) await recordSeen(symbol, f);
    return;
  }

  for (const filing of filings) {
    if (await alreadySeen(symbol, filing.accessionNumber)) continue;
    await recordSeen(symbol, filing);

    const subs = await subscribersFor(symbol);
    for (const s of subs) {
      try {
        if (s.delivery_channel === "push" || s.delivery_channel === "both") {
          await pushToUser(s.user_id, symbol, filing);
        }
        if (s.delivery_channel === "email" || s.delivery_channel === "both") {
          await emailToUser(s.user_id, symbol, filing);
        }
      } catch (err: any) {
        logger.warn(
          { err: err?.message, userId: s.user_id, symbol },
          "reports worker: notify failed",
        );
      }
    }
  }
}

async function tick(): Promise<void> {
  const symbols = await distinctSubscribedSymbols();
  for (const sym of symbols) {
    await processSymbol(sym);
  }
}

let running = false;
let timer: NodeJS.Timeout | null = null;

export async function startReportsWorker(): Promise<void> {
  if (running) return;
  if (!isEnabled()) {
    logger.info(
      "Reports notification worker disabled — set REPORTS_NOTIFY_ENABLED=true to start",
    );
    return;
  }
  running = true;
  await reportsSchemaReady;
  logger.info({ intervalMs: TICK_INTERVAL_MS }, "Reports worker starting");

  const loop = async () => {
    if (!running) return;
    try {
      await tick();
    } catch (err: any) {
      logger.warn({ err: err?.message }, "Reports worker tick error");
    } finally {
      if (running) timer = setTimeout(loop, TICK_INTERVAL_MS);
    }
  };
  loop();
}

export function stopReportsWorker(): void {
  running = false;
  if (timer) clearTimeout(timer);
  timer = null;
}
