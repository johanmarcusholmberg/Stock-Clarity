import { Router } from "express";
import { execute, query, queryOne } from "../db";
import { holdingsSchemaReady } from "../lib/holdingsSchema";
import { dividendSchemaReady } from "../lib/dividendSchema";
import { computeEffectiveTier } from "../lib/tierService";
import { isProOrBetter as isProOrBetterPure } from "../lib/holdingsTier";
import { YF2, yfFetch } from "../lib/newsSources";
import { fxToUsd, newFxCache } from "../lib/fxConvert";
import { logger } from "../lib/logger";
import { computeCostBasis, type LotInput, type SaleEvent } from "../lib/costBasis";
import { requireSelf } from "../middlewares/requireSelf";

const router = Router();

const FREE_HOLDINGS_LIMIT = 5;

router.use(async (_req, _res, next) => {
  await holdingsSchemaReady;
  await dividendSchemaReady;
  next();
});

// ── Feature flag exposure for the mobile client ─────────────────────────────
// Mobile uses this to decide whether to show the Portfolio tab. Single-layer
// gate today (no per-user rollout); add a bucket helper in featureFlags.ts if
// we want a staged rollout later.
router.get("/status", (_req, res) => {
  const enabled = (process.env.HOLDINGS_ENABLED ?? "").toLowerCase() === "true";
  res.json({ enabled });
});

interface HoldingRow {
  id: string;
  user_id: string;
  ticker: string;
  currency: string;
  country: string | null;
  created_at: string;
}

interface LotRow {
  id: string;
  holding_id: string;
  qty: string;
  cost_per_share: string;
  purchased_at: string;
  currency: string;
  created_at: string;
}

function parsePositiveNumber(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parseDate(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  // Accept YYYY-MM-DD or full ISO; coerce to YYYY-MM-DD for the DATE column.
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function normalizeTicker(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const t = raw.trim().toUpperCase();
  if (!t || t.length > 20) return null;
  return t;
}

function normalizeCurrency(raw: unknown, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const c = raw.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(c)) return fallback;
  return c;
}

async function holdingsCountFor(userId: string): Promise<number> {
  const row = await queryOne<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM holdings WHERE user_id = $1",
    [userId],
  );
  return Number(row?.count ?? 0);
}

// Bind the effective-tier resolver here. The pure check lives in
// holdingsTier.ts so tests can stub the resolver without booting the tier
// service or DB.
function isProOrBetter(userId: string): Promise<boolean> {
  return isProOrBetterPure(userId, computeEffectiveTier);
}

// ── List holdings + lots for a user ────────────────────────────────────────
router.get("/:userId", requireSelf, async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  try {
    const holdings = await query<HoldingRow>(
      `SELECT id, user_id, ticker, currency, country, created_at
         FROM holdings
        WHERE user_id = $1
        ORDER BY ticker ASC`,
      [userId],
    );
    const ids = holdings.map((h) => h.id);
    const lots = ids.length
      ? await query<LotRow>(
          `SELECT id, holding_id, qty::text, cost_per_share::text,
                  to_char(purchased_at, 'YYYY-MM-DD') AS purchased_at,
                  currency, created_at
             FROM lots
            WHERE holding_id = ANY($1::uuid[])
            ORDER BY purchased_at ASC, created_at ASC`,
          [ids],
        )
      : [];
    const lotsByHolding = new Map<string, LotRow[]>();
    for (const l of lots) {
      const arr = lotsByHolding.get(l.holding_id) ?? [];
      arr.push(l);
      lotsByHolding.set(l.holding_id, arr);
    }
    const result = holdings.map((h) => ({
      ...h,
      lots: lotsByHolding.get(h.id) ?? [],
    }));
    res.json({ holdings: result });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Upcoming dividend events for the user's held tickers ────────────────────
// Returns rows from dividend_events filtered to ex_date >= today, ordered
// soonest first. No tier gate at the API level — the data is per-user-owned
// tickers; the mobile card is what wraps this in the Pro PremiumGate.
router.get("/:userId/dividends", requireSelf, async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  try {
    const rows = await query<{
      ticker: string;
      ex_date: string;
      pay_date: string | null;
      amount: string | null;
      currency: string | null;
    }>(
      `SELECT d.ticker,
              to_char(d.ex_date, 'YYYY-MM-DD') AS ex_date,
              to_char(d.pay_date, 'YYYY-MM-DD') AS pay_date,
              d.amount::text AS amount,
              d.currency
         FROM dividend_events d
         JOIN holdings h
           ON UPPER(h.ticker) = d.ticker
          AND h.user_id = $1
        WHERE d.ex_date >= CURRENT_DATE
        ORDER BY d.ex_date ASC, d.ticker ASC`,
      [userId],
    );
    res.json({ dividends: rows });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Add a holding + first lot (Free-tier capped at 5 holdings) ─────────────
router.post("/:userId", requireSelf, async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });

  const body = req.body ?? {};
  const ticker = normalizeTicker(body.ticker);
  if (!ticker) return void res.status(400).json({ error: "ticker must be a non-empty string ≤20 chars" });

  const qty = parsePositiveNumber(body.qty);
  if (qty === null) return void res.status(400).json({ error: "qty must be a positive number" });

  const costPerShare = parsePositiveNumber(body.cost_per_share);
  if (costPerShare === null) return void res.status(400).json({ error: "cost_per_share must be a positive number" });

  const purchasedAt = parseDate(body.purchased_at);
  if (!purchasedAt) return void res.status(400).json({ error: "purchased_at must be a valid date (YYYY-MM-DD)" });

  const currency = normalizeCurrency(body.currency, "USD");

  try {
    // Cap check is racy across concurrent inserts; a UNIQUE (user_id, ticker)
    // index on holdings rules out duplicate holdings, and we re-check the
    // count *after* insert for new tickers to fail fast on overflow.
    const existing = await queryOne<HoldingRow>(
      "SELECT id, user_id, ticker, currency, country, created_at FROM holdings WHERE user_id = $1 AND ticker = $2",
      [userId, ticker],
    );

    if (!existing) {
      const proPlus = await isProOrBetter(userId);
      if (!proPlus) {
        const count = await holdingsCountFor(userId);
        if (count >= FREE_HOLDINGS_LIMIT) {
          return void res
            .status(403)
            .json({ error: "holdings_limit_reached", limit: FREE_HOLDINGS_LIMIT });
        }
      }
    }

    // Upsert the holding by (user_id, ticker). currency is taken from the new
    // row only when inserting fresh — if the holding already exists we keep
    // the existing currency to avoid surprise rewrites.
    const holding = await queryOne<HoldingRow>(
      `INSERT INTO holdings (user_id, ticker, currency)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, ticker) DO UPDATE SET ticker = EXCLUDED.ticker
       RETURNING id, user_id, ticker, currency, country, created_at`,
      [userId, ticker, currency],
    );
    if (!holding) return void res.status(500).json({ error: "failed to create holding" });

    const lot = await queryOne<LotRow>(
      `INSERT INTO lots (holding_id, qty, cost_per_share, purchased_at, currency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, holding_id, qty::text, cost_per_share::text,
                 to_char(purchased_at, 'YYYY-MM-DD') AS purchased_at,
                 currency, created_at`,
      [holding.id, qty, costPerShare, purchasedAt, currency],
    );

    res.json({ holding, lot });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Add a lot to an existing holding ──────────────────────────────────────
router.post("/:userId/:holdingId/lots", requireSelf, async (req, res) => {
  const { userId, holdingId } = req.params;
  if (!userId || !holdingId) {
    return void res.status(400).json({ error: "Missing userId or holdingId" });
  }

  const body = req.body ?? {};
  const qty = parsePositiveNumber(body.qty);
  if (qty === null) return void res.status(400).json({ error: "qty must be a positive number" });

  const costPerShare = parsePositiveNumber(body.cost_per_share);
  if (costPerShare === null) return void res.status(400).json({ error: "cost_per_share must be a positive number" });

  const purchasedAt = parseDate(body.purchased_at);
  if (!purchasedAt) return void res.status(400).json({ error: "purchased_at must be a valid date (YYYY-MM-DD)" });

  try {
    // Verify holding belongs to this user before letting the lot land — a lot
    // attached to someone else's holding would leak via cascading reads.
    const owner = await queryOne<{ id: string; currency: string }>(
      "SELECT id, currency FROM holdings WHERE id = $1 AND user_id = $2",
      [holdingId, userId],
    );
    if (!owner) return void res.status(404).json({ error: "holding not found" });

    const currency = normalizeCurrency(body.currency, owner.currency);

    const lot = await queryOne<LotRow>(
      `INSERT INTO lots (holding_id, qty, cost_per_share, purchased_at, currency)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, holding_id, qty::text, cost_per_share::text,
                 to_char(purchased_at, 'YYYY-MM-DD') AS purchased_at,
                 currency, created_at`,
      [holdingId, qty, costPerShare, purchasedAt, currency],
    );
    res.json({ lot });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete holding (cascades lots) ────────────────────────────────────────
router.delete("/:userId/:holdingId", requireSelf, async (req, res) => {
  const { userId, holdingId } = req.params;
  if (!userId || !holdingId) {
    return void res.status(400).json({ error: "Missing userId or holdingId" });
  }
  try {
    const owner = await queryOne<{ id: string }>(
      "SELECT id FROM holdings WHERE id = $1 AND user_id = $2",
      [holdingId, userId],
    );
    if (!owner) return void res.status(404).json({ error: "holding not found" });
    await execute("DELETE FROM holdings WHERE id = $1", [holdingId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Delete a single lot ───────────────────────────────────────────────────
router.delete("/:userId/:holdingId/lots/:lotId", requireSelf, async (req, res) => {
  const { userId, holdingId, lotId } = req.params;
  if (!userId || !holdingId || !lotId) {
    return void res.status(400).json({ error: "Missing userId, holdingId or lotId" });
  }
  try {
    // Joined ownership check — confirms the lot belongs to a holding owned by
    // this user before the delete lands.
    const lot = await queryOne<{ id: string }>(
      `SELECT l.id
         FROM lots l
         JOIN holdings h ON h.id = l.holding_id
        WHERE l.id = $1 AND h.id = $2 AND h.user_id = $3`,
      [lotId, holdingId, userId],
    );
    if (!lot) return void res.status(404).json({ error: "lot not found" });
    await execute("DELETE FROM lots WHERE id = $1", [lotId]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── CSV export (Pro+) — one row per lot ────────────────────────────────────
// Mirrors the lot granularity tax users want for their accountant. Aggregated
// per-holding rollup can land later if asked. Tier check uses
// computeEffectiveTier (admin grants STACK on Stripe, see tierService).
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

interface QuoteSnapshot {
  price: number | null;
  currency: string | null;
}

async function fetchHoldingQuote(symbol: string): Promise<QuoteSnapshot> {
  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=5m&includePrePost=false`;
    const data = await yfFetch(url);
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return { price: null, currency: null };
    const price = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : null;
    const currency = typeof meta.currency === "string" ? meta.currency.toUpperCase() : null;
    return { price, currency };
  } catch (err: any) {
    logger.warn({ err: err?.message, symbol }, "holdings export quote fetch failed");
    return { price: null, currency: null };
  }
}

router.get("/:userId/export/csv", requireSelf, async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });

  if (!(await isProOrBetter(userId))) {
    return void res.status(403).json({ error: "pro_required" });
  }

  try {
    const rows = await query<{
      ticker: string;
      qty: string;
      cost_per_share: string;
      purchased_at: string;
      currency: string;
    }>(
      `SELECT h.ticker,
              l.qty::text AS qty,
              l.cost_per_share::text AS cost_per_share,
              to_char(l.purchased_at, 'YYYY-MM-DD') AS purchased_at,
              l.currency
         FROM holdings h
         JOIN lots l ON l.holding_id = h.id
        WHERE h.user_id = $1
        ORDER BY h.ticker ASC, l.purchased_at ASC, l.created_at ASC`,
      [userId],
    );

    // Quote every distinct ticker once. Cache survives only this request.
    const distinct = Array.from(new Set(rows.map((r) => r.ticker.toUpperCase())));
    const quoteByTicker = new Map<string, QuoteSnapshot>();
    await Promise.all(
      distinct.map(async (t) => {
        quoteByTicker.set(t, await fetchHoldingQuote(t));
      }),
    );

    const fxCache = newFxCache();
    const header = [
      "ticker",
      "qty",
      "cost_per_share",
      "purchased_at",
      "currency",
      "current_price",
      "current_value_usd",
      "unrealized_pnl",
    ];
    const lines: string[] = [header.map(csvCell).join(",")];

    for (const r of rows) {
      const tickerKey = r.ticker.toUpperCase();
      const quote = quoteByTicker.get(tickerKey) ?? { price: null, currency: null };
      const qty = Number(r.qty);
      const cost = Number(r.cost_per_share);
      const lotCurrency = r.currency || "USD";
      const fx = await fxToUsd(lotCurrency, fxCache);
      const currentPriceNative = quote.price;

      const currentValueUsd =
        currentPriceNative != null && Number.isFinite(qty)
          ? currentPriceNative * qty * fx
          : null;
      const costBasisUsd =
        Number.isFinite(qty) && Number.isFinite(cost) ? qty * cost * fx : null;
      const unrealizedPnl =
        currentValueUsd != null && costBasisUsd != null
          ? currentValueUsd - costBasisUsd
          : null;

      lines.push(
        [
          r.ticker,
          r.qty,
          r.cost_per_share,
          r.purchased_at,
          lotCurrency,
          currentPriceNative != null ? currentPriceNative.toFixed(4) : "",
          currentValueUsd != null ? currentValueUsd.toFixed(2) : "",
          unrealizedPnl != null ? unrealizedPnl.toFixed(2) : "",
        ]
          .map(csvCell)
          .join(","),
      );
    }

    const csv = lines.join("\r\n");
    const filename = `stockclarify-holdings-${new Date().toISOString().slice(0, 10)}.csv`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// ── Realized + unrealized P&L (Pro+) ──────────────────────────────────────
// Sale events have no storage yet — there's no UI for recording a sale and
// no sale_events table. Until that lands, sales: [] for every user, so
// ytdRealized and lifetimeRealized are always 0. The shape is in place so
// the response lights up the moment sale storage is added.
//
// FX policy mirrors the CSV export above: lot currency drives the FX rate
// applied to both lot cost AND current price (assumes lot.currency matches
// the quote currency, which is true when users enter lots in the stock's
// native trading currency).
router.get("/:userId/pnl", requireSelf, async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });

  if (!(await isProOrBetter(userId))) {
    return void res.status(403).json({ error: "pro_required" });
  }

  try {
    const rows = await query<{
      ticker: string;
      qty: string;
      cost_per_share: string;
      purchased_at: string;
      currency: string;
    }>(
      `SELECT h.ticker,
              l.qty::text AS qty,
              l.cost_per_share::text AS cost_per_share,
              to_char(l.purchased_at, 'YYYY-MM-DD') AS purchased_at,
              l.currency
         FROM holdings h
         JOIN lots l ON l.holding_id = h.id
        WHERE h.user_id = $1
        ORDER BY h.ticker ASC, l.purchased_at ASC, l.created_at ASC`,
      [userId],
    );

    const distinct = Array.from(new Set(rows.map((r) => r.ticker.toUpperCase())));
    const quoteByTicker = new Map<string, QuoteSnapshot>();
    await Promise.all(
      distinct.map(async (t) => {
        quoteByTicker.set(t, await fetchHoldingQuote(t));
      }),
    );

    const fxCache = newFxCache();
    const lotsByTicker = new Map<string, LotInput[]>();
    const fxByTicker = new Map<string, number>();
    for (const r of rows) {
      const ticker = r.ticker.toUpperCase();
      const lotCurrency = r.currency || "USD";
      const fx = await fxToUsd(lotCurrency, fxCache);
      fxByTicker.set(ticker, fx);
      const arr = lotsByTicker.get(ticker) ?? [];
      arr.push({
        qty: Number(r.qty),
        // Cost normalised to USD up front. The engine is FX-agnostic — this
        // matches how the CSV export does it so both stay aligned.
        cost_per_share: Number(r.cost_per_share) * fx,
        currency: "USD",
        purchased_at: r.purchased_at,
      });
      lotsByTicker.set(ticker, arr);
    }

    let unrealized = 0;
    let totalCostBasis = 0;
    const sales: SaleEvent[] = [];
    for (const [ticker, lots] of lotsByTicker) {
      const quote = quoteByTicker.get(ticker) ?? { price: null, currency: null };
      const fx = fxByTicker.get(ticker) ?? 1;
      const currentPriceUsd = quote.price != null ? quote.price * fx : null;
      const result = computeCostBasis({
        lots,
        sales,
        currentPrice: currentPriceUsd,
        method: "FIFO",
      });
      unrealized += result.unrealizedPnl;
      totalCostBasis += result.totalCostBasis;
    }

    res.json({
      ytdRealized: 0,
      lifetimeRealized: 0,
      unrealized,
      totalCostBasis,
      currency: "USD",
      method: "FIFO",
    });
  } catch (e: any) {
    logger.warn({ err: e?.message, userId }, "holdings pnl failed");
    res.status(500).json({ error: e.message });
  }
});

export default router;
