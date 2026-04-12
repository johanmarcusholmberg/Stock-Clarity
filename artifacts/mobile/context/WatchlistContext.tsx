import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export interface Stock {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changePercent: number;
  marketCap: string;
  sector: string;
  description: string;
  priceHistory: number[];
}

export interface StockEvent {
  id: string;
  ticker: string;
  type: "earnings" | "analyst" | "price_move" | "news" | "announcement";
  title: string;
  what: string;
  why: string;
  unusual: string;
  timestamp: string;
  sentiment: "positive" | "negative" | "neutral";
}

export interface DigestEntry {
  id: string;
  ticker: string;
  stockName: string;
  summary: string;
  sentiment: "positive" | "negative" | "neutral";
  timestamp: string;
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

interface WatchlistContextType {
  watchlist: string[];
  addToWatchlist: (ticker: string) => void;
  removeFromWatchlist: (ticker: string) => void;
  isInWatchlist: (ticker: string) => boolean;
  stocks: Record<string, Stock>;
  events: StockEvent[];
  digest: DigestEntry[];
  alerts: Alert[];
  markAlertRead: (id: string) => void;
  unreadAlertCount: number;
}

const STOCK_DATA: Record<string, Stock> = {
  AAPL: {
    ticker: "AAPL",
    name: "Apple Inc.",
    price: 189.43,
    change: 2.17,
    changePercent: 1.16,
    marketCap: "$2.94T",
    sector: "Technology",
    description: "Designs and manufactures consumer electronics, software, and online services.",
    priceHistory: [178, 181, 179, 183, 182, 185, 184, 186, 188, 187, 189, 191, 190, 189, 192, 191, 193, 192, 190, 189, 191, 193, 192, 189, 190, 192, 191, 189, 190, 189],
  },
  NVDA: {
    ticker: "NVDA",
    name: "NVIDIA Corporation",
    price: 842.5,
    change: -12.3,
    changePercent: -1.44,
    marketCap: "$2.07T",
    sector: "Technology",
    description: "Designs graphics processing units for gaming, data centers, and AI applications.",
    priceHistory: [790, 798, 805, 812, 808, 820, 825, 830, 835, 828, 840, 850, 855, 845, 848, 852, 860, 858, 850, 842, 848, 855, 860, 855, 848, 850, 855, 848, 845, 842],
  },
  MSFT: {
    ticker: "MSFT",
    name: "Microsoft Corporation",
    price: 415.2,
    change: 5.6,
    changePercent: 1.37,
    marketCap: "$3.09T",
    sector: "Technology",
    description: "Develops software, cloud computing services, and hardware products.",
    priceHistory: [390, 393, 395, 398, 400, 402, 405, 408, 406, 410, 412, 408, 411, 413, 410, 412, 415, 413, 414, 412, 413, 415, 414, 413, 414, 413, 415, 414, 415, 415],
  },
  AMZN: {
    ticker: "AMZN",
    name: "Amazon.com Inc.",
    price: 178.35,
    change: -1.45,
    changePercent: -0.81,
    marketCap: "$1.86T",
    sector: "Consumer Discretionary",
    description: "E-commerce, cloud computing, digital streaming, and AI services.",
    priceHistory: [168, 170, 172, 171, 173, 175, 174, 176, 178, 177, 179, 180, 178, 179, 181, 180, 178, 179, 178, 177, 179, 180, 179, 178, 179, 180, 179, 178, 179, 178],
  },
  GOOGL: {
    ticker: "GOOGL",
    name: "Alphabet Inc.",
    price: 168.72,
    change: 3.21,
    changePercent: 1.94,
    marketCap: "$2.1T",
    sector: "Technology",
    description: "Search engine, advertising, cloud computing, and AI services.",
    priceHistory: [155, 157, 159, 158, 161, 162, 160, 163, 165, 164, 166, 167, 165, 166, 168, 167, 166, 168, 169, 168, 167, 168, 169, 168, 167, 168, 169, 168, 169, 168],
  },
  TSLA: {
    ticker: "TSLA",
    name: "Tesla Inc.",
    price: 168.29,
    change: -8.42,
    changePercent: -4.77,
    marketCap: "$537B",
    sector: "Consumer Discretionary",
    description: "Electric vehicles, energy generation and storage, and AI-powered autonomous driving.",
    priceHistory: [195, 192, 188, 185, 182, 180, 177, 175, 178, 175, 172, 170, 173, 171, 168, 172, 170, 168, 172, 176, 174, 170, 172, 175, 173, 170, 172, 176, 176, 168],
  },
  META: {
    ticker: "META",
    name: "Meta Platforms Inc.",
    price: 497.81,
    change: 9.3,
    changePercent: 1.9,
    marketCap: "$1.27T",
    sector: "Technology",
    description: "Social media platforms including Facebook, Instagram, and WhatsApp.",
    priceHistory: [462, 465, 470, 468, 472, 475, 473, 477, 479, 480, 476, 479, 482, 480, 483, 482, 484, 486, 485, 487, 490, 488, 491, 492, 490, 493, 495, 494, 497, 497],
  },
  JPM: {
    ticker: "JPM",
    name: "JPMorgan Chase & Co.",
    price: 194.62,
    change: 1.18,
    changePercent: 0.61,
    marketCap: "$562B",
    sector: "Financials",
    description: "Global financial services including investment banking, commercial banking, and asset management.",
    priceHistory: [183, 184, 186, 185, 187, 188, 187, 189, 190, 189, 191, 192, 191, 192, 193, 192, 193, 194, 193, 194, 193, 194, 195, 194, 193, 194, 195, 194, 194, 194],
  },
  V: {
    ticker: "V",
    name: "Visa Inc.",
    price: 277.94,
    change: 0.84,
    changePercent: 0.3,
    marketCap: "$565B",
    sector: "Financials",
    description: "Global payments technology connecting consumers, businesses, and financial institutions.",
    priceHistory: [268, 269, 271, 270, 272, 273, 272, 274, 275, 274, 275, 276, 275, 276, 277, 276, 277, 278, 277, 278, 277, 278, 279, 278, 277, 278, 278, 277, 278, 277],
  },
  BRK: {
    ticker: "BRK",
    name: "Berkshire Hathaway",
    price: 415300,
    change: 2300,
    changePercent: 0.56,
    marketCap: "$903B",
    sector: "Financials",
    description: "Multinational conglomerate holding company run by Warren Buffett.",
    priceHistory: [405000, 406000, 407000, 408000, 409000, 410000, 409000, 411000, 412000, 411000, 412000, 413000, 412000, 413000, 414000, 413000, 414000, 415000, 414000, 415000, 414000, 415000, 416000, 415000, 414000, 415000, 416000, 415000, 415000, 415000],
  },
};

const MOCK_EVENTS: StockEvent[] = [
  {
    id: "e1",
    ticker: "AAPL",
    type: "earnings",
    title: "Apple beats Q2 earnings estimates",
    what: "Apple reported Q2 2026 EPS of $1.89, beating analyst consensus of $1.76 by 7.4%. Revenue of $95.4B exceeded estimates of $93.9B. Services segment grew 12% YoY to $23.9B.",
    why: "Services growth is critical — it's Apple's highest-margin segment and increasingly important to the investment thesis. Strong iPhone replacement cycles suggest demand remains resilient despite elevated prices.",
    unusual: "This marks the 6th consecutive quarter of Services revenue beats. The magnitude of the earnings beat (7.4%) is above Apple's trailing 8-quarter average beat of 4.2%.",
    timestamp: "2026-04-11T16:30:00Z",
    sentiment: "positive",
  },
  {
    id: "e2",
    ticker: "TSLA",
    type: "price_move",
    title: "Tesla drops 4.8% — delivery miss weighs",
    what: "Tesla shares declined 4.8% after Q1 2026 delivery figures came in at 336,681 vehicles, below analyst expectations of 371,000. This represents a 13.4% decline year-over-year.",
    why: "Deliveries are the most visible signal of near-term demand health for Tesla. A miss of this magnitude raises questions about price elasticity and competition from BYD and legacy automakers entering the EV space.",
    unusual: "The -13.4% YoY decline is the steepest in Tesla's history as a public company, surpassing the -6.5% decline in Q1 2024. Analyst estimates had already been revised down twice this quarter.",
    timestamp: "2026-04-10T09:15:00Z",
    sentiment: "negative",
  },
  {
    id: "e3",
    ticker: "NVDA",
    type: "analyst",
    title: "Morgan Stanley raises NVDA price target to $1,000",
    what: "Morgan Stanley upgraded NVIDIA's 12-month price target from $850 to $1,000, maintaining an Overweight rating. The firm cited accelerating data center AI infrastructure demand and expanding gross margins.",
    why: "Analyst price target upgrades from tier-1 banks often reflect proprietary channel checks — conversations with hyperscaler procurement teams. A $1,000 target implies ~19% upside from current levels.",
    unusual: "This is the 3rd upward PT revision from Morgan Stanley in the past 90 days, suggesting growing conviction. NVDA now has the highest average Wall Street PT of any S&P 500 mega-cap.",
    timestamp: "2026-04-09T08:00:00Z",
    sentiment: "positive",
  },
  {
    id: "e4",
    ticker: "META",
    type: "announcement",
    title: "Meta announces $10B AI infrastructure expansion",
    what: "Meta announced plans to invest an additional $10B in AI data center infrastructure throughout 2026, increasing its full-year capex guidance to $38-40B. The investment targets custom silicon and large-scale GPU clusters.",
    why: "Aggressive capex signals management's conviction that AI will drive meaningful monetization. The scale also creates a moat — smaller ad-tech competitors cannot match this compute investment.",
    unusual: "The $10B incremental commitment is 25% above what analysts had modeled for the full year. Meta's capex-to-revenue ratio would reach its highest level since the early Facebook buildout phase.",
    timestamp: "2026-04-08T14:00:00Z",
    sentiment: "positive",
  },
  {
    id: "e5",
    ticker: "MSFT",
    type: "news",
    title: "Azure AI cloud growth accelerates to 33% YoY",
    what: "Microsoft's Azure cloud platform posted 33% year-over-year growth in the most recent quarter, beating analyst expectations of 29%. AI-related Azure services contributed 7 percentage points of growth.",
    why: "Azure's acceleration matters because it validates Microsoft's $13B+ OpenAI investment thesis. Cloud growth is the primary driver of Microsoft's valuation multiple — faster growth typically leads to multiple expansion.",
    unusual: "The 7pp AI contribution to growth is up from 3pp six months ago, suggesting the AI attach rate is accelerating faster than consensus models anticipated.",
    timestamp: "2026-04-07T17:30:00Z",
    sentiment: "positive",
  },
];

const MOCK_DIGEST: DigestEntry[] = [
  {
    id: "d1",
    ticker: "AAPL",
    stockName: "Apple",
    summary: "Apple beat Q2 earnings by 7.4%, driven by Services revenue of $23.9B — the segment's 6th consecutive quarterly beat. iPhone demand remains resilient.",
    sentiment: "positive",
    timestamp: "2026-04-12T07:00:00Z",
  },
  {
    id: "d2",
    ticker: "TSLA",
    stockName: "Tesla",
    summary: "Tesla's Q1 deliveries fell 13.4% YoY to 337K vehicles, the steepest decline in company history and well below analyst expectations of 371K.",
    sentiment: "negative",
    timestamp: "2026-04-12T07:00:00Z",
  },
  {
    id: "d3",
    ticker: "NVDA",
    stockName: "NVIDIA",
    summary: "Morgan Stanley raised its NVIDIA price target to $1,000, citing data center AI demand. This is the bank's 3rd upward revision in 90 days.",
    sentiment: "positive",
    timestamp: "2026-04-12T07:00:00Z",
  },
  {
    id: "d4",
    ticker: "META",
    stockName: "Meta",
    summary: "Meta expanded its 2026 AI capex guidance by $10B to $38-40B. The scale signals deep conviction in AI monetization but raised capex concerns.",
    sentiment: "neutral",
    timestamp: "2026-04-12T07:00:00Z",
  },
  {
    id: "d5",
    ticker: "MSFT",
    stockName: "Microsoft",
    summary: "Azure AI cloud growth accelerated to 33% YoY, with AI services contributing 7 percentage points — double the rate from six months ago.",
    sentiment: "positive",
    timestamp: "2026-04-12T07:00:00Z",
  },
];

const MOCK_ALERTS: Alert[] = [
  {
    id: "a1",
    ticker: "TSLA",
    stockName: "Tesla",
    type: "gap_down",
    title: "TSLA opened 4.1% lower",
    explanation: "Tesla gapped down at the open following yesterday's delivery miss. Pre-market volume was 3.2x the 30-day average, suggesting institutional repositioning.",
    magnitude: "-4.1%",
    timestamp: "2026-04-10T09:32:00Z",
    read: false,
  },
  {
    id: "a2",
    ticker: "NVDA",
    stockName: "NVIDIA",
    type: "volume_surge",
    title: "NVDA volume 2.8x above average",
    explanation: "Following the Morgan Stanley PT upgrade, NVIDIA traded 2.8x its 30-day average volume. Large volume on upgrades suggests the news resonated with institutional buyers.",
    magnitude: "+2.8x volume",
    timestamp: "2026-04-09T11:00:00Z",
    read: false,
  },
  {
    id: "a3",
    ticker: "AAPL",
    stockName: "Apple",
    type: "gap_up",
    title: "AAPL up 2.2% on earnings beat",
    explanation: "Apple's after-hours earnings beat translated to a pre-market gap-up. The move is modest relative to the magnitude of the earnings surprise, suggesting some investors may have already been positioned.",
    magnitude: "+2.2%",
    timestamp: "2026-04-11T09:30:00Z",
    read: true,
  },
];

const WatchlistContext = createContext<WatchlistContextType | undefined>(undefined);

const STORAGE_KEY = "@stockclarify_watchlist";
const ALERTS_KEY = "@stockclarify_alerts_read";

export function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [watchlist, setWatchlist] = useState<string[]>(["AAPL", "NVDA", "MSFT", "TSLA", "META"]);
  const [readAlerts, setReadAlerts] = useState<Set<string>>(new Set());

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val) {
        try {
          setWatchlist(JSON.parse(val));
        } catch {}
      }
    });
    AsyncStorage.getItem(ALERTS_KEY).then((val) => {
      if (val) {
        try {
          setReadAlerts(new Set(JSON.parse(val)));
        } catch {}
      }
    });
  }, []);

  const saveWatchlist = useCallback((list: string[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }, []);

  const addToWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => {
      if (prev.includes(ticker)) return prev;
      const next = [...prev, ticker];
      saveWatchlist(next);
      return next;
    });
  }, [saveWatchlist]);

  const removeFromWatchlist = useCallback((ticker: string) => {
    setWatchlist((prev) => {
      const next = prev.filter((t) => t !== ticker);
      saveWatchlist(next);
      return next;
    });
  }, [saveWatchlist]);

  const isInWatchlist = useCallback((ticker: string) => watchlist.includes(ticker), [watchlist]);

  const alerts = MOCK_ALERTS.map((a) => ({
    ...a,
    read: readAlerts.has(a.id),
  }));

  const markAlertRead = useCallback((id: string) => {
    setReadAlerts((prev) => {
      const next = new Set(prev);
      next.add(id);
      AsyncStorage.setItem(ALERTS_KEY, JSON.stringify([...next]));
      return next;
    });
  }, []);

  const digest = MOCK_DIGEST.filter((d) => watchlist.includes(d.ticker));
  const events = MOCK_EVENTS.filter((e) => watchlist.includes(e.ticker));

  const unreadAlertCount = alerts.filter((a) => !a.read && watchlist.includes(a.ticker)).length;

  return (
    <WatchlistContext.Provider
      value={{
        watchlist,
        addToWatchlist,
        removeFromWatchlist,
        isInWatchlist,
        stocks: STOCK_DATA,
        events,
        digest,
        alerts: alerts.filter((a) => watchlist.includes(a.ticker)),
        markAlertRead,
        unreadAlertCount,
      }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error("useWatchlist must be used within WatchlistProvider");
  return ctx;
}
