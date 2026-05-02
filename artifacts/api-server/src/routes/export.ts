import { Router } from "express";
import ExcelJS from "exceljs";
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

// ── Aggregates used in both the xlsx Summary sheet and CSV preamble ─────────
function aggregate(rows: ExportRow[]) {
  const priced = rows.filter((r) => r.price != null);
  const positive = priced.filter((r) => (r.changePercent ?? 0) > 0);
  const negative = priced.filter((r) => (r.changePercent ?? 0) < 0);
  const flat = priced.filter((r) => (r.changePercent ?? 0) === 0);
  // Top mover by abs % change (only consider rows where we have a quote)
  const sortedByAbs = [...priced].sort(
    (a, b) => Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0),
  );
  const topMover = sortedByAbs[0];
  // Distinct currencies present (we don't FX-convert in v1)
  const currencies = Array.from(new Set(priced.map((r) => r.currency).filter(Boolean)));
  return {
    totalCount: rows.length,
    pricedCount: priced.length,
    upCount: positive.length,
    downCount: negative.length,
    flatCount: flat.length,
    topMover,
    currencies,
  };
}

function safeFilename(name: string, ext: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "portfolio";
  return `stockclarify-${base}-${new Date().toISOString().slice(0, 10)}.${ext}`;
}

// ── CSV ──────────────────────────────────────────────────────────────────────

type Delimiter = "comma" | "semicolon" | "tab";

function parseDelimiter(raw: unknown): Delimiter {
  if (raw === "semicolon") return "semicolon";
  if (raw === "tab") return "tab";
  return "comma";
}

function delimiterChar(d: Delimiter): string {
  if (d === "semicolon") return ";";
  if (d === "tab") return "\t";
  return ",";
}

// Format a number for CSV output. The semicolon variant exists specifically
// for Excel locales where the comma is the decimal separator (Sweden, Germany,
// France, etc.) — emitting "1234.56" there would import as text and break
// sorting/sums. Comma/tab variants keep "." which is the universal default.
function formatNum(n: number, d: Delimiter): string {
  const s = n.toFixed(2);
  return d === "semicolon" ? s.replace(".", ",") : s;
}

function csvCell(v: unknown, delim: string): string {
  if (v == null) return "";
  const s = String(v);
  // Quote whenever the cell contains the active delimiter, a quote, or a
  // newline — the rules from RFC 4180 generalised to alternate delimiters.
  if (s.includes(delim) || s.includes('"') || /[\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
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

  const delim = parseDelimiter(req.query.delimiter);
  const sep = delimiterChar(delim);
  const agg = aggregate(data.rows);
  const generatedAt = new Date().toISOString().replace("T", " ").slice(0, 19) + " UTC";

  const cell = (v: unknown) => csvCell(v, sep);

  // Preamble — small metadata block followed by a blank line so Excel still
  // parses the data table cleanly. Each preamble row is a single quoted cell
  // so it spans only column A, regardless of delimiter.
  const lines: string[] = [];
  lines.push(cell(`StockClarify — ${data.name}`));
  lines.push(cell(`Generated: ${generatedAt}`));
  lines.push(cell(`Holdings: ${agg.totalCount} (${agg.upCount} up, ${agg.downCount} down, ${agg.flatCount} flat)`));
  lines.push(cell(`Source: Yahoo Finance`));
  lines.push("");

  const header = [
    "Ticker",
    "Name",
    "Sector",
    "Exchange",
    "Currency",
    "Price",
    "Day Change",
    "Day Change %",
  ];
  lines.push(header.map(cell).join(sep));

  for (const r of data.rows) {
    lines.push(
      [
        r.ticker,
        r.name,
        r.sector,
        r.exchange,
        r.currency,
        r.price != null ? formatNum(r.price, delim) : "",
        r.change != null ? formatNum(r.change, delim) : "",
        r.changePercent != null ? formatNum(r.changePercent, delim) : "",
      ]
        .map(cell)
        .join(sep),
    );
  }

  // \r\n line endings + UTF-8 BOM are what Excel (Windows + Mac) auto-detects
  // to preserve non-ASCII characters in tickers/company names (e.g. "Café",
  // "Atos SE", "Ørsted A/S"). Without the BOM, Excel mis-decodes as Latin-1.
  const csv = "\ufeff" + lines.join("\r\n") + "\r\n";

  const ext = delim === "tab" ? "tsv" : "csv";
  const mime = delim === "tab" ? "text/tab-separated-values" : "text/csv";
  const filename = safeFilename(data.name, ext);
  res.setHeader("Content-Type", `${mime}; charset=utf-8`);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
});

// ── XLSX (Excel workbook) ────────────────────────────────────────────────────
// Two sheets: Holdings (formatted table with conditional colors and totals),
// Summary (portfolio-level stats). This is what most users actually want when
// they ask to "export to Excel" — the CSV path is for power users and locale-
// specific Excel setups.

router.get("/portfolio.xlsx", async (req, res) => {
  const userId = typeof req.query.userId === "string" ? req.query.userId : "";
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  if (!(await requirePremium(userId))) {
    return void res.status(402).json({ error: "Premium subscription required" });
  }
  const data = await buildExport(userId, folderId);
  if (!data) return void res.status(404).json({ error: "Watchlist not found" });

  const agg = aggregate(data.rows);
  const generatedAt = new Date();

  const wb = new ExcelJS.Workbook();
  wb.creator = "StockClarify";
  wb.created = generatedAt;

  // ── Holdings sheet ────────────────────────────────────────────────────────
  const holdings = wb.addWorksheet("Holdings", {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  holdings.columns = [
    { header: "Ticker", key: "ticker", width: 12 },
    { header: "Name", key: "name", width: 32 },
    { header: "Exchange", key: "exchange", width: 22 },
    { header: "Currency", key: "currency", width: 10 },
    { header: "Price", key: "price", width: 14, style: { numFmt: "#,##0.00" } },
    { header: "Day Change", key: "change", width: 14, style: { numFmt: "+#,##0.00;-#,##0.00;0.00" } },
    { header: "Day Change %", key: "changePct", width: 14, style: { numFmt: "+0.00%;-0.00%;0.00%" } },
  ];

  // Header row styling
  const headerRow = holdings.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 22;
  headerRow.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
  });

  for (const r of data.rows) {
    const row = holdings.addRow({
      ticker: r.ticker,
      name: r.name,
      exchange: r.exchange,
      currency: r.currency,
      price: r.price ?? null,
      change: r.change ?? null,
      // Excel percent format expects fractional values (0.012 → 1.20%).
      changePct: r.changePercent != null ? r.changePercent / 100 : null,
    });
    // Color the change columns by sign (green/red) to match the in-app palette.
    const pct = r.changePercent ?? 0;
    if (r.changePercent != null && pct !== 0) {
      const argb = pct > 0 ? "FF0A8C63" : "FFDC2030";
      row.getCell("change").font = { color: { argb }, bold: true };
      row.getCell("changePct").font = { color: { argb }, bold: true };
    }
    row.getCell("ticker").font = { bold: true };
  }

  // Auto-filter on the header row so users can sort/filter immediately.
  if (data.rows.length > 0) {
    holdings.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: data.rows.length + 1, column: 7 },
    };
  }

  // ── Summary sheet ─────────────────────────────────────────────────────────
  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Metric", key: "metric", width: 28 },
    { header: "Value", key: "value", width: 40 },
  ];
  const sHeader = summary.getRow(1);
  sHeader.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  sHeader.alignment = { vertical: "middle" };
  sHeader.height = 22;
  sHeader.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0F172A" },
    };
  });

  const summaryRows: Array<[string, string | number]> = [
    ["Portfolio", data.name],
    ["Generated", generatedAt.toISOString().replace("T", " ").slice(0, 19) + " UTC"],
    ["Source", "Yahoo Finance (delayed quotes)"],
    ["Holdings (total)", agg.totalCount],
    ["Holdings (priced)", agg.pricedCount],
    ["Up today", agg.upCount],
    ["Down today", agg.downCount],
    ["Unchanged", agg.flatCount],
    [
      "Top mover today",
      agg.topMover && agg.topMover.changePercent != null
        ? `${agg.topMover.ticker} (${agg.topMover.changePercent >= 0 ? "+" : ""}${agg.topMover.changePercent.toFixed(2)}%)`
        : "—",
    ],
    ["Currencies present", agg.currencies.join(", ") || "—"],
  ];
  for (const [metric, value] of summaryRows) {
    const row = summary.addRow({ metric, value });
    row.getCell("metric").font = { bold: true };
  }

  // Notes footer — explains what the export does NOT include, so users don't
  // misread it as a complete tax-grade record.
  summary.addRow([]);
  const noteRow = summary.addRow(["Notes", "Quotes are end-of-day or last available from Yahoo Finance. Currencies are not FX-converted. Cost basis and lots are not included in this export."]);
  noteRow.getCell(1).font = { bold: true, italic: true };
  noteRow.getCell(2).alignment = { wrapText: true, vertical: "top" };
  noteRow.height = 48;

  const filename = safeFilename(data.name, "xlsx");
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  );
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  const buffer = await wb.xlsx.writeBuffer();
  res.send(Buffer.from(buffer));
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
