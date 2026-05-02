import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import {
  getCIKFromTicker,
  getFilings,
  getFilingText,
  getPersistedSummary,
  savePersistedSummary,
  summarizeReport,
} from "../lib/reports";
import { computeEffectiveTier } from "../lib/tierService";
import { execute, query, queryOne } from "../db";
import { reportsSchemaReady } from "../lib/reportsSchema";

const router = Router();

router.use(async (_req, _res, next) => {
  await reportsSchemaReady;
  next();
});

// Auth helper. Verifies the caller is a signed-in Clerk user AND that the
// `userId` they're targeting (path param or query param) belongs to them.
// This closes IDOR / premium-bypass holes — without this check anyone could
// pass `?userId=<premium_user>` to trigger paid generation, or list / mutate
// another user's report subscriptions.
function requireSelf(req: Request, res: Response, targetUserId: string): boolean {
  const auth = getAuth(req);
  const callerId = auth?.userId;
  if (!callerId) {
    res.status(401).json({ error: "unauthenticated" });
    return false;
  }
  if (callerId !== targetUserId) {
    res.status(403).json({ error: "forbidden" });
    return false;
  }
  return true;
}

// ── Filings list / text / summary ────────────────────────────────────────────
router.get("/", async (req, res) => {
  const ticker = (req.query.ticker as string) ?? "";
  const action = (req.query.action as string) ?? "filings";

  if (!ticker) {
    res.status(400).json({ error: "Missing required query parameter: ticker" });
    return;
  }

  try {
    if (action === "filings") {
      const cik = await getCIKFromTicker(ticker);
      const filings = await getFilings(cik);
      res.json({ ticker, cik, filings });
      return;
    }

    if (action === "text") {
      const accession = (req.query.accession as string) ?? "";
      if (!accession) {
        res.status(400).json({ error: "Missing required query parameter: accession" });
        return;
      }
      const cik = await getCIKFromTicker(ticker);
      const rawText = await getFilingText(cik, accession);
      res.json({ ticker, accession, rawText });
      return;
    }

    if (action === "summary") {
      const accession = (req.query.accession as string) ?? "";
      if (!accession) {
        res.status(400).json({ error: "Missing required query parameter: accession" });
        return;
      }
      const userId = (req.query.userId as string) ?? "";

      // Premium-only gate. Free / Pro see a paywall in the UI; the server
      // refuses cold so a missing client-side check can't leak summaries.
      // We honour the persisted cache for everyone (cheap read), but the
      // generation step (expensive Anthropic call) is premium-only.
      const cached = await getPersistedSummary(ticker, accession);
      if (cached) {
        res.json(cached);
        return;
      }

      if (!userId) {
        res
          .status(401)
          .json({ error: "userId is required to generate AI summaries" });
        return;
      }
      // Verify the userId in the query belongs to the authenticated caller.
      // Without this an attacker could pass any premium user's id to trigger
      // a paid generation on their behalf.
      if (!requireSelf(req, res, userId)) return;
      const tierInfo = await computeEffectiveTier(userId);
      if (tierInfo.tier !== "premium") {
        res
          .status(402)
          .json({ error: "premium_required", tier: tierInfo.tier });
        return;
      }

      const cik = await getCIKFromTicker(ticker);
      const filings = await getFilings(cik);
      const filing = filings.find((f) => f.accessionNumber === accession);
      if (!filing) {
        res.status(404).json({ error: `Filing ${accession} not found for ${ticker}` });
        return;
      }
      const rawText = await getFilingText(cik, accession);
      const summary = await summarizeReport(rawText, ticker, filing.type);
      const response = {
        ticker: ticker.toUpperCase(),
        accession,
        type: filing.type,
        filing,
        summary,
      };
      await savePersistedSummary(response);
      res.json(response);
      return;
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    req.log.error({ err: message }, "[reports] handler error");
    const status = /Unknown ticker/i.test(message)
      ? 404
      : /ANTHROPIC_API_KEY/i.test(message)
        ? 503
        : 500;
    res.status(status).json({ error: message });
  }
});

// ── Report subscriptions (notify on new 10-K / 10-Q) ────────────────────────
router.get("/subscriptions/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  if (!requireSelf(req, res, userId)) return;
  try {
    const rows = await query<{
      id: string;
      symbol: string;
      delivery_channel: string;
    }>(
      `SELECT id, symbol, delivery_channel
         FROM report_subscriptions
        WHERE user_id = $1
        ORDER BY symbol ASC`,
      [userId],
    );
    res.json({ subscriptions: rows });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

router.get("/subscriptions/:userId/:symbol", async (req, res) => {
  const { userId, symbol } = req.params;
  if (!userId || !symbol) return void res.status(400).json({ error: "Missing params" });
  if (!requireSelf(req, res, userId)) return;
  try {
    const row = await queryOne<{ id: string; delivery_channel: string }>(
      `SELECT id, delivery_channel FROM report_subscriptions
        WHERE user_id = $1 AND symbol = $2`,
      [userId, symbol.toUpperCase()],
    );
    res.json({ subscribed: !!row, subscription: row ?? null });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

router.post("/subscriptions/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  if (!requireSelf(req, res, userId)) return;
  const body = req.body ?? {};
  const symbol = typeof body.symbol === "string" ? body.symbol.toUpperCase() : "";
  const channel = typeof body.channel === "string" ? body.channel : "push";
  if (!symbol) return void res.status(400).json({ error: "Missing symbol" });
  if (!["push", "email", "both"].includes(channel)) {
    return void res.status(400).json({ error: "channel must be push|email|both" });
  }
  try {
    await execute(
      `INSERT INTO report_subscriptions (user_id, symbol, delivery_channel)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, symbol) DO UPDATE SET delivery_channel = EXCLUDED.delivery_channel`,
      [userId, symbol, channel],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

router.delete("/subscriptions/:userId/:symbol", async (req, res) => {
  const { userId, symbol } = req.params;
  if (!userId || !symbol) return void res.status(400).json({ error: "Missing params" });
  if (!requireSelf(req, res, userId)) return;
  try {
    await execute(
      `DELETE FROM report_subscriptions WHERE user_id = $1 AND symbol = $2`,
      [userId, symbol.toUpperCase()],
    );
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err?.message ?? "internal_error" });
  }
});

export default router;
