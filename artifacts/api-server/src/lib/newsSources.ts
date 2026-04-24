// News-fetch helpers shared between the on-demand /events route and the
// pre-load worker. Extracted from routes/stocks.ts so lib/ doesn't depend on
// routes/.
//
// Yahoo auth (crumb + cookie) is module-level state — a single shared auth
// session is reused across call sites in the same process.

export const BASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://finance.yahoo.com/",
  "Origin": "https://finance.yahoo.com",
};

export const YF1 = "https://query1.finance.yahoo.com";
export const YF2 = "https://query2.finance.yahoo.com";

let yfCrumb: string | null = null;
let yfCookie: string | null = null;
let yfAuthExpires = 0;

export async function refreshYFAuth(): Promise<boolean> {
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

export async function yfFetch(url: string, timeoutMs = 12000): Promise<any> {
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

export interface NewsItem {
  title: string;
  publisher: string;
  url: string;
  timestamp: string;
  timestampMs: number;
}

export async function fetchGoogleNewsRSS(query: string): Promise<NewsItem[]> {
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
        itemText.match(/<link>(https?:\/\/[^<]+)<\/link>/)?.[1]?.trim() ||
        itemText.match(/<link[^>]*\/>\s*(https?:\/\/\S+)/)?.[1]?.trim() ||
        itemText.match(/<guid[^>]*>(https?:\/\/[^<]+)<\/guid>/)?.[1]?.trim() || "";
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

// Yahoo's own news search — returns raw items in Yahoo's shape. Worker
// normalises them to NewsItem via this helper.
export async function fetchYahooNews(symbol: string): Promise<NewsItem[]> {
  try {
    const data = await yfFetch(
      `${YF1}/v1/finance/search?q=${encodeURIComponent(symbol)}&quotesCount=0&newsCount=10&enableFuzzyQuery=false`,
    );
    const raw: any[] = data?.news ?? [];
    return raw
      .filter((item: any) => typeof item?.title === "string" && item.title.length > 10)
      .map((item: any) => {
        const ts = item.providerPublishTime ? item.providerPublishTime * 1000 : Date.now();
        return {
          title: String(item.title).trim(),
          publisher: item.publisher ?? "Yahoo Finance",
          url: item.link ?? "",
          timestamp: new Date(ts).toISOString(),
          timestampMs: ts,
        };
      });
  } catch {
    return [];
  }
}

// Kick off initial Yahoo auth shortly after module load. Same behaviour as
// the original setTimeout at the bottom of routes/stocks.ts.
setTimeout(() => refreshYFAuth(), 1000);
