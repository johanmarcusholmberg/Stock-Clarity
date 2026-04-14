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
    const sessionRes = await fetch("https://fc.yahoo.com", {
      headers: BASE_HEADERS,
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
    });

    const setCookieHeader = sessionRes.headers.get("set-cookie");
    if (!setCookieHeader) return false;

    const cookies = setCookieHeader.split(",").map((c) => c.trim().split(";")[0]).join("; ");
    yfCookie = cookies;

    const crumbRes = await fetch(`${YF1}/v1/test/getcrumb`, {
      headers: { ...BASE_HEADERS, Cookie: yfCookie },
      signal: AbortSignal.timeout(8000),
    });

    if (!crumbRes.ok) return false;
    const crumb = await crumbRes.text();
    if (!crumb || crumb.includes("<") || crumb.length < 5) return false;

    yfCrumb = crumb.trim();
    yfAuthExpires = Date.now() + 60 * 60 * 1000;
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

async function yfFetch(url: string, timeoutMs = 12000): Promise<any> {
  const headers = await getYFHeaders();
  const fullUrl = addCrumb(url);

  const res = await fetch(fullUrl, { headers, signal: AbortSignal.timeout(timeoutMs) });

  if (res.status === 429) {
    console.error("[yfFetch] 429 rate limited:", url.split("?")[0]);
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

// ─── Google News RSS (second source) ─────────────────────────────────────────
interface NewsItem {
  title: string;
  publisher: string;
  url: string;
  timestamp: string;
  timestampMs: number;
}

async function fetchGoogleNewsRSS(query: string): Promise<NewsItem[]> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];

    const text = await res.text();
    const items: NewsItem[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(text)) !== null && items.length < 8) {
      const itemText = match[1];
      const rawTitle =
        itemText.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] ||
        itemText.match(/<title>(.*?)<\/title>/)?.[1] || "";
      const title = rawTitle
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .trim();
      const link =
        itemText.match(/<link>(.*?)<\/link>/)?.[1]?.trim() ||
        itemText.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1]?.trim() || "";
      const pubDate = itemText.match(/<pubDate>(.*?)<\/pubDate>/)?.[1]?.trim() || "";
      const source =
        itemText.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]
          ?.replace(/<!\[CDATA\[(.*?)\]\]>/, "$1")
          ?.trim() || "News";

      if (title && title.length > 10) {
        const ts = pubDate ? new Date(pubDate).getTime() : Date.now();
        if (!isNaN(ts)) {
          items.push({ title, publisher: source, url: link, timestamp: new Date(ts).toISOString(), timestampMs: ts });
        }
      }
    }
    return items;
  } catch (err: any) {
    console.error("[GoogleNewsRSS]", err.message);
    return [];
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

// ─── Events (AI-powered, multi-source, period-aware, relevance-filtered) ──────
router.get("/events/:symbol", async (req, res) => {
  const { symbol } = req.params;
  const period = (req.query.period as string) || "week";

  const cacheKey = `events:${symbol}:${period}`;
  const cached = getFromCache<any[]>(cacheKey);
  if (cached) return void res.json({ events: cached });

  try {
    const now = Date.now();
    const cutoffs: Record<string, number> = {
      day:   now - 1  * 24 * 60 * 60 * 1000,
      week:  now - 7  * 24 * 60 * 60 * 1000,
      month: now - 30 * 24 * 60 * 60 * 1000,
      year:  now - 365 * 24 * 60 * 60 * 1000,
    };
    const cutoffMs = cutoffs[period] ?? cutoffs.week;

    // Fetch Yahoo Finance news + Google News RSS in parallel
    const [yfData, googleItems] = await Promise.allSettled([
      yfFetch(`${YF1}/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false`),
      fetchGoogleNewsRSS(`${symbol} stock`),
    ]);

    const yfNews: any[] = yfData.status === "fulfilled" ? (yfData.value?.news ?? []).slice(0, 8) : [];
    const gnItems: NewsItem[] = googleItems.status === "fulfilled" ? googleItems.value : [];

    // Normalise and merge
    const allArticles: Array<NewsItem & { sourceLabel: string; idx: number }> = [
      ...yfNews.map((item: any, i: number) => ({
        title: item.title ?? "",
        publisher: item.publisher ?? "Yahoo Finance",
        url: item.link ?? "",
        timestamp: item.providerPublishTime ? new Date(item.providerPublishTime * 1000).toISOString() : new Date().toISOString(),
        timestampMs: item.providerPublishTime ? item.providerPublishTime * 1000 : now,
        sourceLabel: "Yahoo Finance",
        idx: i,
      })),
      ...gnItems.map((item, i) => ({
        ...item,
        sourceLabel: item.publisher,
        idx: yfNews.length + i,
      })),
    ]
      .filter((a) => a.title.length > 10 && a.timestampMs >= cutoffMs)
      // dedupe near-identical titles
      .reduce<Array<NewsItem & { sourceLabel: string; idx: number }>>((acc, a) => {
        const isDupe = acc.some((existing) => {
          const overlap = longestCommonWords(existing.title, a.title);
          return overlap >= 4;
        });
        if (!isDupe) acc.push(a);
        return acc;
      }, [])
      .slice(0, 14);

    if (allArticles.length === 0) return void res.json({ events: [] });

    // ONE consolidated AI call: filter + group + summarise
    const prompt = `You are a senior financial analyst. Analyse these news headlines for stock ticker "${symbol}".

Headlines (numbered):
${allArticles.map((a, i) => `${i + 1}. [${a.sourceLabel}] "${a.title}" (published: ${a.timestamp.slice(0, 10)})`).join("\n")}

Tasks:
1. DISCARD any headline that is NOT directly about ${symbol}'s business, financials, leadership, products, or market performance. Be strict.
2. GROUP headlines about the same event or topic together.
3. For each group (up to 5 groups total), produce a JSON object.

Return ONLY a JSON array. No markdown, no prose. Format:
[
  {
    "title": "Concise headline (max 80 chars)",
    "type": "earnings" | "analyst" | "price_move" | "news",
    "sentiment": "positive" | "negative" | "neutral",
    "what": "1-2 sentences: exactly what happened with ${symbol}. Factual, specific.",
    "why": "1-2 sentences: why this matters for ${symbol} investors.",
    "unusual": "1 sentence: what is notable or surprising.",
    "combinedFrom": [1, 3, 7],
    "primarySource": 1
  }
]

If fewer than 2 headlines are genuinely relevant to ${symbol}, return an empty array [].`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
    });

    const text = completion.choices[0]?.message?.content ?? "[]";
    let parsed: any[] = [];
    try {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      parsed = [];
    }

    const events = parsed.slice(0, 5).map((e: any, idx: number) => {
      const primaryIdx = (e.primarySource ?? 1) - 1;
      const source = allArticles[primaryIdx] ?? allArticles[0];
      const combinedCount = Array.isArray(e.combinedFrom) ? e.combinedFrom.length : 1;
      return {
        id: `event-${symbol}-${idx}-${Date.now()}`,
        ticker: symbol,
        type: e.type || "news",
        title: e.title || source?.title || "Market Update",
        publisher: combinedCount > 1 ? `${combinedCount} sources` : (source?.publisher || "News"),
        url: source?.url || "",
        what: e.what || "",
        why: e.why || "",
        unusual: e.unusual || "",
        timestamp: source?.timestamp || new Date().toISOString(),
        sentiment: e.sentiment || "neutral",
        combinedCount,
      };
    });

    const ttl =
      period === "day"  ? 20 * 60 * 1000        // 20 min — news changes fast intraday
      : period === "week"  ?  4 * 60 * 60 * 1000  // 4 hr  (was 1 hr)
      : 12 * 60 * 60 * 1000;                      // 12 hr (was 4 hr) for month/year

    setInCache(cacheKey, events, ttl);
    res.json({ events });
  } catch (err: any) {
    console.error("[events]", err.message);
    res.status(500).json({ events: [], error: "Failed to get events" });
  }
});

function longestCommonWords(a: string, b: string): number {
  const wa = new Set(a.toLowerCase().split(/\s+/));
  return b.toLowerCase().split(/\s+/).filter((w) => w.length > 3 && wa.has(w)).length;
}

function detectEventType(titleLower: string): string {
  if (titleLower.includes("earn") || titleLower.includes("eps") || titleLower.includes("revenue")) return "earnings";
  if (titleLower.includes("analyst") || titleLower.includes("upgrade") || titleLower.includes("downgrade")) return "analyst";
  if (titleLower.includes("%") || titleLower.includes("surge") || titleLower.includes("plunge")) return "price_move";
  return "news";
}

setTimeout(() => refreshYFAuth(), 1000);

export default router;
