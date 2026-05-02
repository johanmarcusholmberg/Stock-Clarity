import AsyncStorage from "@react-native-async-storage/async-storage";

import { getApiBase } from "../lib/apiBase";
import { authedFetch } from "../lib/authedFetch";
const API_BASE =
  getApiBase();

// TTLs mirror the backend cache so the client doesn't re-fetch while the
// server would have returned the same data anyway.
const EVENT_CACHE_TTL_MS: Record<EventPeriod, number> = {
  day:   20 * 60 * 1000,        // 20 min
  week:   4 * 60 * 60 * 1000,   // 4 hr
  month: 12 * 60 * 60 * 1000,   // 12 hr
  year:  12 * 60 * 60 * 1000,   // 12 hr
};

export interface SearchResult {
  symbol: string;
  shortName: string;
  longName: string;
  exchange: string;
  type: string;
}

export interface QuoteResult {
  symbol: string;
  shortName: string;
  longName: string;
  regularMarketPrice: number;
  regularMarketChange: number;
  regularMarketChangePercent: number;
  currency: string;
  marketCap: number;
  fullExchangeName: string;
  sector?: string;
  industry?: string;
  regularMarketVolume?: number;
  averageVolume?: number;
  fiftyTwoWeekHigh?: number;
  fiftyTwoWeekLow?: number;
  trailingPE?: number;
  dividendYield?: number;
  regularMarketOpen?: number;
  regularMarketPreviousClose?: number;
  regularMarketDayHigh?: number;
  regularMarketDayLow?: number;
}

export interface ChartData {
  timestamps: number[];
  prices: number[];
  meta: {
    symbol: string;
    currency: string;
    regularMarketPrice: number;
    chartPreviousClose: number;
  };
}

export interface StockEvent {
  id: string;
  ticker: string;
  type: "earnings" | "analyst" | "price_move" | "news" | "announcement";
  title: string;
  publisher: string;
  url: string;
  what: string;
  why: string;
  unusual: string;
  timestamp: string;
  sentiment: "positive" | "negative" | "neutral";
  combinedCount?: number;
}

export type EventPeriod = "day" | "week" | "month" | "year";

export const CHART_RANGES: { label: string; range: string; interval: string }[] = [
  { label: "1D", range: "1d", interval: "5m" },
  { label: "5D", range: "5d", interval: "15m" },
  { label: "1M", range: "1mo", interval: "1d" },
  { label: "YTD", range: "ytd", interval: "1d" },
  { label: "1Y", range: "1y", interval: "1d" },
  { label: "3Y", range: "3y", interval: "1mo" },
  { label: "5Y", range: "5y", interval: "1mo" },
];

export const EVENT_PERIODS: { key: EventPeriod; label: string }[] = [
  { key: "day",   label: "Today" },
  { key: "week",  label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "year",  label: "This Year" },
];

export async function searchStocks(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];
  const res = await authedFetch(`${API_BASE}/stocks/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.quotes ?? [];
}

// Fetches live quotes for one or more tickers. No client-side caching —
// callers (WatchlistContext, stock detail) control when to call this.
export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
  if (!symbols.length) return [];
  const res = await authedFetch(`${API_BASE}/stocks/quote?symbols=${encodeURIComponent(symbols.join(","))}`);
  const data = await res.json();
  return data.result ?? [];
}

// Fetches OHLC chart data for a single ticker+range+interval combo.
// Not cached here — TanStack Query in useMiniCharts / useMultiRangeChart
// handles caching with per-range stale times (see those hooks).
// `fresh: true` bypasses the server-side chart cache — used by the manual
// refresh button so Premium users (1-min cooldown) don't hit the 60s
// 1D server cache and receive identical stale data.
export async function getChart(
  symbol: string,
  range: string,
  interval: string,
  opts?: { fresh?: boolean },
): Promise<ChartData> {
  const freshParam = opts?.fresh ? `&fresh=1&_t=${Date.now()}` : "";
  const res = await authedFetch(
    `${API_BASE}/stocks/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${freshParam}`,
    opts?.fresh ? { cache: "no-store" } : undefined,
  );
  return res.json();
}

// Fetches AI-generated news events for a ticker+period.
// Client-side cache: AsyncStorage with TTL matching the backend cache
// (see EVENT_CACHE_TTL_MS above). This avoids redundant network round-trips
// when the user re-opens a stock page or switches period tabs.
export async function getEvents(symbol: string, period: EventPeriod = "week"): Promise<StockEvent[]> {
  const cacheKey = `@sc_events:${symbol}:${period}`;

  // Return cached result if still within TTL — avoids a network round-trip
  // on every page open and every period tab switch within the same session.
  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const { data, expiresAt } = JSON.parse(raw) as { data: StockEvent[]; expiresAt: number };
      if (Date.now() < expiresAt) return data;
    }
  } catch {}

  const res = await authedFetch(`${API_BASE}/stocks/events/${encodeURIComponent(symbol)}?period=${period}`);
  const json = await res.json();
  const events: StockEvent[] = json.events ?? [];

  // Persist to AsyncStorage — fire-and-forget, failure is silent.
  try {
    const ttl = EVENT_CACHE_TTL_MS[period] ?? EVENT_CACHE_TTL_MS.week;
    await AsyncStorage.setItem(cacheKey, JSON.stringify({ data: events, expiresAt: Date.now() + ttl }));
  } catch {}

  return events;
}

// ── Reports (10-K / 10-Q SEC filings + AI summaries) ─────────────────
//
// SEC EDGAR is fetched server-side because the browser/mobile client cannot
// satisfy EDGAR's User-Agent contract from cross-origin requests, and the
// Anthropic API key must never reach the bundle. The /api/reports route in
// the api-server owns both fetches.

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

export interface SummaryResponse {
  ticker: string;
  accession: string;
  type: FilingType;
  filing: Filing;
  summary: ReportSummary;
}

export interface FilingsResult {
  filings: Filing[];
  unsupported: boolean;
  message: string | null;
}

// Returns either filings or, for non-US tickers, an `unsupported` flag plus
// a friendly message the UI can show in place of the list.
export async function getReportFilingsResult(ticker: string): Promise<FilingsResult> {
  const res = await authedFetch(
    `${API_BASE}/reports?ticker=${encodeURIComponent(ticker)}&action=filings`,
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((errBody as any)?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    filings?: Filing[];
    unsupported?: boolean;
    message?: string;
  };
  return {
    filings: data.filings ?? [],
    unsupported: !!data.unsupported,
    message: data.message ?? null,
  };
}

export async function getReportFilings(ticker: string): Promise<Filing[]> {
  const res = await authedFetch(
    `${API_BASE}/reports?ticker=${encodeURIComponent(ticker)}&action=filings`,
  );
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error(errBody?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { filings?: Filing[] };
  return data.filings ?? [];
}

// AsyncStorage cache: avoid re-fetching the same accession's summary across
// page opens. Per-accession key matches the spec
// (`report_summary_{ticker}_{accessionNumber}`).
export class PremiumRequiredError extends Error {
  constructor(public readonly currentTier: string) {
    super("premium_required");
    this.name = "PremiumRequiredError";
  }
}

export async function getReportSummary(
  ticker: string,
  accessionNumber: string,
  userId?: string | null,
): Promise<SummaryResponse> {
  const cacheKey = `report_summary_${ticker}_${accessionNumber}`;

  try {
    const raw = await AsyncStorage.getItem(cacheKey);
    if (raw) {
      const cached = JSON.parse(raw) as SummaryResponse;
      if (cached?.summary?.headline) return cached;
    }
  } catch {}

  const qs = new URLSearchParams({
    ticker,
    action: "summary",
    accession: accessionNumber,
  });
  if (userId) qs.set("userId", userId);

  const res = await authedFetch(`${API_BASE}/reports?${qs.toString()}`);
  if (res.status === 402) {
    const errBody = await res.json().catch(() => ({ tier: "free" }));
    throw new PremiumRequiredError((errBody as any)?.tier ?? "free");
  }
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((errBody as any)?.error ?? `HTTP ${res.status}`);
  }
  const data = (await res.json()) as SummaryResponse;

  try {
    await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
  } catch {}

  return data;
}

// ── Report subscriptions (notify on new 10-K / 10-Q) ─────────────────────
export interface ReportSubscription {
  id: string;
  symbol: string;
  delivery_channel: "push" | "email" | "both";
}

export async function getReportSubscription(
  userId: string,
  symbol: string,
): Promise<ReportSubscription | null> {
  const res = await authedFetch(
    `${API_BASE}/reports/subscriptions/${encodeURIComponent(userId)}/${encodeURIComponent(symbol)}`,
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { subscribed: boolean; subscription: ReportSubscription | null };
  return data.subscription;
}

export async function setReportSubscription(
  userId: string,
  symbol: string,
  channel: "push" | "email" | "both" = "push",
): Promise<void> {
  const res = await authedFetch(
    `${API_BASE}/reports/subscriptions/${encodeURIComponent(userId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol, channel }),
    },
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    throw new Error((err as any)?.error ?? `HTTP ${res.status}`);
  }
}

export async function deleteReportSubscription(
  userId: string,
  symbol: string,
): Promise<void> {
  await authedFetch(
    `${API_BASE}/reports/subscriptions/${encodeURIComponent(userId)}/${encodeURIComponent(symbol)}`,
    { method: "DELETE" },
  );
}

export function formatMarketCap(cap?: number): string {
  if (!cap) return "N/A";
  if (cap >= 1e12) return `$${(cap / 1e12).toFixed(2)}T`;
  if (cap >= 1e9) return `$${(cap / 1e9).toFixed(1)}B`;
  if (cap >= 1e6) return `$${(cap / 1e6).toFixed(0)}M`;
  return `$${cap.toFixed(0)}`;
}

export function exchangeToFlag(exchange: string): string {
  const flags: Record<string, string> = {
    NMS: "🇺🇸", NGM: "🇺🇸", NCM: "🇺🇸", NYQ: "🇺🇸", ASE: "🇺🇸",
    NASDAQ: "🇺🇸", NYSE: "🇺🇸", "NYSE MKT": "🇺🇸", "NYSE ARCA": "🇺🇸",
    LSE: "🇬🇧", IOB: "🇬🇧", AIM: "🇬🇧",
    XETRA: "🇩🇪", FRA: "🇩🇪", GER: "🇩🇪",
    ENX: "🇫🇷", PAR: "🇫🇷",
    TYO: "🇯🇵", TSE: "🇯🇵",
    HKG: "🇭🇰", HEX: "🇭🇰",
    TSX: "🇨🇦", TOR: "🇨🇦", CVE: "🇨🇦",
    ASX: "🇦🇺", AXW: "🇦🇺",
    SIX: "🇨🇭", VTX: "🇨🇭",
    NSE: "🇮🇳", BSE: "🇮🇳",
    KRX: "🇰🇷",
    SGX: "🇸🇬",
    SHH: "🇨🇳", SHZ: "🇨🇳",
    AMS: "🇳🇱",
    BRU: "🇧🇪",
    MCE: "🇪🇸",
  };
  return flags[exchange] ?? "🌐";
}

export function formatPrice(price: number, currency?: string): string {
  if (price >= 100000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 10000) return price.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
