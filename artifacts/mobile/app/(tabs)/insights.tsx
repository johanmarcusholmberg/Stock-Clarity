import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@clerk/expo";
import Svg, { Path, Line } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useDisplayMode } from "@/hooks/useDisplayMode";
import { useMiniCharts } from "@/hooks/useMiniCharts";
import { useBenchmarkSeries, inferBenchmark, benchmarkLabel, type Benchmark } from "@/hooks/useBenchmarkSeries";
import { useWatchlist, Stock } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { useBenchmark } from "@/context/BenchmarkContext";
import { PremiumGate, isFeatureLocked } from "@/components/PremiumGate";
import { PaywallSheet } from "@/components/PaywallSheet";
import { PortfolioPicker } from "@/components/PortfolioPicker";
import { MarketPickerSheet } from "@/components/MarketPickerSheet";
import { ExportSheet, type ExportFormat } from "@/components/ExportSheet";
import { TabHintPopup } from "@/components/TabHintPopup";
import { trackPremiumEvent } from "@/lib/premiumTelemetry";
import { getApiBase } from "../../lib/apiBase";
import {
  alpha,
  beta,
  maxDrawdown,
  sharpeRatio,
  sortinoRatio,
  totalReturn,
  trackingError,
  volatility,
  weightedSeries,
} from "@/lib/portfolioMath";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
type PerfPeriod = "today" | "1w" | "1m";

const API_BASE = getApiBase();

// ─── Dummy preview values ─────────────────────────────────────────────────────
// Hardcoded placeholder numbers shown to non-premium users in the Risk Metrics
// and Benchmarks sections. They must NEVER be derived from a real portfolio —
// the substitution happens before render so the user's actual figures don't
// reach the DOM when the section is locked.

const DUMMY_RISK_PREVIEW = {
  beta: "0.87",
  maxDrawdown: "-8.4%",
  sharpe: "1.24",
  sortino: "1.62",
  vol30: "14.2%",
  vol90: "16.8%",
  vol365: "19.5%",
} as const;

const DUMMY_BENCHMARK_PREVIEW = {
  portfolioReturn: "12.4%",
  benchmarkReturn: "9.1%",
  alpha: "3.30%",
  trackingError: "4.50%",
} as const;

// Synthetic 60-point series — portfolio drifts above benchmark with realistic
// wobble. Deterministic sin/cos so the curves don't change between renders.
const DUMMY_PORTFOLIO_SERIES = Array.from({ length: 60 }, (_, i) =>
  100 + i * 0.21 + Math.sin(i / 3.5) * 1.8,
);
const DUMMY_BENCHMARK_SERIES = Array.from({ length: 60 }, (_, i) =>
  100 + i * 0.14 + Math.cos(i / 4.2) * 1.3,
);

// ─── Helpers (retained from pre-Phase-2 insights screen) ──────────────────────

function getPerformance(stock: Stock, history: number[], period: PerfPeriod): number {
  if (period === "today") return stock.changePercent;
  if (!history || history.length < 2) return stock.changePercent;
  const current = history[history.length - 1];
  const daysBack = period === "1w" ? 5 : 20;
  const past = history[Math.max(0, history.length - 1 - daysBack)];
  if (!past || past === 0) return stock.changePercent;
  return ((current - past) / past) * 100;
}

function getPerformanceAbs(stock: Stock, history: number[], period: PerfPeriod): number {
  if (period === "today") return stock.change;
  if (!history || history.length < 2) return stock.change;
  const current = history[history.length - 1];
  const daysBack = period === "1w" ? 5 : 20;
  const past = history[Math.max(0, history.length - 1 - daysBack)];
  if (!past) return stock.change;
  return current - past;
}

function get52wProximity(stock: Stock, history: number[]): { pctFromHigh: number; pctFromLow: number } {
  if (!history || !history.length) return { pctFromHigh: 0, pctFromLow: 0 };
  const high = Math.max(...history);
  const low = Math.min(...history);
  const current = stock.price;
  const pctFromHigh = high > 0 ? ((current - high) / high) * 100 : 0;
  const pctFromLow = low > 0 ? ((current - low) / low) * 100 : 0;
  return { pctFromHigh, pctFromLow };
}

function SectionHeader({ title, icon, right }: { title: string; icon: FeatherIconName; right?: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 }}>
        {title}
      </Text>
      {right}
    </View>
  );
}

/**
 * Compact benchmark picker chip used inline in the "Portfolio vs ..." and
 * "Risk Metrics" section headers. Tapping it opens the market picker so the
 * surrounding chart/metrics update instantly.
 */
function BenchmarkChip({
  benchmark,
  isAuto,
  onPress,
}: {
  benchmark: Benchmark;
  isAuto: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      activeOpacity={0.7}
      accessibilityLabel={`Change benchmark — currently ${benchmarkLabel(benchmark)}${isAuto ? ", auto-selected" : ""}`}
      accessibilityRole="button"
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.secondary,
      }}
    >
      <Text
        style={{
          color: colors.foreground,
          fontSize: 13,
          fontFamily: "Inter_700Bold",
        }}
        numberOfLines={1}
      >
        {benchmarkLabel(benchmark)}
      </Text>
      {isAuto ? (
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 10,
            fontFamily: "Inter_500Medium",
          }}
        >
          AUTO
        </Text>
      ) : null}
      <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function ColoredChange({
  pct,
  abs,
  currency,
  showPercent,
  style,
}: {
  pct: number;
  abs: number;
  currency?: string;
  showPercent: boolean;
  style?: object;
}) {
  const colors = useColors();
  const metric = showPercent ? pct : abs;
  if (!Number.isFinite(metric)) {
    return (
      <Text style={[{ color: colors.mutedForeground, fontFamily: "Inter_400Regular", fontSize: 13 }, style]}>
        N/A
      </Text>
    );
  }
  const color = metric >= 0 ? colors.positive : colors.negative;
  const sign = metric >= 0 ? "+" : "\u2212";
  const label = showPercent
    ? `${sign}${Math.abs(pct).toFixed(2)}%`
    : `${sign}${currency ? currency + " " : ""}${Math.abs(abs).toFixed(2)}`;
  return (
    <Text style={[{ color, fontFamily: "Inter_600SemiBold", fontSize: 13 }, style]}>
      {label}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const { watchlist, stocks, folders, activeFolderId } = useWatchlist();
  const { tier } = useSubscription();
  const { showPercent, toggle: toggleShowPercent } = useDisplayMode();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [period, setPeriod] = useState<PerfPeriod>("today");
  const [marketPickerVisible, setMarketPickerVisible] = useState(false);
  const [exportSheetVisible, setExportSheetVisible] = useState(false);
  const { selection: benchmarkSelection, resolve: resolveBenchmark } = useBenchmark();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const watchedStocks = useMemo(
    () => watchlist.map((t) => stocks[t]).filter(Boolean) as Stock[],
    [watchlist, stocks],
  );

  const { charts } = useMiniCharts(watchlist);

  const activePortfolioName = activeFolderId === "default"
    ? "Watchlist"
    : folders.find((f) => f.id === activeFolderId)?.name ?? "Watchlist";

  // ─── Computed stats ────────────────────────────────────────────────────────

  const gainers = watchedStocks.filter((s) => s.changePercent >= 0);
  const losers = watchedStocks.filter((s) => s.changePercent < 0);
  const avgChange = watchedStocks.length
    ? watchedStocks.reduce((sum, s) => sum + s.changePercent, 0) / watchedStocks.length
    : 0;
  const avgChangeAbs = watchedStocks.length
    ? watchedStocks.reduce((sum, s) => sum + s.change, 0) / watchedStocks.length
    : 0;
  const portfolioCurrency = watchedStocks.length
    ? watchedStocks.every((s) => s.currency === watchedStocks[0].currency)
      ? watchedStocks[0].currency
      : undefined
    : undefined;

  const sortedByPerf = useMemo(() =>
    [...watchedStocks].sort(
      (a, b) =>
        getPerformance(b, charts[b.ticker] ?? [], period) -
        getPerformance(a, charts[a.ticker] ?? [], period),
    ),
    [watchedStocks, charts, period],
  );
  const bestPerformers = sortedByPerf.slice(0, 3);
  const worstPerformers = [...sortedByPerf].reverse().slice(0, 3);

  const sectorBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of watchedStocks) {
      const sec = s.sector || "Unknown";
      map[sec] = (map[sec] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count, pct: (count / watchedStocks.length) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [watchedStocks]);

  // ─── Portfolio time series + benchmark ─────────────────────────────────────
  // Weights for the portfolio time series are price-weighted at *current*
  // prices and back-applied. This is a deliberate simplification for v1;
  // see premium-gating.md for the rationale.
  const currencies = watchedStocks.map((s) => s.currency);
  const autoBenchmark: Benchmark = useMemo(
    () => inferBenchmark(currencies),
    [currencies.join(",")],
  );
  const benchmark: Benchmark = useMemo(
    () => resolveBenchmark(autoBenchmark),
    [resolveBenchmark, autoBenchmark],
  );
  const benchmarkQuery = useBenchmarkSeries(benchmark);
  const benchmarkPrices = benchmarkQuery.data?.prices ?? [];

  const portfolioSeries = useMemo(() => {
    if (!watchedStocks.length) return [];
    const seriesList: number[][] = [];
    const weights: number[] = [];
    let totalValue = 0;
    for (const s of watchedStocks) {
      const h = charts[s.ticker];
      if (h && h.length > 20 && s.price > 0) {
        seriesList.push(h);
        weights.push(s.price);
        totalValue += s.price;
      }
    }
    if (totalValue === 0) return [];
    const norm = weights.map((w) => w / totalValue);
    return weightedSeries(seriesList, norm);
  }, [watchedStocks, charts]);

  const portfolioTotalReturn = totalReturn(portfolioSeries);
  const benchmarkTotalReturn = totalReturn(benchmarkPrices);
  const portfolioBeta = beta(portfolioSeries, benchmarkPrices);
  const portfolioVol30 = volatility(portfolioSeries, 30);
  const portfolioVol90 = volatility(portfolioSeries, 90);
  const portfolioVol365 = volatility(portfolioSeries, 365);
  const portfolioDD = maxDrawdown(portfolioSeries);
  const portfolioSharpe = sharpeRatio(portfolioSeries);
  const portfolioSortino = sortinoRatio(portfolioSeries);
  const portfolioAlpha = alpha(portfolioSeries, benchmarkPrices);
  const portfolioTrackingError = trackingError(portfolioSeries, benchmarkPrices);

  // Lock state for the two Premium-tier preview sections. When locked we swap
  // in dummy figures below so the real numbers above never render to the DOM.
  const riskLocked = isFeatureLocked(tier, "risk_metrics");
  const benchmarkLocked = isFeatureLocked(tier, "benchmark_comparison");

  // ─── Empty state ───────────────────────────────────────────────────────────
  if (watchedStocks.length === 0) {
    return (
      <View style={[s.fill, { backgroundColor: colors.background }]}>
        <View style={[s.fill, { alignItems: "center", justifyContent: "center", padding: 32, paddingTop: topPadding }]}>
          <View style={{ backgroundColor: colors.card, borderRadius: 40, padding: 16, marginBottom: 16 }}>
            <Feather name="pie-chart" size={36} color={colors.primary} />
          </View>
          <Text style={{ color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>
            No stocks to analyze
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22, marginBottom: 24 }}>
            Add some stocks to your watchlist to see portfolio-level insights here.
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 }}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 15 }}>Browse markets</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const handleExportFormat = async (format: ExportFormat) => {
    if (!userId) return;
    trackPremiumEvent("premium_lock_cta_click", userId, {
      feature: "export_pdf_csv",
      cta: "export",
      format,
    });
    // Map our UI-level format choice to a server URL. The xlsx and pdf paths
    // each have their own endpoint; the three CSV variants share the
    // /portfolio.csv endpoint and only differ by ?delimiter.
    let endpoint: "portfolio.xlsx" | "portfolio.csv" | "portfolio.html";
    let delimiter: string | undefined;
    switch (format) {
      case "xlsx":
        endpoint = "portfolio.xlsx";
        break;
      case "csv-comma":
        endpoint = "portfolio.csv";
        delimiter = "comma";
        break;
      case "csv-semicolon":
        endpoint = "portfolio.csv";
        delimiter = "semicolon";
        break;
      case "csv-tab":
        endpoint = "portfolio.csv";
        delimiter = "tab";
        break;
      case "pdf":
      default:
        endpoint = "portfolio.html";
        break;
    }
    // The export download endpoints can't accept a Bearer header (they're
    // opened by the OS browser via Linking.openURL), so we ask the server
    // for a short-lived HMAC-signed URL first. The /sign endpoint is itself
    // gated by requireSelf, so the userId here is bound to the caller's
    // Clerk session — closing the IDOR that existed when the export URL
    // accepted a raw ?userId= without auth.
    try {
      const res = await authedFetch(`${API_BASE}/export/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          format: endpoint,
          folderId: activeFolderId,
          delimiter,
        }),
      });
      if (!res.ok) {
        console.warn("[export] /sign failed", res.status);
        return;
      }
      const data = (await res.json()) as { url?: string };
      if (!data.url) return;
      // The /sign endpoint returns a path under /api/export/...; resolve it
      // against API_BASE (which already includes /api).
      const absoluteUrl = data.url.startsWith("http")
        ? data.url
        : `${API_BASE.replace(/\/api$/, "")}${data.url}`;
      await Linking.openURL(absoluteUrl);
    } catch (err) {
      console.warn("[export] sign+open failed", err);
    }
  };

  // ─── Main screen ───────────────────────────────────────────────────────────
  return (
    <View style={[s.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        style={s.fill}
        contentContainerStyle={{ paddingTop: topPadding + 16, paddingBottom: bottomPadding, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={{ color: colors.foreground, fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 6 }}>
          Insights
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12, gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <PortfolioPicker />
          </View>
          <TouchableOpacity
            style={[s.changeToggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              toggleShowPercent();
            }}
            accessibilityLabel="Toggle between percent and dollar display"
          >
            <Text style={[s.changeToggleText, { color: showPercent ? colors.primary : colors.mutedForeground }]}>%</Text>
            <View style={[s.changeToggleDivider, { backgroundColor: colors.border }]} />
            <Text style={[s.changeToggleText, { color: !showPercent ? colors.primary : colors.mutedForeground }]}>$</Text>
          </TouchableOpacity>
        </View>

        {/* ── Today's Snapshot (Free — always visible) ────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionHeader title="Today's Snapshot" icon="activity" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
            <View style={[s.snapshotCard, { backgroundColor: colors.secondary }]}>
              <Text style={[s.snapshotLabel, { color: colors.mutedForeground }]}>Gainers</Text>
              <Text style={[s.snapshotValue, { color: colors.positive }]}>{gainers.length}</Text>
            </View>
            <View style={[s.snapshotCard, { backgroundColor: colors.secondary }]}>
              <Text style={[s.snapshotLabel, { color: colors.mutedForeground }]}>Losers</Text>
              <Text style={[s.snapshotValue, { color: colors.negative }]}>{losers.length}</Text>
            </View>
            <View style={[s.snapshotCard, { backgroundColor: colors.secondary }]}>
              <Text style={[s.snapshotLabel, { color: colors.mutedForeground }]}>Avg Δ</Text>
              <Text style={[s.snapshotValue, { color: (showPercent ? avgChange : avgChangeAbs) >= 0 ? colors.positive : colors.negative }]}>
                {showPercent
                  ? `${avgChange >= 0 ? "+" : ""}${avgChange.toFixed(2)}%`
                  : `${avgChangeAbs >= 0 ? "+" : "\u2212"}${portfolioCurrency ? portfolioCurrency + " " : ""}${Math.abs(avgChangeAbs).toFixed(2)}`}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Performance (Pro) ───────────────────────────────────────────── */}
        <PremiumGate
          feature="performance_rankings"
          title="Rank your best & worst"
          pitch="Upgrade to Pro to see daily, weekly, and monthly performance leaders across your portfolio."
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="Performance" icon="trending-up" />

            <View style={{ flexDirection: "row", backgroundColor: colors.secondary, borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
              {(["today", "1w", "1m"] as PerfPeriod[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  style={{
                    flex: 1, paddingVertical: 7, alignItems: "center", borderRadius: 8,
                    backgroundColor: period === p ? colors.primary : "transparent",
                  }}
                  onPress={() => setPeriod(p)}
                >
                  <Text style={{
                    fontSize: 12, fontFamily: "Inter_600SemiBold",
                    color: period === p ? colors.primaryForeground : colors.mutedForeground,
                  }}>
                    {p === "today" ? "Today" : p === "1w" ? "1W" : "1M"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8, letterSpacing: 0.5 }}>BEST</Text>
            {bestPerformers.map((stock, i) => (
              <View key={stock.ticker} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: i < bestPerformers.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.primary, fontFamily: "Inter_700Bold", fontSize: 13, width: 20 }}>#{i + 1}</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 }}>{stock.ticker}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>{stock.name}</Text>
                <ColoredChange
                  pct={getPerformance(stock, charts[stock.ticker] ?? [], period)}
                  abs={getPerformanceAbs(stock, charts[stock.ticker] ?? [], period)}
                  currency={stock.currency}
                  showPercent={showPercent}
                  style={s.perfValue}
                />
              </View>
            ))}

            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 8, letterSpacing: 0.5 }}>WORST</Text>
            {worstPerformers.map((stock, i) => (
              <View key={stock.ticker} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: i < worstPerformers.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.negative, fontFamily: "Inter_700Bold", fontSize: 13, width: 20 }}>#{i + 1}</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 }}>{stock.ticker}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>{stock.name}</Text>
                <ColoredChange
                  pct={getPerformance(stock, charts[stock.ticker] ?? [], period)}
                  abs={getPerformanceAbs(stock, charts[stock.ticker] ?? [], period)}
                  currency={stock.currency}
                  showPercent={showPercent}
                  style={s.perfValue}
                />
              </View>
            ))}
          </View>
        </PremiumGate>

        {/* ── Sector Breakdown (Pro) ──────────────────────────────────────── */}
        <PremiumGate
          feature="sector_breakdown"
          title="Know your sector exposure"
          pitch="Pro unlocks a breakdown of your watchlist by sector so you can spot concentration risk."
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="Sector Breakdown" icon="grid" />
            {sectorBreakdown.map((sec) => (
              <View key={sec.name} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}>{sec.name}</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                    {sec.count} stock{sec.count !== 1 ? "s" : ""} · {sec.pct.toFixed(0)}%
                  </Text>
                </View>
                <View style={{ height: 6, backgroundColor: colors.secondary, borderRadius: 3, overflow: "hidden" }}>
                  <View style={{ height: 6, width: `${sec.pct}%` as `${number}%`, backgroundColor: colors.primary, borderRadius: 3 }} />
                </View>
              </View>
            ))}
          </View>
        </PremiumGate>

        {/* ── 52-Week Proximity (Pro) ─────────────────────────────────────── */}
        <PremiumGate
          feature="fifty_two_week_range"
          title="See where each holding trades"
          pitch="Pro shows how close each stock is to its 52-week high and low."
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="52-Week Range Proximity" icon="maximize-2" />
            {watchedStocks.map((stock) => {
              const { pctFromHigh, pctFromLow } = get52wProximity(stock, charts[stock.ticker] ?? []);
              const range = pctFromLow - pctFromHigh;
              const progress = range !== 0 ? pctFromLow / range : 0.5;
              return (
                <View key={stock.ticker} style={{ marginBottom: 12 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                    <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold" }}>{stock.ticker}</Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                        {pctFromLow >= 0 ? "+" : ""}{pctFromLow.toFixed(1)}% from low
                      </Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>
                        {pctFromHigh.toFixed(1)}% from high
                      </Text>
                    </View>
                  </View>
                  <View style={{ height: 6, backgroundColor: colors.secondary, borderRadius: 3, overflow: "hidden" }}>
                    <View style={{
                      height: 6,
                      width: `${Math.min(100, Math.max(0, progress * 100))}%` as `${number}%`,
                      backgroundColor: pctFromHigh > -5 ? colors.positive : pctFromLow < 10 ? colors.negative : colors.primary,
                      borderRadius: 3,
                    }} />
                  </View>
                </View>
              );
            })}
          </View>
        </PremiumGate>

        {/* ── Risk Metrics (Premium) ──────────────────────────────────────── */}
        <PremiumGate
          feature="risk_metrics"
          title="Risk metrics you can trust"
          pitch="Premium unlocks beta, volatility at 30/90/365 days, max drawdown, Sharpe and Sortino — all computed across your portfolio."
          previewMode="muted-preview"
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader
              title="Risk Metrics"
              icon="shield"
              right={
                <BenchmarkChip
                  benchmark={benchmark}
                  isAuto={benchmarkSelection === "auto"}
                  onPress={() => setMarketPickerVisible(true)}
                />
              }
            />
            <View style={s.grid}>
              <RiskStat
                label="Beta vs"
                sub={benchmarkLabel(benchmark)}
                value={riskLocked ? DUMMY_RISK_PREVIEW.beta : portfolioBeta.toFixed(2)}
              />
              <RiskStat
                label="Max drawdown"
                value={riskLocked ? DUMMY_RISK_PREVIEW.maxDrawdown : `${(portfolioDD * 100).toFixed(1)}%`}
                color={colors.negative}
              />
              <RiskStat
                label="Sharpe"
                value={riskLocked ? DUMMY_RISK_PREVIEW.sharpe : portfolioSharpe.toFixed(2)}
              />
              <RiskStat
                label="Sortino"
                value={
                  riskLocked
                    ? DUMMY_RISK_PREVIEW.sortino
                    : Number.isFinite(portfolioSortino)
                    ? portfolioSortino.toFixed(2)
                    : "—"
                }
              />
            </View>
            <View style={{ height: 12 }} />
            <Text style={s.riskSection}>VOLATILITY (ANNUALISED)</Text>
            <View style={s.grid}>
              <RiskStat
                label="30-day"
                value={riskLocked ? DUMMY_RISK_PREVIEW.vol30 : `${(portfolioVol30 * 100).toFixed(1)}%`}
              />
              <RiskStat
                label="90-day"
                value={riskLocked ? DUMMY_RISK_PREVIEW.vol90 : `${(portfolioVol90 * 100).toFixed(1)}%`}
              />
              <RiskStat
                label="365-day"
                value={riskLocked ? DUMMY_RISK_PREVIEW.vol365 : `${(portfolioVol365 * 100).toFixed(1)}%`}
              />
            </View>
          </View>
        </PremiumGate>

        {/* ── Benchmark Comparison (Premium) ──────────────────────────────── */}
        <PremiumGate
          feature="benchmark_comparison"
          title="Benchmark your portfolio"
          pitch={`See how your holdings stack up against the ${benchmarkLabel(benchmark)} — total return, alpha, and tracking error.`}
          previewMode="muted-preview"
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Title + inline benchmark picker. Tapping the chip opens the
                market picker; the chart and stat tiles below update instantly
                when a new market is chosen. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4, flexWrap: "wrap" }}>
              <Feather name="activity" size={16} color={colors.primary} />
              <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>
                Portfolio vs
              </Text>
              <BenchmarkChip
                benchmark={benchmark}
                isAuto={benchmarkSelection === "auto"}
                onPress={() => setMarketPickerVisible(true)}
              />
            </View>
            <TwoLineSparkline
              a={benchmarkLocked ? DUMMY_PORTFOLIO_SERIES : portfolioSeries}
              b={benchmarkLocked ? DUMMY_BENCHMARK_SERIES : benchmarkPrices}
              colorA={colors.primary}
              colorB={colors.mutedForeground}
            />
            <View style={{ flexDirection: "row", gap: 14, marginTop: 12, marginBottom: 6 }}>
              <Legend dotColor={colors.primary} label={activePortfolioName} />
              <Legend dotColor={colors.mutedForeground} label={benchmarkLabel(benchmark)} />
            </View>
            <View style={s.grid}>
              <RiskStat
                label={`1Y return (${activePortfolioName})`}
                value={
                  benchmarkLocked
                    ? DUMMY_BENCHMARK_PREVIEW.portfolioReturn
                    : `${(portfolioTotalReturn * 100).toFixed(1)}%`
                }
                color={
                  benchmarkLocked || portfolioTotalReturn >= 0 ? colors.positive : colors.negative
                }
              />
              <RiskStat
                label={`1Y return (${benchmarkLabel(benchmark)})`}
                value={
                  benchmarkLocked
                    ? DUMMY_BENCHMARK_PREVIEW.benchmarkReturn
                    : `${(benchmarkTotalReturn * 100).toFixed(1)}%`
                }
                color={
                  benchmarkLocked || benchmarkTotalReturn >= 0 ? colors.positive : colors.negative
                }
              />
              <RiskStat
                label="Alpha"
                value={
                  benchmarkLocked
                    ? DUMMY_BENCHMARK_PREVIEW.alpha
                    : `${(portfolioAlpha * 100).toFixed(2)}%`
                }
              />
              <RiskStat
                label="Tracking error"
                value={
                  benchmarkLocked
                    ? DUMMY_BENCHMARK_PREVIEW.trackingError
                    : `${(portfolioTrackingError * 100).toFixed(2)}%`
                }
              />
            </View>
            <Text style={s.footnote}>
              Computed using current-weight back-applied returns. Rebalancing history is not tracked in v1.
            </Text>
          </View>
        </PremiumGate>

        {/* ── Export (Premium) ────────────────────────────────────────────── */}
        <PremiumGate
          feature="export_pdf_csv"
          title="Export your portfolio"
          pitch="Premium lets you download a CSV or printable HTML snapshot — share with an advisor or save for your records."
          previewReal={false}
          style={{ marginTop: 14 }}
        >
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SectionHeader title="Export" icon="download" />
            <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 14, lineHeight: 19 }}>
              Download a snapshot of the <Text style={{ fontFamily: "Inter_600SemiBold" }}>{activePortfolioName}</Text> portfolio with current prices. Choose Excel for a formatted workbook, CSV for raw data, or PDF for a printable report.
            </Text>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setExportSheetVisible(true);
              }}
              accessibilityLabel="Choose an export format"
              accessibilityRole="button"
              style={[s.exportBtn, { backgroundColor: colors.primary }]}
            >
              <Feather name="download" size={16} color={colors.primaryForeground} />
              <Text style={[s.exportBtnText, { color: colors.primaryForeground }]}>
                Choose format…
              </Text>
            </TouchableOpacity>
          </View>
        </PremiumGate>
      </ScrollView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} triggerReason="general" currentTier={tier} />
      <MarketPickerSheet
        visible={marketPickerVisible}
        onClose={() => setMarketPickerVisible(false)}
        autoFallback={autoBenchmark}
      />
      <ExportSheet
        visible={exportSheetVisible}
        onClose={() => setExportSheetVisible(false)}
        portfolioName={activePortfolioName}
        onPick={handleExportFormat}
      />
      <TabHintPopup
        tabKey="insights"
        hint="Insights shows portfolio-level analytics. Pro unlocks performance, sector and 52-week data; Premium adds risk metrics, benchmark comparison, and export."
      />
    </View>
  );
}

// ─── Small presentational components ──────────────────────────────────────────

function RiskStat({
  label,
  sub,
  value,
  color,
}: {
  label: string;
  sub?: string;
  value: string;
  color?: string;
}) {
  const colors = useColors();
  return (
    <View style={[s.riskStat, { backgroundColor: colors.secondary }]}>
      <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" }}>
        {label}
      </Text>
      {sub ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 10, fontFamily: "Inter_400Regular", marginBottom: 2 }}>
          {sub}
        </Text>
      ) : null}
      <Text
        style={{
          color: color ?? colors.foreground,
          fontSize: 18,
          fontFamily: "Inter_700Bold",
          fontVariant: ["tabular-nums"],
          marginTop: 2,
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function Legend({ dotColor, label }: { dotColor: string; label: string }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dotColor }} />
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_500Medium" }}>{label}</Text>
    </View>
  );
}

function TwoLineSparkline({
  a,
  b,
  colorA,
  colorB,
}: {
  a: number[];
  b: number[];
  colorA: string;
  colorB: string;
}) {
  const width = 320;
  const height = 120;
  const n = Math.min(a.length, b.length);
  if (n < 2) {
    return <View style={{ height, alignItems: "center", justifyContent: "center" }} />;
  }
  const ta = a.slice(a.length - n);
  const tb = b.slice(b.length - n);
  // Normalise both series to a 100-index at t=0 so they're comparable.
  const normA = ta.map((p) => (ta[0] > 0 ? (p / ta[0]) * 100 : 0));
  const normB = tb.map((p) => (tb[0] > 0 ? (p / tb[0]) * 100 : 0));
  const vals = [...normA, ...normB];
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const span = max - min || 1;

  const toPath = (series: number[]) => {
    return series
      .map((v, i) => {
        const x = (i / (n - 1)) * width;
        const y = height - ((v - min) / span) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  };

  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
      <Line x1={0} y1={height - ((100 - min) / span) * height} x2={width} y2={height - ((100 - min) / span) * height} stroke={colorB} strokeDasharray="3 4" strokeWidth={0.5} opacity={0.6} />
      <Path d={toPath(normB)} stroke={colorB} strokeWidth={1.5} fill="none" />
      <Path d={toPath(normA)} stroke={colorA} strokeWidth={2} fill="none" />
    </Svg>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
  changeToggle: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, overflow: "hidden", alignSelf: "flex-start" },
  changeToggleText: { fontSize: 12, fontFamily: "Inter_700Bold", paddingHorizontal: 10, paddingVertical: 6 },
  changeToggleDivider: { width: 1, height: "100%" },
  snapshotCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 10,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  snapshotLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  snapshotValue: { fontSize: 20, fontFamily: "Inter_700Bold", fontVariant: ["tabular-nums"] },
  riskStat: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  riskSection: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 8, color: "#888" },
  footnote: { marginTop: 10, fontSize: 11, fontFamily: "Inter_400Regular", color: "#777", lineHeight: 16 },
  exportBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
  },
  exportBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  // Anchored value column for the Performance section. minWidth prevents the
  // adjacent name/ticker columns from shifting when the user toggles between
  // % and currency rendering, since the label width changes between the two.
  perfValue: { minWidth: 88, textAlign: "right", fontVariant: ["tabular-nums"] },
});
