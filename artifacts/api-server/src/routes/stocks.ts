import { Router } from "express";
import OpenAI from "openai";

const router = Router();

const YF1 = "https://query1.finance.yahoo.com";
const YF2 = "https://query2.finance.yahoo.com";

const BASE_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
};

const openai = new OpenAI({
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
});

// ─── Cache ────────────────────────────────────────────────────────────────────
interface CacheEntry<T> { data: T; expiresAt: number; }
const cache = new Map<string, CacheEntry<any>>();

function getFromCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) { cache.delete(key); return null; }
  return entry.data as T;
}
function setInCache<T>(key: string, data: T, ttlMs: number) {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs });
}

// ─── Yahoo Finance Auth (crumb + cookie) ──────────────────────────────────────
let yfCrumb: string | null = null;
let yfCookie: string | null = null;
let yfAuthExpires = 0;

async function refreshYFAuth(): Promise<boolean> {
  try {
    // Step 1: Get session cookie from Yahoo Finance
    const sessionRes = await fetch("https://fc.yahoo.com", {
      headers: BASE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const setCookieHeader = sessionRes.headers.get("set-cookie");
    if (!setCookieHeader) return false;

    // Extract the A3 or B cookie
    const cookies = setCookieHeader.split(",").map((c) => c.trim().split(";")[0]).join("; ");
    yfCookie = cookies;

    // Step 2: Get crumb using the cookie
    const crumbRes = await fetch(`${YF1}/v1/test/getcrumb`, {
      headers: { ...BASE_HEADERS, Cookie: yfCookie },
      signal: AbortSignal.timeout(8000),
    });

    if (!crumbRes.ok) return false;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("<") || crumb.length < 5) return false;

    yfCrumb = crumb.trim();
    yfAuthExpires = Date.now() + 60 * 60 * 1000; // 1 hour
    console.log("[yfAuth] Got crumb:", yfCrumb.slice(0, 8) + "...");
    return true;
  } catch (err: any) {
    console.error("[yfAuth] Failed:", err.message);
    return false;
  }
}

async function getYFHeaders(): Promise<Record<string, string>> {
  if (!yfCrumb || Date.now() > yfAuthExpires) {
    await refreshYFAuth();
  }
  const headers = { ...BASE_HEADERS };
  if (yfCookie) headers["Cookie"] = yfCookie;
  return headers;
}

function addCrumb(url: string): string {
  if (!yfCrumb) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}crumb=${encodeURIComponent(yfCrumb)}`;
}

// ─── Robust Fetch ─────────────────────────────────────────────────────────────
async function yfFetch(url: string, timeoutMs = 12000): Promise<any> {
  const headers = await getYFHeaders();
  const fullUrl = addCrumb(url);

  const res = await fetch(fullUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });

  if (res.status === 429) {
    console.error("[yfFetch] 429 rate limited:", url.split("?")[0]);
    // Clear auth and retry after pause
    yfCrumb = null;
    yfCookie = null;
    await new Promise((r) => setTimeout(r, 4000));
    const newHeaders = await getYFHeaders();
    const retryRes = await fetch(addCrumb(url), { headers: newHeaders, signal: AbortSignal.timeout(timeoutMs) });
    if (!retryRes.ok) throw new Error(`YF ${retryRes.status} after retry`);
    return retryRes.json();
  }

  if (!res.ok) throw new Error(`YF ${res.status}: ${url.split("?")[0]}`);
  return res.json();
}

// ─── Single Quote via Chart ───────────────────────────────────────────────────
async function fetchQuoteViaChart(symbol: string): Promise<any | null> {
  const cacheKey = `quote:${symbol}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(symbol)}?range=2d&interval=1d&includePrePost=false`;
    const data = await yfFetch(url);
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];
    const validCloses = closes.filter((c: any) => c != null && !isNaN(c)) as number[];
    const prevClose = meta.chartPreviousClose ?? (validCloses.length > 1 ? validCloses[validCloses.length - 2] : null);
    const currentPrice = meta.regularMarketPrice ?? validCloses.at(-1) ?? null;

    if (!currentPrice) return null;

    const change = prevClose ? currentPrice - prevClose : 0;
    const changePercent = prevClose ? (change / prevClose) * 100 : 0;

    const quote = {
      symbol: meta.symbol,
      shortName: meta.shortName || symbol,
      longName: meta.longName || meta.shortName || symbol,
      regularMarketPrice: currentPrice,
      regularMarketChange: change,
      regularMarketChangePercent: changePercent,
      currency: meta.currency ?? "USD",
      fullExchangeName: meta.fullExchangeName || meta.exchangeName || "",
      marketCap: null,
      sector: null,
      regularMarketVolume: meta.regularMarketVolume ?? null,
      fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
      fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
      trailingPE: null,
    };

    setInCache(cacheKey, quote, 5 * 60 * 1000);
    return quote;
  } catch (err: any) {
    console.error(`[fetchQuote] ${symbol}:`, err.message);
    return null;
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────
router.get("/search", async (req, res) => {
  const q = req.query.q as string;
  if (!q || q.length < 1) return void res.json({ quotes: [] });

  const cacheKey = `search:${q.toLowerCase()}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return void res.json({ quotes: cached });

  try {
    const url = `${YF1}/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=20&newsCount=0&enableFuzzyQuery=true`;
    const data = await yfFetch(url);
    const rawQuotes: any[] = data?.quotes ?? [];

    const quotes = rawQuotes.map((q: any) => ({
      symbol: q.symbol,
      shortName: q.shortname || q.shortName || q.longname || q.longName || q.symbol,
      longName: q.longname || q.longName || q.shortname || q.shortName || q.symbol,
      exchange: q.exchange || "",
      exchDisp: q.exchDisp || q.exchange || "",
      type: q.quoteType || "EQUITY",
      sector: q.sector || q.sectorDisp || "",
      industry: q.industry || q.industryDisp || "",
    }));

    setInCache(cacheKey, quotes, 10 * 60 * 1000);
    res.json({ quotes });
  } catch (err) {
    res.status(500).json({ quotes: [], error: "Search failed" });
  }
});

// ─── Quotes ───────────────────────────────────────────────────────────────────
router.get("/quote", async (req, res) => {
  const symbols = (req.query.symbols as string) ?? "";
  if (!symbols) return void res.json({ result: [] });

  const symbolList = symbols.split(",").map((s) => s.trim()).filter(Boolean);

  try {
    const result: any[] = [];
    for (const sym of symbolList) {
      const q = await fetchQuoteViaChart(sym);
      if (q) result.push(q);
      // Small sequential delay to avoid rate limiting
      if (symbolList.length > 1) await new Promise((r) => setTimeout(r, 150));
    }
    res.json({ result });
  } catch {
    res.status(500).json({ result: [], error: "Quotes failed" });
  }
});

// ─── Chart ────────────────────────────────────────────────────────────────────
router.get("/chart/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const range = (req.query.range as string) || "1mo";
  const interval = (req.query.interval as string) || "1d";

  const cacheKey = `chart:${symbol}:${range}:${interval}`;
  const cached = getFromCache<any>(cacheKey);
  if (cached) return void res.json(cached);

  try {
    const url = `${YF2}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
    const data = await yfFetch(url, 15000);

    const result = data?.chart?.result?.[0];
    if (!result) return void res.json({ timestamps: [], prices: [], meta: {} });

    const timestamps: number[] = result.timestamp ?? [];
    const closes: number[] = result.indicators?.quote?.[0]?.close ?? [];

    const points = timestamps
      .map((t, i) => ({ t: t * 1000, c: closes[i] ?? null }))
      .filter((p) => p.c !== null && !isNaN(p.c!));

    const meta = result.meta;
    const response = {
      timestamps: points.map((p) => p.t),
      prices: points.map((p) => p.c),
      meta: {
        symbol: meta.symbol,
        currency: meta.currency,
        regularMarketPrice: meta.regularMarketPrice,
        chartPreviousClose: meta.chartPreviousClose,
        fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: meta.fiftyTwoWeekLow,
      },
    };

    const ttl = range === "1d" ? 60 * 1000 : range === "5d" ? 5 * 60 * 1000 : 30 * 60 * 1000;
    setInCache(cacheKey, response, ttl);
    res.json(response);
  } catch (err: any) {
    console.error("[chart]", err.message);
    res.status(500).json({ timestamps: [], prices: [], meta: {} });
  }
});

// ─── Events (AI-powered news) ─────────────────────────────────────────────────
router.get("/events/:symbol", async (req, res) => {
  const { symbol } = req.params;

  const cacheKey = `events:${symbol}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return void res.json({ events: cached });

  try {
    const url = `${YF1}/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=8&enableFuzzyQuery=false`;
    const data = await yfFetch(url);
    const rawNews: any[] = data?.news ?? [];
    const items = rawNews.slice(0, 5);

    if (items.length === 0) return void res.json({ events: [] });

    const events: any[] = [];
    for (const [idx, item] of items.entries()) {
      try {
        const title = item.title ?? "Untitled";
        const publisher = item.publisher ?? "Unknown";
        const timestamp = item.providerPublishTime
          ? new Date(item.providerPublishTime * 1000).toISOString()
          : new Date().toISOString();

        const completion = await openai.chat.completions.create({
          model: "gpt-5-nano",
          max_completion_tokens: 280,
          messages: [
            {
              role: "system",
              content: `You are a concise financial analyst. Given a news headline about ${symbol}, produce 3 short sections:
WHAT: 1-2 sentences on what happened (factual, plain language).
WHY: 1-2 sentences on why this matters for regular investors.
UNUSUAL: 1 sentence on what's noteworthy about this.
Format exactly as: WHAT: ... WHY: ... UNUSUAL: ...`,
            },
            { role: "user", content: `Headline: ${title}\nPublisher: ${publisher}` },
          ],
        });

        const text = completion.choices[0]?.message?.content ?? "";
        if (idx === 0) console.log("[events] AI response:", JSON.stringify({ finish_reason: completion.choices[0]?.finish_reason, content: text, model: completion.model }).slice(0, 500));
        const parse = (label: string): string => {
          const m = text.match(new RegExp(`${label}:([\\s\\S]+?)(?=WHAT:|WHY:|UNUSUAL:|$)`, "i"));
          return m?.[1]?.trim() ?? "";
        };

        const titleLower = title.toLowerCase();
        const pos = ["beat", "surge", "gain", "rise", "growth", "record", "high", "upgrade", "profit", "strong", "exceed", "soar"];
        const neg = ["miss", "drop", "fall", "decline", "loss", "cut", "downgrade", "warn", "weak", "below", "slump"];

        events.push({
          id: item.uuid ?? `event-${idx}`,
          ticker: symbol,
          type: detectEventType(titleLower),
          title,
          publisher,
          url: item.link ?? "",
          what: parse("WHAT") || title,
          why: parse("WHY") || "This development may affect the stock's near-term performance.",
          unusual: parse("UNUSUAL") || "Monitor for follow-up reactions in the days ahead.",
          timestamp,
          sentiment: pos.some(w => titleLower.includes(w)) ? "positive" : neg.some(w => titleLower.includes(w)) ? "negative" : "neutral",
        });
      } catch (aiErr: any) {
        console.error(`[events] AI/parse error for item ${idx}:`, aiErr?.message?.slice(0, 200));
        events.push({
          id: item.uuid ?? `event-${idx}`,
          ticker: symbol,
          type: "news",
          title: item.title ?? "News",
          publisher: item.publisher ?? "",
          url: item.link ?? "",
          what: item.title ?? "News headline",
          why: "This news may be relevant to your investment.",
          unusual: "Check the full article for more context.",
          timestamp: item.providerPublishTime
            ? new Date(item.providerPublishTime * 1000).toISOString()
            : new Date().toISOString(),
          sentiment: "neutral",
        });
      }
    }

    setInCache(cacheKey, events, 15 * 60 * 1000);
    res.json({ events });
  } catch (err: any) {
    console.error("[events]", err.message);
    res.status(500).json({ events: [], error: "Failed to get events" });
  }
});

function detectEventType(titleLower: string): string {
  if (titleLower.includes("earn") || titleLower.includes("eps") || titleLower.includes("revenue")) return "earnings";
  if (titleLower.includes("analyst") || titleLower.includes("upgrade") || titleLower.includes("downgrade")) return "analyst";
  if (titleLower.includes("%") || titleLower.includes("surge") || titleLower.includes("plunge")) return "price_move";
  return "news";
}

// Warm up auth on startup
setTimeout(() => refreshYFAuth(), 1000);

export default router;
