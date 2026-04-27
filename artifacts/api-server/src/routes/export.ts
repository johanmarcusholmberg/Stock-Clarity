import { Router } from "express";
import { queryOne } from "../db";
import { computeEffectiveTier } from "../lib/tierService";

const router = Router();

// Tier gate — Export is a Premium feature. We verify server-side so a
// determined user who discovers the URL still can't bypass the paywall.
// Uses computeEffectiveTier so admin-granted Premium (which stacks on top
// of Stripe) sees the export, matching how the holdings routes gate access.
async function requirePremium(userId: string): Promise<boolean> {
  if (!userId) return false;
  try {
    const eff = await computeEffectiveTier(userId);
    return eff.tier === "premium";
  } catch {
    return false;
  }
}

// ── Portfolio reconstruction ─────────────────────────────────────────────────
// Reads the user's saved watchlist folders from the DB, then fetches current
// Yahoo quotes for the union of tickers. This keeps the export fully server-
// side (no client-side payload needed).

interface ExportRow {
  ticker: string;
  name: string;
  sector: string;
  exchange: string;
  currency: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
}

const YF2 = "https://query2.finance.yahoo.com";
const YF_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
};

async function fetchRow(ticker: string): Promise<ExportRow> {
  const empty: ExportRow = {
    ticker,
    name: ticker,
    sector: "",
    exchange: "",
    currency: "",
    price: null,
    change: null,
    changePercent: null,
  };
  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(ticker)}?range=1d&interval=5m`;
    const res = await fetch(url, { headers: YF_HEADERS, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return empty;
    const data = (await res.json()) as { chart?: { result?: Array<{ meta?: any }> } };
    const meta = data?.chart?.result?.[0]?.meta ?? {};
    const price = Number(meta.regularMarketPrice);
    const prev = Number(meta.chartPreviousClose);
    const change = Number.isFinite(price) && Number.isFinite(prev) ? price - prev : null;
    const changePct = Number.isFinite(change) && prev > 0 ? (change! / prev) * 100 : null;
    return {
      ticker,
      name: meta.longName || meta.shortName || ticker,
      sector: "",
      exchange: meta.fullExchangeName || meta.exchangeName || "",
      currency: meta.currency || "",
      price: Number.isFinite(price) ? price : null,
      change,
      changePercent: changePct,
    };
  } catch {
    return empty;
  }
}

async function buildExport(userId: string, folderId?: string): Promise<{ name: string; rows: ExportRow[] } | null> {
  const user = await queryOne<any>(
    "SELECT watchlist_data, display_name FROM users WHERE clerk_user_id = $1",
    [userId],
  );
  const folders: Array<{ id: string; name: string; tickers: string[] }> = Array.isArray(user?.watchlist_data)
    ? user.watchlist_data
    : [];
  if (!folders.length) return { name: "Portfolio", rows: [] };

  const activeFolder =
    (folderId ? folders.find((f) => f.id === folderId) : undefined) ?? folders[0];
  const rows = await Promise.all(activeFolder.tickers.map((t) => fetchRow(t)));
  return { name: activeFolder.name, rows };
}

// ── CSV ──────────────────────────────────────────────────────────────────────
function csvCell(v: unknown): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

router.get("/portfolio.csv", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "";
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  if (!(await requirePremium(userId))) {
    return void res.status(402).json({ error: "Premium subscription required" });
  }
  const data = await buildExport(userId, folderId);
  if (!data) return void res.status(404).json({ error: "Watchlist not found" });

  const header = ["Ticker", "Name", "Sector", "Exchange", "Currency", "Price", "Day change", "Day change %"];
  const lines = [header.map(csvCell).join(",")];
  for (const r of data.rows) {
    lines.push(
      [
        r.ticker,
        r.name,
        r.sector,
        r.exchange,
        r.currency,
        r.price ?? "",
        r.change != null ? r.change.toFixed(2) : "",
        r.changePercent != null ? r.changePercent.toFixed(2) : "",
      ]
        .map(csvCell)
        .join(","),
    );
  }
  const csv = lines.join("\r\n");
  const filename = `stockclarify-${data.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── Printable HTML report ────────────────────────────────────────────────────
function escapeHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

router.get("/portfolio.html", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "";
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  if (!(await requirePremium(userId))) {
    return void res.status(402).send("<h1>Premium subscription required</h1>");
  }
  const data = await buildExport(userId, folderId);
  if (!data) return void res.status(404).send("<h1>Watchlist not found</h1>");

  const now = new Date().toLocaleString();
  const rowsHtml = data.rows
    .map((r) => {
      const pct = r.changePercent ?? 0;
      const cls = pct >= 0 ? "pos" : "neg";
      const pctText = r.changePercent != null ? `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%` : "";
      return `
        <tr>
          <td><strong>${escapeHtml(r.ticker)}</strong></td>
          <td>${escapeHtml(r.name)}</td>
          <td>${escapeHtml(r.exchange)}</td>
          <td class="num">${r.price != null ? r.price.toFixed(2) : ""} ${escapeHtml(r.currency)}</td>
          <td class="num ${cls}">${pctText}</td>
        </tr>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(data.name)} — StockClarify</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    :root { color-scheme: light; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; background: #fff; }
    body { margin: 0; padding: 32px; max-width: 960px; margin-inline: auto; }
    header { border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    .meta { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { text-align: left; padding: 10px 12px; font-size: 13px; }
    thead th { border-bottom: 2px solid #0f172a; font-weight: 700; }
    tbody tr { border-bottom: 1px solid #e2e8f0; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .pos { color: #16a34a; }
    .neg { color: #dc2626; }
    .cta { display: inline-block; margin-top: 16px; padding: 8px 14px; background: #0f172a; color: #fff; border-radius: 6px; font-size: 12px; text-decoration: none; }
    footer { margin-top: 28px; font-size: 11px; color: #94a3b8; }
    @media print { body { padding: 0; } .cta { display: none; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(data.name)}</h1>
    <div class="meta">Snapshot generated ${escapeHtml(now)} — StockClarify</div>
    <a href="javascript:window.print()" class="cta">Save as PDF</a>
  </header>
  <table>
    <thead>
      <tr>
        <th>Ticker</th>
        <th>Name</th>
        <th>Exchange</th>
        <th class="num">Price</th>
        <th class="num">Day Δ</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
    </tbody>
  </table>
  <footer>Generated by StockClarify. Data sourced from Yahoo Finance at export time.</footer>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

export default router;
