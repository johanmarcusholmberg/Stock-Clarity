const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

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
  { label: "1Y", range: "1y", interval: "1wk" },
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
  const res = await fetch(`${API_BASE}/stocks/search?q=${encodeURIComponent(query)}`);
  const data = await res.json();
  return data.quotes ?? [];
}

export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
  if (!symbols.length) return [];
  const res = await fetch(`${API_BASE}/stocks/quote?symbols=${encodeURIComponent(symbols.join(","))}`);
  const data = await res.json();
  return data.result ?? [];
}

export async function getChart(symbol: string, range: string, interval: string): Promise<ChartData> {
  const res = await fetch(`${API_BASE}/stocks/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`);
  return res.json();
}

export async function getEvents(symbol: string, period: EventPeriod = "week"): Promise<StockEvent[]> {
  const res = await fetch(`${API_BASE}/stocks/events/${encodeURIComponent(symbol)}?period=${period}`);
  const data = await res.json();
  return data.events ?? [];
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
