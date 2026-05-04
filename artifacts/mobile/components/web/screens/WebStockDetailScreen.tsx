// Web stock detail page — two-column layout that replaces the native
// vertical scroller. All data hooks are reused from the existing screen so
// only the layout differs.

import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { useAlerts } from "@/context/AlertsContext";
import { useMultiRangeChart } from "@/hooks/useMultiRangeChart";
import { CHART_RANGES, exchangeToFlag, getEvents, type StockEvent } from "@/services/stockApi";
import { isMarketOpenWithBuffer } from "@/utils/marketHours";
import ReportSummary from "@/components/ReportSummary";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { useWebKeyboard } from "@/hooks/useWebKeyboard";
import { formatChangePctWeb, formatTimeAgoWeb } from "@/components/web/webFormat";

interface Props {
  ticker: string;
}

type RangeIdx = number;
type SectionTab = "overview" | "news" | "reports" | "alerts";

interface TypoTabProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function TypoTab({ label, active, onPress }: TypoTabProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            paddingVertical: 6,
            paddingHorizontal: 4,
            borderBottomWidth: 2,
            borderBottomColor: active ? colors.primary : "transparent",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <Text
            style={{
              color: active ? colors.text : hovered ? colors.text : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: active ? "600" : "400",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

interface AreaChartProps {
  data: number[];
  width: number;
  height: number;
  positive: boolean;
}

function AreaChart({ data, width, height, positive }: AreaChartProps) {
  const colors = useColors();
  const fillColor = positive ? colors.positive : colors.negative;
  const path = useMemo(() => {
    if (!data || data.length < 2) return { line: "", area: "" };
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * width,
      y: height - ((v - min) / range) * (height - 4) - 2,
    }));
    let line = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const m1 = pts[i - 1].x + (pts[i].x - pts[i - 1].x) / 2;
      line += ` C ${m1} ${pts[i - 1].y} ${m1} ${pts[i].y} ${pts[i].x} ${pts[i].y}`;
    }
    const area = `${line} L ${width} ${height} L 0 ${height} Z`;
    return { line, area };
  }, [data, width, height]);

  if (!path.line) {
    return (
      <View
        style={{ width, height, backgroundColor: colors.muted, borderRadius: 10 }}
      />
    );
  }
  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="webDetailFill" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={fillColor} stopOpacity={WebTokens.chartFillOpacity.top} />
          <Stop offset="1" stopColor={fillColor} stopOpacity={WebTokens.chartFillOpacity.bottom} />
        </LinearGradient>
      </Defs>
      <Path d={path.area} fill="url(#webDetailFill)" />
      <Path d={path.line} fill="none" stroke={fillColor} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

interface MetricCellProps {
  label: string;
  value: string;
  rangeBar?: { current: number; low: number; high: number };
}

function MetricCell({ label, value, rangeBar }: MetricCellProps) {
  const colors = useColors();
  const pct =
    rangeBar && rangeBar.high > rangeBar.low
      ? Math.min(1, Math.max(0, (rangeBar.current - rangeBar.low) / (rangeBar.high - rangeBar.low)))
      : 0;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.muted,
        borderRadius: 10,
        padding: 12,
        gap: 6,
      }}
    >
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
          color: colors.text,
          fontFamily: WebTokens.fontData,
          fontSize: 15,
          fontWeight: "700",
        }}
      >
        {value}
      </Text>
      {rangeBar ? (
        <View
          style={{
            height: 3,
            borderRadius: 2,
            backgroundColor: colors.border,
            overflow: "hidden",
            marginTop: 2,
          }}
        >
          <View
            style={{
              width: `${pct * 100}%`,
              height: "100%",
              backgroundColor: colors.primary,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

function OverviewTab({ ticker }: { ticker: string }) {
  const colors = useColors();
  const { stocks } = useWatchlist();
  const stock = stocks[ticker];
  const summary =
    stock?.description ||
    "An AI summary of the most relevant context for this ticker will appear here when available.";

  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          backgroundColor: colors.muted,
          borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          padding: 16,
          borderRadius: 6,
        }}
      >
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.3,
            marginBottom: 8,
          }}
        >
          AI Summary
        </Text>
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontBody,
            fontSize: 13,
            lineHeight: 21,
          }}
        >
          {summary}
        </Text>
      </View>
      <View style={{ gap: 4 }}>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.3,
            marginBottom: 6,
          }}
        >
          Recent Events
        </Text>
        <RecentEventsList ticker={ticker} compact />
      </View>
    </View>
  );
}

function RecentEventsList({ ticker, compact = false }: { ticker: string; compact?: boolean }) {
  const colors = useColors();
  const [events, setEvents] = useState<StockEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getEvents(ticker, "week")
      .then((e) => {
        if (alive) {
          setEvents(e);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (loading) {
    return (
      <View style={{ paddingVertical: 16 }}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
    );
  }
  if (!events || events.length === 0) {
    return (
      <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>
        No recent events.
      </Text>
    );
  }
  const list = compact ? events.slice(0, 5) : events;
  return (
    <View>
      {list.map((e, i) => (
        <View
          key={e.id}
          style={{
            paddingVertical: 12,
            borderTopWidth: i === 0 ? 0 : 1,
            borderTopColor: colors.border,
            flexDirection: compact ? "row" : "column",
            alignItems: compact ? "flex-start" : "stretch",
            gap: 12,
          }}
        >
          {compact ? (
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontData,
                fontSize: 11,
                width: 60,
                paddingTop: 2,
              }}
            >
              {new Date(e.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            </Text>
          ) : null}
          <View style={{ flex: 1 }}>
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontBody,
                fontSize: 13,
                fontWeight: "600",
                marginBottom: 4,
              }}
              numberOfLines={2}
            >
              {e.title}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontBody,
                fontSize: 12,
                lineHeight: 18,
              }}
              numberOfLines={2}
            >
              {e.what}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function NewsRow({ event }: { event: StockEvent }) {
  const colors = useColors();
  const sentimentColor =
    event.sentiment === "positive"
      ? colors.positive
      : event.sentiment === "negative"
        ? colors.negative
        : colors.mutedForeground;
  return (
    <WebHoverable onPress={() => {}}>
      {({ hovered }) => (
        <View
          style={{
            paddingVertical: 14,
            paddingHorizontal: 12,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: hovered ? colors.muted : "transparent",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Text
              style={{ color: sentimentColor, fontSize: 14 }}
              accessibilityElementsHidden
            >
              ●
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontBody,
                fontSize: 11,
              }}
            >
              {event.publisher} · {formatTimeAgoWeb(event.timestamp)}
            </Text>
          </View>
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontBody,
              fontSize: 14,
              fontWeight: "700",
              marginBottom: 4,
            }}
            numberOfLines={2}
          >
            {event.title}
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              lineHeight: 19,
            }}
            numberOfLines={2}
          >
            {event.what}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

function NewsTab({ ticker }: { ticker: string }) {
  const colors = useColors();
  const [events, setEvents] = useState<StockEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    getEvents(ticker, "month")
      .then((e) => {
        if (alive) {
          setEvents(e);
          setLoading(false);
        }
      })
      .catch(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [ticker]);

  if (loading) {
    return <ActivityIndicator color={colors.primary} size="small" style={{ marginTop: 16 }} />;
  }
  if (!events || events.length === 0) {
    return (
      <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
        No news yet.
      </Text>
    );
  }
  return (
    <View>
      {events.map((e) => (
        <NewsRow key={e.id} event={e} />
      ))}
    </View>
  );
}

function AlertsInlinePanel({ ticker }: { ticker: string }) {
  const colors = useColors();
  const { createAlert, getAlertsForSymbol } = useAlerts();
  const { stocks } = useWatchlist();
  const stock = stocks[ticker];
  const [direction, setDirection] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState(stock ? String(stock.price.toFixed(2)) : "");
  const existing = getAlertsForSymbol(ticker);

  const handleSave = () => {
    const value = Number(threshold);
    if (!Number.isFinite(value) || value <= 0) return;
    createAlert({ symbol: ticker, type: direction === "above" ? "price_above" : "price_below", threshold: value });
  };

  return (
    <View style={{ gap: 16 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Pressable
          onPress={() => setDirection("above")}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: direction === "above" ? colors.positive : colors.border,
            backgroundColor: direction === "above" ? `${colors.positive}1A` : "transparent",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: direction === "above" ? colors.positive : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Above
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setDirection("below")}
          style={{
            flex: 1,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: direction === "below" ? colors.negative : colors.border,
            backgroundColor: direction === "below" ? `${colors.negative}1A` : "transparent",
            alignItems: "center",
          }}
        >
          <Text
            style={{
              color: direction === "below" ? colors.negative : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            Below
          </Text>
        </Pressable>
      </View>
      <View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 11,
            textTransform: "uppercase",
            letterSpacing: 1.3,
            marginBottom: 6,
          }}
        >
          Threshold
        </Text>
        <TextInput
          value={threshold}
          onChangeText={setThreshold}
          keyboardType="decimal-pad"
          placeholder="0.00"
          placeholderTextColor={colors.mutedForeground}
          style={
            {
              color: colors.text,
              fontFamily: WebTokens.fontData,
              fontSize: 18,
              paddingVertical: 12,
              paddingHorizontal: 14,
              borderRadius: 10,
              backgroundColor: colors.muted,
              borderWidth: 1,
              borderColor: colors.border,
              outlineStyle: "none",
            } as any
          }
        />
      </View>
      <Pressable
        onPress={handleSave}
        style={{
          paddingVertical: 11,
          borderRadius: 10,
          backgroundColor: colors.primary,
          alignItems: "center",
        }}
      >
        <Text
          style={{
            color: colors.primaryForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 14,
            fontWeight: "600",
          }}
        >
          Save Alert
        </Text>
      </Pressable>
      {existing.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 11,
              textTransform: "uppercase",
              letterSpacing: 1.3,
              marginTop: 6,
            }}
          >
            Active Alerts
          </Text>
          {existing.map((a) => (
            <View key={a.id} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 8 }}>
              <Text style={{ color: colors.text, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
                {a.type === "price_above" ? "Above" : a.type === "price_below" ? "Below" : "% Day"}
              </Text>
              <Text style={{ color: colors.text, fontFamily: WebTokens.fontData, fontSize: 13 }}>
                {a.threshold.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function WebStockDetailScreen({ ticker }: Props) {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { stocks } = useWatchlist();
  const stock = stocks[ticker];
  const [rangeIdx, setRangeIdx] = useState<RangeIdx>(4); // 1Y default
  const [mode, setMode] = useState<"price" | "percent">("price");
  const [tab, setTab] = useState<SectionTab>("overview");

  // Back keyboard shortcut
  useWebKeyboard({ backOnArrowLeft: true });

  const marketOpen = stock?.exchange ? isMarketOpenWithBuffer(stock.exchange, 5) : false;
  const { data: chartData, lastUpdatedAt } = useMultiRangeChart(ticker, { autoRefresh: marketOpen });
  const currentChart = chartData[rangeIdx];

  const isPositive = (stock?.change ?? 0) >= 0;
  const accent = isPositive ? colors.positive : colors.negative;

  const stacked = width < 900;
  const leftWidth = stacked ? "100%" : ("62%" as any);
  const rightWidth = stacked ? "100%" : ("38%" as any);

  const flag = stock?.exchange ? exchangeToFlag(stock.exchange) : "";

  const seriesForChart = useMemo(() => {
    if (!currentChart) return [];
    if (mode === "price") return currentChart.prices;
    if (!currentChart.previousClose) return currentChart.prices;
    return currentChart.prices.map((p) => ((p - currentChart.previousClose!) / currentChart.previousClose!) * 100);
  }, [currentChart, mode]);

  const fiftyTwo = useMemo(() => {
    const series = chartData[4]?.prices;
    if (!series || series.length < 2) return null;
    return { low: Math.min(...series), high: Math.max(...series) };
  }, [chartData]);

  if (!stock) {
    return (
      <View style={{ paddingTop: 60, alignItems: "center" }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, gap: 24 }}>
      {/* Breadcrumb */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Pressable onPress={() => router.push("/(tabs)" as any)}>
          <Text style={{ color: colors.primary, fontFamily: WebTokens.fontBody, fontSize: 12 }}>Home</Text>
        </Pressable>
        <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>›</Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>{ticker}</Text>
      </View>

      <View style={{ flexDirection: stacked ? "column" : "row", gap: 32 }}>
        {/* Left column */}
        <View style={{ width: leftWidth, gap: 24 } as any}>
          {/* Stock header */}
          <View>
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontData,
                fontSize: 36,
                fontWeight: "700",
                letterSpacing: -1,
              }}
            >
              {ticker}
            </Text>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontBody,
                fontSize: 16,
                marginTop: 2,
              }}
            >
              {stock.name}
            </Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
              {flag ? <Text style={{ fontSize: 16 }}>{flag}</Text> : null}
              <Text
                style={{
                  color: marketOpen ? colors.positive : colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 13,
                  fontWeight: "500",
                }}
              >
                ● {marketOpen ? "Open" : "Closed"}
              </Text>
              {stock.exchange ? (
                <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
                  · {stock.exchange}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Price block */}
          <View>
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontData,
                fontSize: 42,
                fontWeight: "700",
                letterSpacing: -0.5,
              }}
            >
              {stock.price.toFixed(2)}
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 16,
                  fontWeight: "400",
                }}
              >
                {" "}
                {stock.currency}
              </Text>
            </Text>
            <View style={{ flexDirection: "row", gap: 14, alignItems: "baseline", marginTop: 4 }}>
              <Text
                style={{
                  color: accent,
                  fontFamily: WebTokens.fontData,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                {isPositive ? "+" : "−"}
                {Math.abs(stock.change).toFixed(2)}
              </Text>
              <Text
                style={{
                  color: accent,
                  fontFamily: WebTokens.fontData,
                  fontSize: 18,
                  fontWeight: "700",
                }}
              >
                ({formatChangePctWeb(stock.changePercent)})
              </Text>
            </View>
            <Text
              style={{
                color: colors.mutedForeground,
                fontFamily: WebTokens.fontBody,
                fontSize: 11,
                marginTop: 6,
              }}
            >
              {lastUpdatedAt[rangeIdx] ? `Updated ${formatTimeAgoWeb(lastUpdatedAt[rangeIdx]!)}` : "Updating…"}
            </Text>
          </View>

          {/* Chart */}
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 12,
              }}
            >
              <View style={{ flexDirection: "row", gap: 18 }}>
                {CHART_RANGES.slice(0, 5).map((r, idx) => (
                  <TypoTab
                    key={r.label}
                    label={r.label}
                    active={idx === rangeIdx}
                    onPress={() => setRangeIdx(idx)}
                  />
                ))}
              </View>
              <View style={{ flexDirection: "row", gap: 12 }}>
                <TypoTab label="Price" active={mode === "price"} onPress={() => setMode("price")} />
                <TypoTab label="%" active={mode === "percent"} onPress={() => setMode("percent")} />
              </View>
            </View>
            <View style={{ width: "100%", height: 260 }}>
              <ChartFill data={seriesForChart} positive={isPositive} />
            </View>
          </View>

          {/* Key metrics 4×2 grid */}
          <View style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MetricCell label="Market Cap" value={stock.marketCap || "—"} />
              <MetricCell label="P/E Ratio" value={stock.pe ? stock.pe.toFixed(2) : "—"} />
              <MetricCell label="Sector" value={stock.sector || "—"} />
              <MetricCell label="Currency" value={stock.currency || "USD"} />
            </View>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <MetricCell
                label="52W Range"
                value={fiftyTwo ? `${fiftyTwo.low.toFixed(2)}–${fiftyTwo.high.toFixed(2)}` : "—"}
                rangeBar={fiftyTwo ? { current: stock.price, low: fiftyTwo.low, high: fiftyTwo.high } : undefined}
              />
              <MetricCell label="Day Change" value={`${isPositive ? "+" : ""}${stock.change.toFixed(2)}`} />
              <MetricCell label="% Change" value={formatChangePctWeb(stock.changePercent)} />
              <MetricCell label="Exchange" value={stock.exchange || "—"} />
            </View>
          </View>
        </View>

        {/* Right column */}
        <View
          style={{
            width: rightWidth,
            // @ts-ignore — sticky on desktop only
            position: stacked ? "relative" : "sticky",
            top: stacked ? undefined : 24,
            alignSelf: stacked ? undefined : "flex-start",
          } as any}
        >
          <View style={{ flexDirection: "row", gap: 18, marginBottom: 20 }}>
            <TypoTab label="Overview" active={tab === "overview"} onPress={() => setTab("overview")} />
            <TypoTab label="News" active={tab === "news"} onPress={() => setTab("news")} />
            <TypoTab label="Reports" active={tab === "reports"} onPress={() => setTab("reports")} />
            <TypoTab label="Alerts" active={tab === "alerts"} onPress={() => setTab("alerts")} />
          </View>
          <View>
            {tab === "overview" ? <OverviewTab ticker={ticker} /> : null}
            {tab === "news" ? <NewsTab ticker={ticker} /> : null}
            {tab === "reports" ? <ReportSummary ticker={ticker} /> : null}
            {tab === "alerts" ? <AlertsInlinePanel ticker={ticker} /> : null}
          </View>
        </View>
      </View>
    </View>
  );
}

function ChartFill({ data, positive }: { data: number[]; positive: boolean }) {
  const [size, setSize] = useState({ w: 600, h: 260 });
  return (
    <View
      style={{ width: "100%", height: "100%" }}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        if (w !== size.w || h !== size.h) setSize({ w, h });
      }}
    >
      <AreaChart data={data} width={size.w} height={size.h} positive={positive} />
    </View>
  );
}
