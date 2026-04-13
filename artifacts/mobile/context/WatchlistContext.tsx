import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { getQuotes } from "@/services/stockApi";

export interface Stock {
  ticker: string;
  name: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  marketCap: string;
  sector: string;
  exchange: string;
  exchangeFlag: string;
  description: string;
  priceHistory: number[];
}

export interface Alert {
  id: string;
  ticker: string;
  stockName: string;
  type: "price_spike" | "volume_surge" | "gap_up" | "gap_down" | "breakout";
  title: string;
  explanation: string;
  magnitude: string;
  timestamp: string;
  read: boolean;
}

export interface DigestEntry {
  id: string;
  ticker: string;
  stockName: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  timestamp: string;
}

interface AddStockData {
  ticker: string;
  name?: string;
  exchange?: string;
  exchangeFlag?: string;
  price?: number;
  currency?: string;
  change?: number;
  changePercent?: number;
}

interface WatchlistContextType {
  watchlist: string[];
  addToWatchlist: (ticker: string, data?: AddStockData) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;
  stocks: Record<string, Stock>;
  alerts: Alert[];
  digest: DigestEntry[];
  markAlertRead: (id: string) => void;
  unreadAlertCount: number;
  refreshQuotes: () => Promise<void>;
}

const ph = (seed: number, len = 30): number[] =>
  Array.from({ length: len }, (_, i) => seed + Math.sin(i * 0.8 + seed) * seed * 0.04 + i * seed * 0.002);

const SEED_STOCKS: Record<string, Stock> = {
  AAPL: { ticker: "AAPL", name: "Apple Inc.", price: 189.43, currency: "USD", change: 2.17, changePercent: 1.16, marketCap: "$2.94T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Consumer electronics, software, and online services.", priceHistory: ph(189, 30) },
  NVDA: { ticker: "NVDA", name: "NVIDIA Corporation", price: 842.5, currency: "USD", change: -12.3, changePercent: -1.44, marketCap: "$2.07T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "GPUs for gaming, data centers, and AI.", priceHistory: ph(842, 30) },
  MSFT: { ticker: "MSFT", name: "Microsoft Corporation", price: 415.2, currency: "USD", change: 5.6, changePercent: 1.37, marketCap: "$3.09T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Software, cloud computing, and hardware.", priceHistory: ph(415, 30) },
  AMZN: { ticker: "AMZN", name: "Amazon.com Inc.", price: 178.35, currency: "USD", change: -1.45, changePercent: -0.81, marketCap: "$1.86T", sector: "Consumer Discretionary", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "E-commerce, cloud computing, and AI.", priceHistory: ph(178, 30) },
  GOOGL: { ticker: "GOOGL", name: "Alphabet Inc.", price: 168.72, currency: "USD", change: 3.21, changePercent: 1.94, marketCap: "$2.1T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Search, advertising, cloud, and AI.", priceHistory: ph(168, 30) },
  TSLA: { ticker: "TSLA", name: "Tesla Inc.", price: 168.29, currency: "USD", change: -8.42, changePercent: -4.77, marketCap: "$537B", sector: "Consumer Discretionary", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Electric vehicles and energy storage.", priceHistory: ph(168, 30) },
  META: { ticker: "META", name: "Meta Platforms Inc.", price: 497.81, currency: "USD", change: 9.3, changePercent: 1.9, marketCap: "$1.27T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Social media: Facebook, Instagram, WhatsApp.", priceHistory: ph(497, 30) },
  JPM: { ticker: "JPM", name: "JPMorgan Chase & Co.", price: 194.62, currency: "USD", change: 1.18, changePercent: 0.61, marketCap: "$562B", sector: "Financials", exchange: "NYSE", exchangeFlag: "🇺🇸", description: "Global financial services and investment banking.", priceHistory: ph(194, 30) },
};

const MOCK_ALERTS: Alert[] = [
  { id: "a1", ticker: "TSLA", stockName: "Tesla", type: "gap_down", title: "TSLA opened 4.1% lower", explanation: "Tesla gapped down at the open following delivery misses. Pre-market volume was 3.2x the 30-day average.", magnitude: "-4.1%", timestamp: "2026-04-10T09:32:00Z", read: false },
  { id: "a2", ticker: "NVDA", stockName: "NVIDIA", type: "volume_surge", title: "NVDA volume 2.8x above average", explanation: "Following an analyst upgrade, NVIDIA traded at 2.8x its 30-day average volume — suggesting institutional buying.", magnitude: "+2.8x volume", timestamp: "2026-04-09T11:00:00Z", read: false },
  { id: "a3", ticker: "AAPL", stockName: "Apple", type: "gap_up", title: "AAPL up 2.2% on earnings beat", explanation: "Apple's after-hours earnings beat translated to a pre-market gap-up of 2.2%.", magnitude: "+2.2%", timestamp: "2026-04-11T09:30:00Z", read: true },
];

const MOCK_DIGEST: DigestEntry[] = [
  { id: "d1", ticker: "AAPL", stockName: "Apple", summary: "Apple beat Q2 earnings by 7.4%, driven by Services revenue growth to $23.9B — the segment's 6th consecutive quarterly beat.", sentiment: "positive", timestamp: "2026-04-12T07:00:00Z" },
  { id: "d2", ticker: "TSLA", stockName: "Tesla", summary: "Tesla's Q1 deliveries fell 13.4% YoY to 337K vehicles, the steepest decline in company history, well below analyst expectations.", sentiment: "negative", timestamp: "2026-04-12T07:00:00Z" },
  { id: "d3", ticker: "NVDA", stockName: "NVIDIA", summary: "Morgan Stanley raised NVIDIA's price target to $1,000, citing accelerating data center AI infrastructure demand.", sentiment: "positive", timestamp: "2026-04-12T07:00:00Z" },
  { id: "d4", ticker: "META", stockName: "Meta", summary: "Meta expanded its 2026 AI capex guidance by $10B to $38-40B, signaling deep conviction in AI monetization.", sentiment: "neutral", timestamp: "2026-04-12T07:00:00Z" },
  { id: "d5", ticker: "MSFT", stockName: "Microsoft", summary: "Azure AI cloud growth accelerated to 33% YoY, with AI services contributing 7 percentage points — doubling the rate from 6 months ago.", sentiment: "positive", timestamp: "2026-04-12T07:00:00Z" },
];

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const WATCHLIST_KEY = "@stockclarify_watchlist_v2";
const STOCKS_KEY = "@stockclarify_stocks_v2";
const ALERTS_READ_KEY = "@stockclarify_alerts_read";

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>(["AAPL", "NVDA", "MSFT", "TSLA", "META"]);
  const [stockData, setStockData] = useState<Record<string, Stock>>(SEED_STOCKS);
  const [readAlerts, setReadAlerts] = useState<Set<string>>(new Set());

  // Load persisted data
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem(WATCHLIST_KEY),
      AsyncStorage.getItem(STOCKS_KEY),
      AsyncStorage.getItem(ALERTS_READ_KEY),
    ]).then(([wl, sd, ra]) => {
      if (wl) { try { setWatchlist(JSON.parse(wl)); } catch {} }
      if (sd) { try { const parsed = JSON.parse(sd); setStockData((prev) => ({ ...SEED_STOCKS, ...prev, ...parsed })); } catch {} }
      if (ra) { try { setReadAlerts(new Set(JSON.parse(ra))); } catch {} }
    });
  }, []);

  // Refresh live quotes for all watched stocks
  const refreshQuotes = useCallback(async () => {
    if (!watchlist.length) return;
    try {
      const quotes = await getQuotes(watchlist);
      if (!quotes.length) return;
      setStockData((prev) => {
        const next = { ...prev };
        for (const q of quotes) {
          const existing = prev[q.symbol] ?? {};
          next[q.symbol] = {
            ...SEED_STOCKS[q.symbol],
            ...existing,
            ticker: q.symbol,
            name: q.longName || q.shortName || existing.name || q.symbol,
            price: q.regularMarketPrice ?? existing.price ?? 0,
            currency: q.currency ?? existing.currency ?? "USD",
            change: q.regularMarketChange ?? existing.change ?? 0,
            changePercent: q.regularMarketChangePercent ?? existing.changePercent ?? 0,
            marketCap: existing.marketCap ?? "N/A",
            sector: q.sector || existing.sector || "",
            exchange: q.fullExchangeName || existing.exchange || "",
            exchangeFlag: existing.exchangeFlag || "🌐",
            description: existing.description || "",
            priceHistory: existing.priceHistory || ph(q.regularMarketPrice ?? 100, 30),
          };
        }
        AsyncStorage.setItem(STOCKS_KEY, JSON.stringify(next));
        return next;
      });
    } catch {}
  }, [watchlist]);

  // Auto-refresh quotes when watchlist changes
  useEffect(() => {
    refreshQuotes();
  }, [watchlist.join(",")]);

  const saveWatchlist = useCallback((list: string[]) => {
    AsyncStorage.setItem(WATCHLIST_KEY, JSON.stringify(list));
  }, []);

  const addToWatchlist = useCallback((ticker: string, data?: AddStockData) => {
    setWatchlist((prev) => {
      if (prev.includes(ticker)) return prev;
      const next = [...prev, ticker];
      saveWatchlist(next);
      return next;
    });

    if (data) {
      setStockData((prev) => {
        const existing = prev[ticker] ?? SEED_STOCKS[ticker] ?? {};
        const updated = {
          ...existing,
          ticker: data.ticker,
          name: data.name || existing.name || data.ticker,
          exchange: data.exchange || existing.exchange || "",
          exchangeFlag: data.exchangeFlag || existing.exchangeFlag || "🌐",
          price: data.price ?? existing.price ?? 0,
          currency: data.currency ?? existing.currency ?? "USD",
          change: data.change ?? existing.change ?? 0,
          changePercent: data.changePercent ?? existing.changePercent ?? 0,
          marketCap: existing.marketCap || "N/A",
          sector: existing.sector || "",
          description: existing.description || "",
          priceHistory: existing.priceHistory || ph(data.price ?? 100, 30),
        };
        const next = { ...prev, [ticker]: updated };
        AsyncStorage.setItem(STOCKS_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [saveWatchlist]);

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((t) => t !== ticker);
      saveWatchlist(next);
      return next;
    });
  }, [saveWatchlist]);

  const isInWatchlist = useCallback((ticker: string) => watchlist.includes(ticker), [watchlist]);

  const markAlertRead = useCallback((id: string) => {
    setReadAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ALERTS_READ_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const alerts = MOCK_ALERTS.map((a) => ({ ...a, read: readAlerts.has(a.id) }))
    .filter((a) => watchlist.includes(a.ticker));
  const unreadAlertCount = alerts.filter((a) => !a.read).length;
  const digest = MOCK_DIGEST.filter((d) => watchlist.includes(d.ticker));

  return (
    <WatchlistContext.Provider value={{
      watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist,
      stocks: stockData, alerts, digest, markAlertRead, unreadAlertCount, refreshQuotes,
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
