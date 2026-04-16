import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/expo";
import { useUser } from "@clerk/expo";
import { getQuotes } from "@/services/stockApi";
import { isMarketOpen } from "@/utils/marketHours";

// Re-export StockEvent so components can import it from here
export type { StockEvent } from "@/services/stockApi";

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

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
  pe?: number;
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
  what: string;
  why: string;
  unusual: string;
  sentiment: "positive" | "negative" | "neutral";
  timestamp: string;
  sourceUrl?: string;
  sourceName?: string;
}

export interface WatchlistFolder {
  id: string;
  name: string;
  tickers: string[];
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
  addToWatchlist: (ticker: string, data?: AddStockData, folderId?: string) => void;
  removeFromWatchlist: (ticker: string, folderId?: string) => void;
  removeFromAllFolders: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;
  isInFolder: (ticker: string, folderId: string) => boolean;
  stocks: Record<string, Stock>;
  alerts: Alert[];
  events: Alert[];
  digest: DigestEntry[];
  markAlertRead: (id: string) => void;
  markAllAlertsRead: () => void;
  unreadAlertCount: number;
  refreshQuotes: () => Promise<void>;
  folders: WatchlistFolder[];
  activeFolderId: string;
  setActiveFolderId: (id: string) => void;
  createFolder: (name: string) => WatchlistFolder | null;
  renameFolder: (id: string, name: string) => void;
  deleteFolder: (id: string, removeStocksCompletely?: boolean) => void;
  addToFolder: (ticker: string, folderId: string, data?: AddStockData) => void;
  removeFromFolder: (ticker: string, folderId: string) => void;
  reorderFolder: (folderId: string, newTickers: string[]) => void;
  folderLimit: number;
  canCreateFolder: boolean;
  displayName: string;
  setDisplayName: (name: string) => void;
}

// Seed stocks provide fallback quote data for the UI before live quotes arrive.
// Chart data (priceHistory) is intentionally empty — real 1Y chart data is fetched
// by the useMiniCharts hook via TanStack Query, keeping chart and quote data separate.
const SEED_STOCKS: Record<string, Stock> = {
  AAPL: { ticker: "AAPL", name: "Apple Inc.", price: 189.43, currency: "USD", change: 2.17, changePercent: 1.16, marketCap: "$2.94T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Consumer electronics, software, and online services.", priceHistory: [], pe: 29.4 },
  NVDA: { ticker: "NVDA", name: "NVIDIA Corporation", price: 842.5, currency: "USD", change: -12.3, changePercent: -1.44, marketCap: "$2.07T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "GPUs for gaming, data centers, and AI.", priceHistory: [], pe: 68.2 },
  MSFT: { ticker: "MSFT", name: "Microsoft Corporation", price: 415.2, currency: "USD", change: 5.6, changePercent: 1.37, marketCap: "$3.09T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Software, cloud computing, and hardware.", priceHistory: [], pe: 34.1 },
  AMZN: { ticker: "AMZN", name: "Amazon.com Inc.", price: 178.35, currency: "USD", change: -1.45, changePercent: -0.81, marketCap: "$1.86T", sector: "Consumer Discretionary", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "E-commerce, cloud computing, and AI.", priceHistory: [], pe: 43.7 },
  GOOGL: { ticker: "GOOGL", name: "Alphabet Inc.", price: 168.72, currency: "USD", change: 3.21, changePercent: 1.94, marketCap: "$2.1T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Search, advertising, cloud, and AI.", priceHistory: [], pe: 22.8 },
  TSLA: { ticker: "TSLA", name: "Tesla Inc.", price: 168.29, currency: "USD", change: -8.42, changePercent: -4.77, marketCap: "$537B", sector: "Consumer Discretionary", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Electric vehicles and energy storage.", priceHistory: [], pe: 56.3 },
  META: { ticker: "META", name: "Meta Platforms Inc.", price: 497.81, currency: "USD", change: 9.3, changePercent: 1.9, marketCap: "$1.27T", sector: "Technology", exchange: "NASDAQ", exchangeFlag: "🇺🇸", description: "Social media: Facebook, Instagram, WhatsApp.", priceHistory: [], pe: 25.6 },
  JPM: { ticker: "JPM", name: "JPMorgan Chase & Co.", price: 194.62, currency: "USD", change: 1.18, changePercent: 0.61, marketCap: "$562B", sector: "Financials", exchange: "NYSE", exchangeFlag: "🇺🇸", description: "Global financial services and investment banking.", priceHistory: [], pe: 12.1 },
};

const MOCK_ALERTS: Alert[] = [
  { id: "a1", ticker: "TSLA", stockName: "Tesla", type: "gap_down", title: "TSLA opened 4.1% lower", explanation: "Tesla gapped down at the open following delivery misses. Pre-market volume was 3.2x the 30-day average.", magnitude: "-4.1%", timestamp: "2026-04-10T09:32:00Z", read: false },
  { id: "a2", ticker: "NVDA", stockName: "NVIDIA", type: "volume_surge", title: "NVDA volume 2.8x above average", explanation: "Following an analyst upgrade, NVIDIA traded at 2.8x its 30-day average volume — suggesting institutional buying.", magnitude: "+2.8x volume", timestamp: "2026-04-09T11:00:00Z", read: false },
  { id: "a3", ticker: "AAPL", stockName: "Apple", type: "gap_up", title: "AAPL up 2.2% on earnings beat", explanation: "Apple's after-hours earnings beat translated to a pre-market gap-up of 2.2%.", magnitude: "+2.2%", timestamp: "2026-04-11T09:30:00Z", read: true },
];

const MOCK_DIGEST: DigestEntry[] = [
  {
    id: "d1", ticker: "AAPL", stockName: "Apple",
    summary: "Apple beat Q2 earnings by 7.4%, driven by Services revenue growth to $23.9B — the segment's 6th consecutive quarterly beat.",
    what: "Apple reported Q2 earnings per share of $1.53, beating the $1.43 consensus estimate by 7.4%. Services revenue hit $23.9B, up 14% year-over-year.",
    why: "Sustained Services growth reduces Apple's reliance on iPhone hardware cycles and delivers higher-margin recurring revenue — a key driver of long-term valuation expansion.",
    unusual: "This marks the 6th consecutive quarter where Services alone beat analyst estimates by more than 5% — a streak that is exceptionally rare for a segment of this size.",
    sentiment: "positive", timestamp: "2026-04-12T07:00:00Z",
    sourceUrl: "https://www.reuters.com/technology/apple-q2-earnings-2026-04-12/", sourceName: "Reuters",
  },
  {
    id: "d2", ticker: "TSLA", stockName: "Tesla",
    summary: "Tesla's Q1 deliveries fell 13.4% YoY to 337K vehicles, the steepest decline in company history, well below analyst expectations.",
    what: "Tesla delivered 336,681 vehicles in Q1 2026, a 13.4% drop year-over-year. The figure missed the 390K analyst consensus by 14% — the largest delivery miss in the company's history.",
    why: "Delivery misses at this scale signal weakening demand for Tesla's aging model lineup, while intensifying competition from BYD and other EV makers pressures both volume and pricing.",
    unusual: "This is the steepest quarter-over-quarter delivery decline Tesla has reported as a public company, happening at a moment when the overall EV market is still growing.",
    sentiment: "negative", timestamp: "2026-04-12T07:00:00Z",
    sourceUrl: "https://www.bloomberg.com/news/articles/2026-04-12/tesla-q1-deliveries", sourceName: "Bloomberg",
  },
  {
    id: "d3", ticker: "NVDA", stockName: "NVIDIA",
    summary: "Morgan Stanley raised NVIDIA's price target to $1,000, citing accelerating data center AI infrastructure demand.",
    what: "Morgan Stanley upgraded its NVIDIA price target from $795 to $1,000, maintaining an Overweight rating. The firm cited demand signals from hyperscalers for Blackwell GPU clusters.",
    why: "A $1,000 target from a top-tier bank implies roughly 20% upside from current levels and reflects growing conviction that AI infrastructure spending will remain elevated through 2027.",
    unusual: "Three other major firms issued similar target raises in the same week — a coordinated wave of upgrades not seen for NVIDIA since the post-ChatGPT surge in early 2023.",
    sentiment: "positive", timestamp: "2026-04-12T07:00:00Z",
    sourceUrl: "https://www.cnbc.com/2026/04/12/nvidia-price-target-raise.html", sourceName: "CNBC",
  },
  {
    id: "d4", ticker: "META", stockName: "Meta",
    summary: "Meta expanded its 2026 AI capex guidance by $10B to $38-40B, signaling deep conviction in AI monetization.",
    what: "Meta raised its 2026 capital expenditure guidance by $10 billion, now projecting $38–40B in AI infrastructure spending. The increase covers data centers and custom AI chips.",
    why: "Higher capex can weigh on near-term free cash flow but signals that Meta's AI features — Llama models, ad targeting, and Meta AI — are delivering enough return to justify accelerating investment.",
    unusual: "Increasing full-year capex by $10B mid-year is highly unusual — it suggests Meta's internal AI ROI data is compelling enough to override typical budget discipline.",
    sentiment: "neutral", timestamp: "2026-04-12T07:00:00Z",
    sourceUrl: "https://www.wsj.com/articles/meta-ai-capex-2026-04-12", sourceName: "WSJ",
  },
  {
    id: "d5", ticker: "MSFT", stockName: "Microsoft",
    summary: "Azure AI cloud growth accelerated to 33% YoY, with AI services contributing 7 percentage points — doubling the rate from 6 months ago.",
    what: "Microsoft reported Azure revenue grew 33% year-over-year in the latest quarter. AI services (Copilot, OpenAI API) now contribute 7 percentage points of that growth, up from 3-4 points six months ago.",
    why: "Accelerating AI contribution within Azure shows that enterprise customers are moving from pilots to production workloads — a transition that tends to drive durable, sticky revenue.",
    unusual: "The AI contribution to Azure growth has doubled in just two quarters, a pace of adoption that most analysts had not modeled until 2027.",
    sentiment: "positive", timestamp: "2026-04-12T07:00:00Z",
    sourceUrl: "https://www.ft.com/content/azure-ai-growth-2026-04-12", sourceName: "Financial Times",
  },
];

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const STOCKS_KEY = "@stockclarify_stocks_v2";
const ALERTS_READ_KEY = "@stockclarify_alerts_read";
const FOLDERS_KEY = "@stockclarify_folders_v1";
const ACTIVE_FOLDER_KEY = "@stockclarify_active_folder_v1";
const DISPLAY_NAME_KEY = "@stockclarify_display_name";

const DEFAULT_FOLDER_ID = "default";

function makeDefaultFolder(tickers: string[]): WatchlistFolder {
  return { id: DEFAULT_FOLDER_ID, name: "My Watchlist", tickers };
}

function generateId(): string {
  return `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function WatchlistProvider({
  children,
  tier = "free",
}: {
  children: React.ReactNode;
  tier?: "free" | "pro" | "premium";
}) {
  const { userId, isSignedIn } = useAuth();
  const { user } = useUser();

  const [folders, setFolders] = useState<WatchlistFolder[]>([makeDefaultFolder([])]);
  const [activeFolderId, setActiveFolderIdState] = useState<string>(DEFAULT_FOLDER_ID);
  const [stockData, setStockData] = useState<Record<string, Stock>>(SEED_STOCKS);
  const [readAlerts, setReadAlerts] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [displayName, setDisplayNameState] = useState<string>("");

  const folderLimit = tier === "free" ? 2 : 10;
  const canCreateFolder = folders.length < folderLimit;

  const allTickers = Array.from(new Set(folders.flatMap((f) => f.tickers)));

  const watchlist = (() => {
    const active = folders.find((f) => f.id === activeFolderId);
    return active ? active.tickers : [];
  })();

  // ── Sync helpers ──────────────────────────────────────────────
  const syncDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveToBackend = useCallback((flds: WatchlistFolder[]) => {
    if (!userId || !isSignedIn) return;
    if (syncDebounceRef.current) clearTimeout(syncDebounceRef.current);
    syncDebounceRef.current = setTimeout(() => {
      fetch(`${API_BASE}/watchlist/${userId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folders: flds }),
      }).catch(() => {});
    }, 1500);
  }, [userId, isSignedIn]);

  const saveFolders = useCallback((flds: WatchlistFolder[]) => {
    AsyncStorage.setItem(FOLDERS_KEY, JSON.stringify(flds));
    saveToBackend(flds);
  }, [saveToBackend]);

  // ── Initial load ──────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;

    Promise.all([
      AsyncStorage.getItem(STOCKS_KEY),
      AsyncStorage.getItem(ALERTS_READ_KEY),
      AsyncStorage.getItem(FOLDERS_KEY),
      AsyncStorage.getItem(ACTIVE_FOLDER_KEY),
      AsyncStorage.getItem(DISPLAY_NAME_KEY),
    ]).then(async ([sd, ra, fl, af, dn]) => {
      // Restore display name from local
      if (dn) setDisplayNameState(dn);

      // Try loading folders from backend first
      let backendFolders: WatchlistFolder[] | null = null;
      try {
        const res = await fetch(`${API_BASE}/watchlist/${userId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.folders) && data.folders.length > 0) {
            backendFolders = data.folders;
          }
          if (data.displayName && !dn) {
            setDisplayNameState(data.displayName);
            AsyncStorage.setItem(DISPLAY_NAME_KEY, data.displayName);
          }
        }
      } catch {}

      const foldersToUse = backendFolders ?? (fl ? (() => {
        try {
          const parsed: WatchlistFolder[] = JSON.parse(fl);
          return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
        } catch { return null; }
      })() : null);

      if (foldersToUse) {
        setFolders(foldersToUse);
        // Determine active folder
        const savedActiveId = af ? (() => { try { return JSON.parse(af); } catch { return null; } })() : null;
        if (savedActiveId && foldersToUse.find((f: WatchlistFolder) => f.id === savedActiveId)) {
          setActiveFolderIdState(savedActiveId);
        } else {
          setActiveFolderIdState(foldersToUse[0].id);
        }
      } else {
        // New user: start with a completely empty watchlist
        const defaultFolders = [makeDefaultFolder([])];
        setFolders(defaultFolders);
        saveFolders(defaultFolders);
      }

      if (sd) {
        try {
          const parsed = JSON.parse(sd);
          setStockData((prev) => ({ ...SEED_STOCKS, ...prev, ...parsed }));
        } catch {}
      }
      if (ra) {
        try { setReadAlerts(new Set(JSON.parse(ra))); } catch {}
      }
      setInitialized(true);
    });
  }, [userId]);

  const setDisplayName = useCallback((name: string) => {
    setDisplayNameState(name);
    AsyncStorage.setItem(DISPLAY_NAME_KEY, name);
    if (userId && isSignedIn) {
      fetch(`${API_BASE}/watchlist/${userId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name }),
      }).catch(() => {});
    }
  }, [userId, isSignedIn]);

  // ── Quote refresh ─────────────────────────────────────────────
  // Only updates quote data (price, change, etc.).  Mini-chart 1Y data is
  // fetched separately by the useMiniCharts hook via TanStack Query so that
  // chart loading is grouped, cached, and not limited to a subset of tickers.
  //
  // Triggers:
  //   1. On init — when watchlist data finishes loading (initialized === true)
  //   2. When tickers change — adding/removing a stock re-fetches all quotes
  //   3. Every 15 min — auto-refresh interval (market-hours only, see below)
  //   4. Pull-to-refresh — the Home screen calls refreshQuotes() directly
  const refreshQuotes = useCallback(async () => {
    if (!allTickers.length) return;
    try {
      const quotes = await getQuotes(allTickers);
      if (!quotes.length) return;
      setStockData((prev) => {
        const next = { ...prev };
        for (const q of quotes) {
          const existing = prev[q.symbol] ?? {};
          const newPrice = q.regularMarketPrice ?? existing.price ?? 0;
          const newChangePct = q.regularMarketChangePercent ?? existing.changePercent ?? 0;
          next[q.symbol] = {
            ...SEED_STOCKS[q.symbol],
            ...existing,
            ticker: q.symbol,
            name: q.longName || q.shortName || existing.name || q.symbol,
            price: newPrice,
            currency: q.currency ?? existing.currency ?? "USD",
            change: q.regularMarketChange ?? existing.change ?? 0,
            changePercent: newChangePct,
            marketCap: existing.marketCap ?? "N/A",
            sector: q.sector || existing.sector || "",
            exchange: q.fullExchangeName || existing.exchange || "",
            exchangeFlag: existing.exchangeFlag || "🌐",
            description: existing.description || "",
            priceHistory: existing.priceHistory ?? [],
            pe: q.trailingPE ?? existing.pe,
          };
        }
        AsyncStorage.setItem(STOCKS_KEY, JSON.stringify(next));
        return next;
      });
    } catch {}
  }, [allTickers.join(",")]);

  useEffect(() => {
    if (initialized) refreshQuotes();
  }, [allTickers.join(","), initialized]);

  // ── 15-minute auto-refresh during market hours ────────────────
  // Interval: 15 minutes (900 000 ms).
  // Guard: skips the fetch if no watched stock's exchange is currently open
  // (weekday + within trading hours per marketHours.ts schedule).
  // Cleanup: interval is cleared and re-created when the ticker list or
  // refreshQuotes identity changes, preventing stale closures.
  useEffect(() => {
    if (!initialized) return;
    const FIFTEEN_MIN = 15 * 60 * 1000;
    const intervalId = setInterval(() => {
      // Refresh only when at least one watched stock's market is open
      const anyOpen = allTickers.some((t) => {
        const stock = stockDataRef.current[t];
        if (!stock) return false;
        return isMarketOpen(stock.exchange || "");
      });
      if (anyOpen) refreshQuotes();
    }, FIFTEEN_MIN);
    return () => clearInterval(intervalId);
  }, [initialized, allTickers.join(","), refreshQuotes]);

  // ── Folder management ────────────────────────────────────────
  const setActiveFolderId = useCallback((id: string) => {
    setActiveFolderIdState(id);
    AsyncStorage.setItem(ACTIVE_FOLDER_KEY, JSON.stringify(id));
  }, []);

  const foldersRef = useRef<WatchlistFolder[]>(folders);
  useEffect(() => { foldersRef.current = folders; }, [folders]);

  const stockDataRef = useRef<Record<string, Stock>>(stockData);
  useEffect(() => { stockDataRef.current = stockData; }, [stockData]);

  const createFolder = useCallback((name: string): WatchlistFolder | null => {
    const trimmedName = name.trim();
    if (!trimmedName) return null;
    if (foldersRef.current.length >= folderLimit) return null;

    const newFolder: WatchlistFolder = { id: generateId(), name: trimmedName, tickers: [] };
    setFolders((prev) => {
      if (prev.length >= folderLimit) return prev;
      const next = [...prev, newFolder];
      saveFolders(next);
      return next;
    });
    return newFolder;
  }, [folderLimit, saveFolders]);

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => {
      const next = prev.map((f) => f.id === id ? { ...f, name: name.trim() } : f);
      saveFolders(next);
      return next;
    });
  }, [saveFolders]);

  const deleteFolder = useCallback((id: string, removeStocksCompletely = false) => {
    if (id === DEFAULT_FOLDER_ID) return;
    setFolders((prev) => {
      if (prev.length <= 1) return prev;
      const folderToDelete = prev.find((f) => f.id === id);
      const tickersInFolder = folderToDelete?.tickers ?? [];
      let next: WatchlistFolder[];
      if (removeStocksCompletely && tickersInFolder.length > 0) {
        // Remove stocks from ALL folders, then drop this folder
        next = prev
          .filter((f) => f.id !== id)
          .map((f) => ({ ...f, tickers: f.tickers.filter((t) => !tickersInFolder.includes(t)) }));
      } else {
        // Move stocks to My Watchlist, then drop this folder
        next = prev
          .filter((f) => f.id !== id)
          .map((f) => {
            if (f.id !== DEFAULT_FOLDER_ID || tickersInFolder.length === 0) return f;
            const merged = Array.from(new Set([...f.tickers, ...tickersInFolder]));
            return { ...f, tickers: merged };
          });
      }
      saveFolders(next);
      setActiveFolderIdState((currentActive) => {
        if (currentActive !== id) return currentActive;
        const newActive = next[0]?.id ?? currentActive;
        AsyncStorage.setItem(ACTIVE_FOLDER_KEY, JSON.stringify(newActive));
        return newActive;
      });
      return next;
    });
  }, [saveFolders]);

  const addToFolder = useCallback((ticker: string, folderId: string, data?: AddStockData) => {
    setFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId) return f;
        if (f.tickers.includes(ticker)) return f;
        return { ...f, tickers: [...f.tickers, ticker] };
      });
      saveFolders(next);
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
          // Don't fabricate chart data — useMiniCharts will fetch real 1Y data
          priceHistory: existing.priceHistory ?? [],
        };
        const next = { ...prev, [ticker]: updated };
        AsyncStorage.setItem(STOCKS_KEY, JSON.stringify(next));
        return next;
      });
    }
  }, [saveFolders]);

  const removeFromFolder = useCallback((ticker: string, folderId: string) => {
    setFolders((prev) => {
      const next = prev.map((f) => {
        if (f.id !== folderId) return f;
        return { ...f, tickers: f.tickers.filter((t) => t !== ticker) };
      });
      saveFolders(next);
      return next;
    });
  }, [saveFolders]);

  // Remove from ALL folders (nuclear remove)
  const removeFromAllFolders = useCallback((ticker: string) => {
    setFolders((prev) => {
      const next = prev.map((f) => ({ ...f, tickers: f.tickers.filter((t) => t !== ticker) }));
      saveFolders(next);
      return next;
    });
  }, [saveFolders]);

  const reorderFolder = useCallback((folderId: string, newTickers: string[]) => {
    setFolders((prev) => {
      const next = prev.map((f) => (f.id === folderId ? { ...f, tickers: newTickers } : f));
      saveFolders(next);
      return next;
    });
  }, [saveFolders]);

  const addToWatchlist = useCallback((ticker: string, data?: AddStockData, folderId?: string) => {
    const targetId = folderId ?? activeFolderId;
    addToFolder(ticker, targetId, data);
  }, [addToFolder, activeFolderId]);

  // removeFromWatchlist removes from active folder only (stock stays in other folders)
  const removeFromWatchlist = useCallback((ticker: string, folderId?: string) => {
    const targetId = folderId ?? activeFolderId;
    removeFromFolder(ticker, targetId);
  }, [removeFromFolder, activeFolderId]);

  const isInWatchlist = useCallback((ticker: string) => {
    return folders.some((f) => f.tickers.includes(ticker));
  }, [folders]);

  const isInFolder = useCallback((ticker: string, folderId: string) => {
    return folders.find((f) => f.id === folderId)?.tickers.includes(ticker) ?? false;
  }, [folders]);

  const markAlertRead = useCallback((id: string) => {
    setReadAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ALERTS_READ_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const markAllAlertsRead = useCallback(() => {
    setReadAlerts((prev) => {
      const allIds = MOCK_ALERTS.map((a) => a.id);
      const next = new Set([...prev, ...allIds]);
      AsyncStorage.setItem(ALERTS_READ_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const alerts = MOCK_ALERTS.map((a) => ({ ...a, read: readAlerts.has(a.id) }))
    .filter((a) => allTickers.includes(a.ticker));
  const unreadAlertCount = alerts.filter((a) => !a.read).length;
  const digest = MOCK_DIGEST.filter((d) => allTickers.includes(d.ticker));

  return (
    <WatchlistContext.Provider value={{
      watchlist,
      addToWatchlist,
      removeFromWatchlist,
      removeFromAllFolders,
      isInWatchlist,
      isInFolder,
      stocks: stockData,
      alerts,
      events: alerts,
      digest,
      markAlertRead,
      markAllAlertsRead,
      unreadAlertCount,
      refreshQuotes,
      folders,
      activeFolderId,
      setActiveFolderId,
      createFolder,
      renameFolder,
      deleteFolder,
      addToFolder,
      removeFromFolder,
      reorderFolder,
      folderLimit,
      canCreateFolder,
      displayName,
      setDisplayName,
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
