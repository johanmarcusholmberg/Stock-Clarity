import { Router } from "express";
import { execute, query, queryOne } from "../db";
import { holdingsSchemaReady } from "../lib/holdingsSchema";
import { computeEffectiveTier } from "../lib/tierService";

const router = Router();

const FREE_HOLDINGS_LIMIT = 5;

router.use(async (_req, _res, next) => {
  await holdingsSchemaReady;
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

async function isProOrBetter(userId: string): Promise<boolean> {
  const eff = await computeEffectiveTier(userId);
  return eff.tier === "pro" || eff.tier === "premium";
}

// ── List holdings + lots for a user ────────────────────────────────────────
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return void res.status(400).json({ error: "Missing userId" });
  try {
    const holdings = await query<HoldingRow>(
      `SELECT id, user_id, ticker, currency, created_at
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

// ── Add a holding + first lot (Free-tier capped at 5 holdings) ─────────────
router.post("/:userId", async (req, res) => {
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
      "SELECT id, user_id, ticker, currency, created_at FROM holdings WHERE user_id = $1 AND ticker = $2",
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
       RETURNING id, user_id, ticker, currency, created_at`,
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
router.post("/:userId/:holdingId/lots", async (req, res) => {
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
router.delete("/:userId/:holdingId", async (req, res) => {
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
router.delete("/:userId/:holdingId/lots/:lotId", async (req, res) => {
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

export default router;
