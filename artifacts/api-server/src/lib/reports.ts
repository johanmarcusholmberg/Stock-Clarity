// SEC EDGAR + Anthropic-powered quarterly/annual report summaries.
//
// Server-side only — EDGAR rejects browser requests without a User-Agent and
// the Anthropic key must never reach the mobile bundle. The route handler in
// routes/reports.ts wraps these helpers behind /api/reports.
//
// EDGAR ticker map and submissions are slow-changing — both are cached in
// process memory so a warm server hits SEC at most once per ticker per restart.

const SEC_USER_AGENT = "StockClarity contact@stockclarity.app";

const EDGAR_BASE_HEADERS: Record<string, string> = {
  "User-Agent": SEC_USER_AGENT,
  Accept: "application/json, text/html, */*",
  "Accept-Encoding": "gzip, deflate",
};

// SEC allows 10 req/sec; 500 ms between requests stays well within that limit.
const EDGAR_DELAY_MS = 500;
let lastEdgarRequestAt = 0;

async function edgarFetch(url: string): Promise<Response> {
  const now = Date.now();
  const wait = EDGAR_DELAY_MS - (now - lastEdgarRequestAt);
  if (wait > 0) await new Promise<void>((r) => setTimeout(r, wait));
  lastEdgarRequestAt = Date.now();
  try {
    return await fetch(url, { headers: EDGAR_BASE_HEADERS });
  } catch (err) {
    throw new Error(
      `EDGAR network error for ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export type FilingType = "10-K" | "10-Q";

export interface Filing {
  type: FilingType;
  filedAt: string;
  reportDate: string;
  accessionNumber: string;
  edgarUrl: string;
}

export interface ReportSummary {
  headline: string;
  period: string;
  highlights: string[];
  sentiment: "positive" | "neutral" | "negative";
  keyMetrics: {
    revenue: string | null;
    netIncome: string | null;
    eps: string | null;
    operatingCashFlow: string | null;
  };
  analystNote: string;
}

interface TickerEntry {
  cik_str: number;
  ticker: string;
  title: string;
}

let tickerMapCache: Map<string, string> | null = null;
let tickerMapPromise: Promise<Map<string, string>> | null = null;

const filingsCache = new Map<string, { filings: Filing[]; expiresAt: number }>();
const FILINGS_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const summaryCache = new Map<string, ReportSummary>();

async function loadTickerMap(): Promise<Map<string, string>> {
  if (tickerMapCache) return tickerMapCache;
  if (tickerMapPromise) return tickerMapPromise;

  tickerMapPromise = (async () => {
    const res = await edgarFetch("https://www.sec.gov/files/company_tickers.json");
    if (!res.ok) {
      throw new Error(`SEC ticker map fetch failed: ${res.status}`);
    }
    const data = (await res.json()) as Record<string, TickerEntry>;
    const map = new Map<string, string>();
    for (const entry of Object.values(data)) {
      const padded = String(entry.cik_str).padStart(10, "0");
      map.set(entry.ticker.toUpperCase(), padded);
    }
    tickerMapCache = map;
    return map;
  })();

  try {
    return await tickerMapPromise;
  } catch (err) {
    tickerMapPromise = null;
    throw err;
  }
}

export async function getCIKFromTicker(ticker: string): Promise<string> {
  const map = await loadTickerMap();
  const cik = map.get(ticker.toUpperCase());
  if (!cik) throw new Error(`Unknown ticker: ${ticker}`);
  return cik;
}

export async function getFilings(cik: string, limit = 8): Promise<Filing[]> {
  const cached = filingsCache.get(cik);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.filings.slice(0, limit);
  }

  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const res = await edgarFetch(url);
  if (!res.ok) {
    throw new Error(`SEC submissions fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as {
    cik?: string | number;
    filings?: { recent?: {
      form?: string[];
      filingDate?: string[];
      reportDate?: string[];
      accessionNumber?: string[];
    } };
  };

  const recent = data.filings?.recent;
  if (!recent || !recent.form || !recent.accessionNumber) return [];

  const numericCik = String(data.cik ?? cik).replace(/^0+/, "");
  const filings: Filing[] = [];
  for (let i = 0; i < recent.form.length; i++) {
    const form = recent.form[i];
    if (form !== "10-K" && form !== "10-Q") continue;
    const accessionNumber = recent.accessionNumber[i] ?? "";
    if (!accessionNumber) continue;
    filings.push({
      type: form as FilingType,
      filedAt: recent.filingDate?.[i] ?? "",
      reportDate: recent.reportDate?.[i] ?? "",
      accessionNumber,
      edgarUrl: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${numericCik}&type=${form}&dateb=&owner=include&count=40`,
    });
  }

  filingsCache.set(cik, {
    filings,
    expiresAt: Date.now() + FILINGS_CACHE_TTL_MS,
  });

  return filings.slice(0, limit);
}

export async function getFilingText(
  cik: string,
  accessionNumber: string,
): Promise<string> {
  const parsedCik = cik.replace(/^0+/, "");
  const accNoDashes = accessionNumber.replace(/-/g, "");
  // www.sec.gov serves the Archives; data.sec.gov is for the submissions API only.
  // The index JSON for a filing lives at .../index.json (no accession in the filename).
  const indexUrl = `https://www.sec.gov/Archives/edgar/data/${parsedCik}/${accNoDashes}/index.json`;

  const indexRes = await edgarFetch(indexUrl);
  if (!indexRes.ok) {
    throw new Error(`SEC filing index fetch failed: ${indexRes.status}`);
  }
  const indexData = (await indexRes.json()) as {
    directory?: { item?: Array<{ name: string; type: string }> };
  };
  const items = indexData.directory?.item ?? [];

  // The `type` field in the directory JSON is an icon hint (e.g. "text.gif"), not the
  // form type. Find the primary document by name: prefer ticker-date.htm style names,
  // and fall back to any .htm that isn't an index page, inline-XBRL R-file, or exhibit.
  const primary = items.find((it) => /\.html?$/i.test(it.name) && !/index|^R\d|exhibit/i.test(it.name));

  if (!primary) {
    throw new Error("No primary document found in filing");
  }

  const docUrl = `https://www.sec.gov/Archives/edgar/data/${parsedCik}/${accNoDashes}/${primary.name}`;
  const docRes = await edgarFetch(docUrl);
  if (!docRes.ok) {
    throw new Error(`SEC primary document fetch failed: ${docRes.status}`);
  }
  const html = await docRes.text();
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped.slice(0, 6000);
}

const SUMMARY_SYSTEM_PROMPT = `You are a senior equity analyst. Read the SEC filing text and return ONLY a valid JSON object — no markdown, no backticks — with this exact shape:
{
  "headline": "<one punchy sentence capturing the key takeaway>",
  "period": "<e.g. Q3 2024 or FY 2023>",
  "highlights": [
    "<revenue / top-line>",
    "<profit / margins>",
    "<guidance or outlook>",
    "<notable risk or event>"
  ],
  "sentiment": "positive" | "neutral" | "negative",
  "keyMetrics": {
    "revenue": "<e.g. $12.4B (+8% YoY) or null>",
    "netIncome": "<string or null>",
    "eps": "<string or null>",
    "operatingCashFlow": "<string or null>"
  },
  "analystNote": "<2-3 sentences of deeper insight>"
}
Never invent numbers not present in the source. Keep highlights under 15 words each.`;

export async function summarizeReport(
  rawText: string,
  ticker: string,
  reportType: string,
  accessionNumber?: string,
): Promise<ReportSummary> {
  const cacheKey = accessionNumber
    ? `${ticker}:${accessionNumber}`
    : `${ticker}:${reportType}:${rawText.slice(0, 64)}`;
  const cached = summaryCache.get(cacheKey);
  if (cached) return cached;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: SUMMARY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Summarize this ${reportType} filing for ${ticker}:\n\n${rawText}`,
        },
      ],
    }),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`Anthropic API error ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ text?: string }>;
  };
  const text = data.content?.[0]?.text ?? "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Anthropic response did not contain JSON");
  }

  let parsed: ReportSummary;
  try {
    parsed = JSON.parse(jsonMatch[0]) as ReportSummary;
  } catch {
    throw new Error("Failed to parse Anthropic JSON response");
  }

  summaryCache.set(cacheKey, parsed);
  return parsed;
}
