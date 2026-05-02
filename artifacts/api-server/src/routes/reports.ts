import { Router } from "express";
import {
  getCIKFromTicker,
  getFilings,
  getFilingText,
  getPersistedSummary,
  isLikelyUSTicker,
  nonUSExchangeMessage,
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

// NOTE on auth: this route trusts `userId` from the path/query, matching the
// pattern used by every other userId-bearing endpoint in this server (alerts,
// notify, watchlist, holdings, etc). The mobile client does not currently
// send Clerk session tokens on data fetches; introducing token verification
// here only would break the feature without improving the overall posture.
// Hardening should be done as a cross-cutting pass that adds Clerk tokens to
// the mobile fetch layer and `requireSelf`-style checks across all routes.

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
      // SEC EDGAR only covers US-listed companies. Detect tickers with a
      // foreign-exchange suffix (e.g. VOLV-B.ST, ULVR.L, SAP.DE, RY.TO)
      // and respond with a structured "unsupported" payload so the mobile
      // UI can render a friendly message instead of an error toast.
      if (!isLikelyUSTicker(ticker)) {
        res.json({
          ticker,
          cik: null,
          filings: [],
          unsupported: true,
          message: nonUSExchangeMessage(ticker),
        });
        return;
      }
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
