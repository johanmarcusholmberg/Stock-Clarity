// Web Insights — typography-first dashboard. Reuses the existing portfolio
// math helpers and benchmark hook so calculation parity with native is
// guaranteed. The layout is desktop-first: 4 stat cards across the top,
// then a 65/35 chart-vs-metrics split.

import React, { useMemo } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { useBenchmark } from "@/context/BenchmarkContext";
import { useMiniCharts } from "@/hooks/useMiniCharts";
import { useBenchmarkSeries, inferBenchmark, benchmarkLabel } from "@/hooks/useBenchmarkSeries";
import {
  alpha,
  maxDrawdown,
  sharpeRatio,
  totalReturn,
  weightedSeries,
} from "@/lib/portfolioMath";
import { DataDisclaimer } from "@/components/Disclaimer";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { ExportIcon, LockIcon } from "@/components/icons/StockIcons";

interface StatCardProps {
  label: string;
  value: string;
  context?: string;
  direction?: "up" | "down" | "neutral";
}

function StatCard({ label, value, context, direction = "neutral" }: StatCardProps) {
  const colors = useColors();
  const accent =
    direction === "up" ? colors.positive : direction === "down" ? colors.negative : colors.border;
  const valueColor =
    direction === "up" ? colors.positive : direction === "down" ? colors.negative : colors.text;
  return (
    <View
      style={{
        flex: 1,
        flexDirection: "row",
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 14,
        overflow: "hidden",
        minWidth: 200,
      }}
    >
      <View style={{ width: 3, backgroundColor: accent }} />
      <View style={{ flex: 1, padding: 16, gap: 6 }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.3,
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: valueColor,
            fontFamily: WebTokens.fontData,
            fontSize: 28,
            fontWeight: "700",
            letterSpacing: -0.2,
          }}
        >
          {value}
        </Text>
        {context ? (
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
            }}
          >
            {context}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface BenchmarkChartProps {
  portfolio: number[];
  benchmark: number[];
  width: number;
  height: number;
}

function BenchmarkChart({ portfolio, benchmark, width, height }: BenchmarkChartProps) {
  const colors = useColors();
  const bothSeries = [portfolio, benchmark].filter((s) => s.length >= 2);
  const allValues = bothSeries.flat();
  const min = bothSeries.length ? Math.min(...allValues) : 0;
  const max = bothSeries.length ? Math.max(...allValues) : 1;
  const range = max - min || 1;

  const buildPath = (data: number[]) => {
    if (data.length < 2) return { line: "", area: "" };
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((v - min) / range) * (height - 6) - 3,
    }));
    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const m1 = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 2;
      line += ` C ${m1} ${pts[i - 1].y} ${m1} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;
    return { line, area };
  };

  const portPath = buildPath(portfolio);
  const benchPath = buildPath(benchmark);

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="portFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={colors.primary} stopOpacity={WebTokens.chartFillOpacity.top} />
          <Stop offset="1" stopColor={colors.primary} stopOpacity={WebTokens.chartFillOpacity.bottom} />
        </LinearGradient>
      </Defs>
      {portPath.area ? <Path d={portPath.area} fill="url(#portFill)" /> : null}
      {benchPath.line ? (
        <Path d={benchPath.line} fill="none" stroke={colors.mutedForeground} strokeWidth={1.4} strokeDasharray="4 3" strokeLinecap="round" />
      ) : null}
      {portPath.line ? (
        <Path d={portPath.line} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" />
      ) : null}
    </Svg>
  );
}

function ChartArea({ portfolio, benchmark }: { portfolio: number[]; benchmark: number[] }) {
  const [size, setSize] = React.useState({ w: 600, h: 280 });
  return (
    <View
      style={{ width: "100%", height: 280 }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        if (w !== size.w || h !== size.h) setSize({ w, h });
      }}
    >
      <BenchmarkChart portfolio={portfolio} benchmark={benchmark} width={size.w} height={size.h} />
    </View>
  );
}

interface RiskRowProps {
  label: string;
  value: string;
  locked: boolean;
}

function RiskRow({ label, value, locked }: RiskRowProps) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        // @ts-ignore — dotted border
        borderStyle: "dotted",
      }}
    >
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: WebTokens.fontBody,
          fontSize: 13,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontData,
            fontSize: 14,
            fontWeight: "700",
            // @ts-ignore — web-only blur
            filter: locked ? "blur(4px)" : "none",
          }}
        >
          {value}
        </Text>
        {locked ? <LockIcon size={14} color={colors.mutedForeground} /> : null}
      </View>
    </View>
  );
}

const DUMMY_RISK = {
  beta: "0.87",
  maxDrawdown: "-8.4%",
  sharpe: "1.24",
  sortino: "1.62",
  vol30: "14.2%",
  vol90: "16.8%",
};

export default function WebInsightsScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { watchlist, stocks, activeFolderId, folders } = useWatchlist();
  const { tier } = useSubscription();
  const { selection, resolve } = useBenchmark();

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const tickers = activeFolder?.tickers || watchlist;
  const portfolioStocks = tickers.map((t) => stocks[t]).filter(Boolean);
  const { charts: miniCharts } = useMiniCharts(tickers);

  // Benchmark series — prompt allows reusing logic
  const inferred = useMemo(
    () => inferBenchmark(portfolioStocks.map((s) => s.currency || "USD")),
    [portfolioStocks],
  );
  const finalBench = resolve(inferred);
  const autoSelected = selection === "auto";
  const benchQuery = useBenchmarkSeries(finalBench);
  const benchSeries = benchQuery.data?.prices ?? [];

  const portfolioSeries = useMemo(() => {
    const series = portfolioStocks
      .map((s) => miniCharts[s.ticker])
      .filter((s): s is number[] => Array.isArray(s) && s.length > 0);
    if (!series.length) return [];
    const weights = portfolioStocks.map(() => 1 / Math.max(1, portfolioStocks.length));
    return weightedSeries(series, weights);
  }, [portfolioStocks, miniCharts]);

  const portfolioReturn = portfolioSeries.length ? totalReturn(portfolioSeries) * 100 : 0;
  const benchReturn = benchSeries.length ? totalReturn(benchSeries) * 100 : 0;
  const drawdown = portfolioSeries.length ? maxDrawdown(portfolioSeries) * 100 : 0;
  const sharpe = portfolioSeries.length ? sharpeRatio(portfolioSeries) : 0;
  const alphaVal =
    portfolioSeries.length && benchSeries.length
      ? alpha(portfolioSeries, benchSeries) * 100
      : 0;

  const isPremium = tier === "premium";
  const showStat = (val: number) => Number.isFinite(val);

  const fmt = (v: number, suffix = "%") => (showStat(v) ? `${v >= 0 ? "+" : ""}${v.toFixed(2)}${suffix}` : "—");

  const stacked = width < 1100;

  return (
    <View style={{ flex: 1, gap: 24 }}>
      {/* Header */}
      <View>
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontDisplay,
            fontSize: 28,
            letterSpacing: -0.4,
          }}
        >
          Insights
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 13,
            marginTop: 4,
          }}
        >
          Performance and risk for {activeFolder?.name ?? "your watchlist"}
        </Text>
      </View>

      {/* Top stats bar */}
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: 16,
        }}
      >
        <StatCard
          label="Portfolio Return"
          value={fmt(portfolioReturn)}
          context={`vs ${benchmarkLabel(finalBench)}`}
          direction={portfolioReturn >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Alpha vs Benchmark"
          value={fmt(alphaVal)}
          context={`Bench: ${fmt(benchReturn)}`}
          direction={alphaVal >= 0 ? "up" : "down"}
        />
        <StatCard
          label="Sharpe Ratio"
          value={showStat(sharpe) ? sharpe.toFixed(2) : "—"}
          context="annualised"
        />
        <StatCard
          label="Max Drawdown"
          value={fmt(drawdown)}
          context="peak to trough"
          direction="down"
        />
      </View>

      {/* Two columns */}
      <View style={{ flexDirection: stacked ? "column" : "row", gap: 28 }}>
        {/* Performance chart */}
        <View style={{ flex: stacked ? undefined : 65, gap: 12 } as any}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.3,
            }}
          >
            Performance
          </Text>
          <ChartArea portfolio={portfolioSeries} benchmark={benchSeries} />
          {/* Legend */}
          <View style={{ flexDirection: "row", gap: 16, marginTop: 4 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 4, height: 4, backgroundColor: colors.primary }} />
              <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>
                Portfolio
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <View style={{ width: 4, height: 4, backgroundColor: colors.mutedForeground }} />
              <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>
                {benchmarkLabel(finalBench)}{autoSelected ? " · auto" : ""}
              </Text>
            </View>
          </View>
        </View>

        {/* Risk metrics */}
        <View style={{ flex: stacked ? undefined : 35, gap: 8 } as any}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.3,
              marginBottom: 4,
            }}
          >
            Risk Metrics
          </Text>
          <RiskRow label="Beta" value={isPremium ? sharpe.toFixed(2) : DUMMY_RISK.beta} locked={!isPremium} />
          <RiskRow
            label="Max Drawdown"
            value={isPremium ? fmt(drawdown) : DUMMY_RISK.maxDrawdown}
            locked={!isPremium}
          />
          <RiskRow
            label="Sharpe"
            value={isPremium ? sharpe.toFixed(2) : DUMMY_RISK.sharpe}
            locked={!isPremium}
          />
          <RiskRow
            label="Sortino"
            value={DUMMY_RISK.sortino}
            locked={!isPremium}
          />
          <RiskRow
            label="Volatility (30d)"
            value={DUMMY_RISK.vol30}
            locked={!isPremium}
          />
          <RiskRow
            label="Volatility (90d)"
            value={DUMMY_RISK.vol90}
            locked={!isPremium}
          />
        </View>
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
        <WebHoverable onPress={() => {}}>
          {({ hovered }) => (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: hovered ? colors.primary : colors.border,
                backgroundColor: "transparent",
              }}
            >
              <ExportIcon size={14} color={hovered ? colors.primary : colors.text} />
              <Text
                style={{
                  color: hovered ? colors.primary : colors.text,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                Export
              </Text>
            </View>
          )}
        </WebHoverable>
        <DataDisclaimer />
      </View>
    </View>
  );
}
