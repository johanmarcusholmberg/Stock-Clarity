import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
  Defs,
  LinearGradient,
  Path,
  Stop,
  Line,
  Circle,
  Text as SvgText,
} from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { getChart, getQuotes, getEvents, CHART_RANGES, EVENT_PERIODS, formatPrice, formatMarketCap, exchangeToFlag, type StockEvent, type EventPeriod } from "@/services/stockApi";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_HEIGHT = 185;
const Y_AXIS_WIDTH = 54;
const CHART_PADDING = { top: 16, bottom: 16, right: 8 };

type ChartMode = "price" | "percent";

// ── Currency helpers ──────────────────────────────────────────────
function getCurrencySymbol(currency: string): string {
  const map: Record<string, string> = {
    USD: "$", EUR: "€", GBP: "£", GBp: "p", JPY: "¥", CHF: "Fr",
    CAD: "C$", AUD: "A$", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
    SGD: "S$", NZD: "NZ$", MXN: "MX$", BRL: "R$", CNY: "¥", INR: "₹",
  };
  return map[currency] ?? currency;
}

function formatYLabel(value: number, mode: ChartMode, currency: string): string {
  if (mode === "percent") {
    return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
  }
  const sym = getCurrencySymbol(currency);
  if (Math.abs(value) >= 10000) return `${sym}${(value / 1000).toFixed(0)}k`;
  if (Math.abs(value) >= 1000) return `${sym}${(value / 1000).toFixed(1)}k`;
  if (Math.abs(value) >= 100) return `${sym}${value.toFixed(1)}`;
  if (Math.abs(value) >= 10) return `${sym}${value.toFixed(2)}`;
  return `${sym}${value.toFixed(2)}`;
}

function formatTooltipValue(value: number, mode: ChartMode, currency: string): string {
  if (mode === "percent") {
    return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
  }
  const sym = getCurrencySymbol(currency);
  return `${sym}${value.toFixed(2)}`;
}

// ── X-axis label helpers ───────────────────────────────────────────
function formatXLabel(tsMs: number, interval: string): string {
  const d = new Date(tsMs);
  if (interval === "5m" || interval === "15m") {
    const h = d.getHours();
    const min = d.getMinutes();
    const suffix = h >= 12 ? "pm" : "am";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return min === 0 ? `${h12}${suffix}` : `${h12}:${String(min).padStart(2, "0")}${suffix}`;
  }
  if (interval === "1d") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
  if (interval === "1wk") {
    return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  }
  if (interval === "1mo") {
    return String(d.getFullYear());
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function computeXLabels(
  timestamps: number[],
  interval: string,
  plotLeft: number,
  plotRight: number,
  numLabels = 5
): { label: string; x: number }[] {
  if (!timestamps.length) return [];
  const n = timestamps.length;
  const plotWidth = plotRight - plotLeft;

  // For monthly interval (3Y / 5Y): anchor labels at each calendar-year boundary
  // so the axis always shows distinct years like 2023, 2024, 2025, 2026.
  if (interval === "1mo") {
    const boundaryIndices: number[] = [0];
    let lastYear = new Date(timestamps[0]).getFullYear();
    for (let i = 1; i < n; i++) {
      const yr = new Date(timestamps[i]).getFullYear();
      if (yr !== lastYear) {
        boundaryIndices.push(i);
        lastYear = yr;
      }
    }
    if (boundaryIndices[boundaryIndices.length - 1] !== n - 1) {
      boundaryIndices.push(n - 1);
    }
    // Sample down to at most 6 labels if span covers many years
    const MAX_LABELS = 6;
    let indices = boundaryIndices;
    if (indices.length > MAX_LABELS) {
      const sampled = [indices[0]];
      const step = (indices.length - 1) / (MAX_LABELS - 1);
      for (let i = 1; i < MAX_LABELS - 1; i++) {
        sampled.push(indices[Math.round(i * step)]);
      }
      sampled.push(indices[indices.length - 1]);
      indices = [...new Set(sampled)];
    }
    return indices.map((idx) => ({
      label: String(new Date(timestamps[idx]).getFullYear()),
      x: plotLeft + (idx / Math.max(n - 1, 1)) * plotWidth,
    }));
  }

  // Default: evenly-spaced labels
  const count = Math.min(numLabels, n);
  const result: { label: string; x: number }[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.round((i / (count - 1)) * (n - 1));
    const x = plotLeft + (idx / Math.max(n - 1, 1)) * plotWidth;
    result.push({ label: formatXLabel(timestamps[idx], interval), x });
  }
  return result;
}

// ── Interactive Chart ─────────────────────────────────────────────
interface ChartProps {
  prices: number[];
  timestamps: number[];
  interval: string;
  color: string;
  positiveColor: string;
  negativeColor: string;
  borderColor: string;
  mutedColor: string;
  width: number;
  currency: string;
  mode: ChartMode;
  yPadding: number;
  onHoverChange?: (index: number | null) => void;
}

function InteractiveChart({ prices, timestamps, interval, color, positiveColor, negativeColor, borderColor, mutedColor, width, currency, mode, yPadding, onHoverChange }: ChartProps) {
  const [touchIndex, setTouchIndex] = useState<number | null>(null);

  const plotLeft = Y_AXIS_WIDTH;
  const plotRight = width - CHART_PADDING.right;
  const plotWidth = plotRight - plotLeft;
  const plotTop = CHART_PADDING.top;
  const plotBottom = CHART_HEIGHT - CHART_PADDING.bottom;
  const plotAreaHeight = plotBottom - plotTop;

  const displayValues = useMemo(() => {
    if (!prices.length) return [];
    if (mode === "percent") {
      const base = prices[0] || 1;
      return prices.map((p) => ((p - base) / base) * 100);
    }
    return prices;
  }, [prices, mode]);

  // Anchor to actual data min/max within the selected range, then apply padding
  const dataMin = displayValues.length ? Math.min(...displayValues) : 0;
  const dataMax = displayValues.length ? Math.max(...displayValues) : 1;
  const minVal = dataMin - yPadding;
  const maxVal = dataMax + yPadding;
  const valRange = maxVal - minVal || 1;

  const toSvgX = (idx: number) =>
    plotLeft + (idx / Math.max(displayValues.length - 1, 1)) * plotWidth;
  const toSvgY = (val: number) =>
    plotTop + (1 - (Math.max(minVal, Math.min(maxVal, val)) - minVal) / valRange) * plotAreaHeight;

  const pathPoints = displayValues.map((v, i) => ({ x: toSvgX(i), y: toSvgY(v) }));
  const pathD = pathPoints.length
    ? "M" + pathPoints.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join("L")
    : "";
  const lastPt = pathPoints[pathPoints.length - 1];
  const closedD = pathD && lastPt
    ? `${pathD}L${lastPt.x.toFixed(1)},${plotBottom}L${plotLeft},${plotBottom}Z`
    : "";

  // Y-axis: 5 evenly spaced ticks
  const NUM_Y_TICKS = 5;
  const yLabels = Array.from({ length: NUM_Y_TICKS }, (_, i) => {
    const frac = i / (NUM_Y_TICKS - 1);
    const val = maxVal - frac * (maxVal - minVal);
    const y = plotTop + frac * plotAreaHeight;
    return { val, y };
  });

  // Crosshair
  const crosshairX = touchIndex !== null ? toSvgX(touchIndex) : null;
  const crosshairY = touchIndex !== null ? toSvgY(displayValues[touchIndex]) : null;
  const crosshairVal = touchIndex !== null ? displayValues[touchIndex] : null;

  // Direction-based crosshair color: green if going up from previous point, red if down
  const hoverDirColor = useMemo(() => {
    if (touchIndex === null || !displayValues.length) return color;
    const curr = displayValues[touchIndex];
    const prev = touchIndex > 0 ? displayValues[touchIndex - 1] : displayValues[touchIndex];
    return curr >= prev ? positiveColor : negativeColor;
  }, [touchIndex, displayValues, positiveColor, negativeColor, color]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: (e) => {
          const x = e.nativeEvent.locationX;
          const idx = Math.max(0, Math.min(displayValues.length - 1, Math.round(((x - plotLeft) / plotWidth) * (displayValues.length - 1))));
          setTouchIndex(idx);
          onHoverChange?.(idx);
        },
        onPanResponderMove: (e) => {
          const x = e.nativeEvent.locationX;
          const idx = Math.max(0, Math.min(displayValues.length - 1, Math.round(((x - plotLeft) / plotWidth) * (displayValues.length - 1))));
          setTouchIndex(idx);
          onHoverChange?.(idx);
        },
        onPanResponderRelease: () => { setTouchIndex(null); onHoverChange?.(null); },
        onPanResponderTerminate: () => { setTouchIndex(null); onHoverChange?.(null); },
      }),
    [displayValues.length, plotLeft, plotWidth]
  );

  if (!prices.length) return null;

  // Clamp tooltip so it stays within chart bounds
  const tooltipWidth = 80;
  const tooltipLeft =
    crosshairX !== null
      ? Math.min(Math.max(crosshairX - tooltipWidth / 2, plotLeft), plotRight - tooltipWidth)
      : 0;

  return (
    <View style={{ width, position: "relative" }}>
      {/* Floating tooltip above chart */}
      {crosshairX !== null && crosshairVal !== null && (
        <View
          style={[
            chartStyles.tooltip,
            {
              left: tooltipLeft,
              backgroundColor: hoverDirColor,
              width: tooltipWidth,
            },
          ]}
        >
          <Text style={chartStyles.tooltipText}>
            {formatTooltipValue(crosshairVal, mode, currency)}
          </Text>
        </View>
      )}

      {/* SVG Chart */}
      <View {...panResponder.panHandlers} style={{ width, height: CHART_HEIGHT }}>
        <Svg width={width} height={CHART_HEIGHT}>
          <Defs>
            <LinearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={color} stopOpacity={0.35} />
              <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
            </LinearGradient>
          </Defs>

          {/* Y-axis baseline */}
          <Line
            x1={plotLeft}
            y1={plotTop}
            x2={plotLeft}
            y2={plotBottom}
            stroke={borderColor}
            strokeWidth={1}
          />

          {/* Y-axis grid lines + labels */}
          {yLabels.map(({ val, y }, i) => (
            <React.Fragment key={i}>
              <Line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke={borderColor}
                strokeWidth={0.5}
                strokeDasharray={i === 0 || i === 2 ? undefined : "4,4"}
                strokeOpacity={0.6}
              />
              <SvgText
                x={plotLeft - 5}
                y={y + 4}
                textAnchor="end"
                fontSize={9}
                fill={mutedColor}
                fontFamily="Inter_400Regular"
              >
                {formatYLabel(val, mode, currency)}
              </SvgText>
            </React.Fragment>
          ))}

          {/* Gradient fill */}
          {closedD ? <Path d={closedD} fill="url(#chartGrad)" /> : null}

          {/* Price line */}
          {pathD ? <Path d={pathD} stroke={color} strokeWidth={2} fill="none" /> : null}

          {/* Crosshair */}
          {crosshairX !== null && crosshairY !== null && (
            <>
              <Line
                x1={crosshairX}
                y1={plotTop}
                x2={crosshairX}
                y2={plotBottom}
                stroke={hoverDirColor}
                strokeWidth={1}
                strokeDasharray="4,3"
              />
              <Circle cx={crosshairX} cy={crosshairY} r={7} fill={hoverDirColor} fillOpacity={0.2} />
              <Circle cx={crosshairX} cy={crosshairY} r={4} fill={hoverDirColor} />
            </>
          )}
        </Svg>
      </View>

      {/* X-axis time labels */}
      {timestamps.length > 0 ? (
        <View style={{ position: "relative", height: 18, marginTop: 2 }}>
          {computeXLabels(timestamps, interval, plotLeft, plotRight, 5).map((lbl, i) => (
            <Text
              key={i}
              style={[
                chartStyles.xLabel,
                {
                  color: mutedColor,
                  position: "absolute",
                  left: Math.max(0, lbl.x - 26),
                  width: 52,
                  textAlign: "center",
                },
              ]}
            >
              {lbl.label}
            </Text>
          ))}
        </View>
      ) : (
        <View style={chartStyles.xAxisRow}>
          <View style={{ width: Y_AXIS_WIDTH }} />
          <Text style={[chartStyles.xLabel, { color: mutedColor }]}>Start</Text>
          <Text style={[chartStyles.xLabel, { color: mutedColor }]}>Now</Text>
        </View>
      )}
    </View>
  );
}

const chartStyles = StyleSheet.create({
  tooltip: {
    position: "absolute",
    top: -28,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    zIndex: 10,
    alignItems: "center",
  },
  tooltipText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  xAxisRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: CHART_PADDING.right,
    marginTop: 2,
  },
  xLabel: { fontSize: 10, fontFamily: "Inter_400Regular" },
});

// ── Expandable Event Card (stock page version) ────────────────────
interface ExpandableEventCardProps {
  event: StockEvent;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
  canExpand: boolean;
  summaryCount: number;
  summaryLimit: number;
  onNeedUpgrade: () => void;
  onExpand: () => void;
}

function ExpandableEventCard({
  event, colors, canExpand, summaryCount, summaryLimit, onNeedUpgrade, onExpand,
}: ExpandableEventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasAI = !!(event.what || event.why || event.unusual);
  const date = new Date(event.timestamp).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
  const sentColor =
    event.sentiment === "positive"
      ? colors.positive
      : event.sentiment === "negative"
      ? colors.negative
      : colors.mutedForeground;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!expanded && hasAI) {
      if (!canExpand) {
        onNeedUpgrade();
        return;
      }
      onExpand();
    }
    setExpanded((v) => !v);
  };

  return (
    <TouchableOpacity
      style={[es.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      <View style={es.header}>
        <View style={[es.sentDot, { backgroundColor: sentColor }]} />
        <View style={es.headerText}>
          <Text style={[es.title, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
            {event.title}
          </Text>
          <Text style={[es.meta, { color: colors.mutedForeground }]}>
            {event.publisher ? `${event.publisher} · ` : ""}{date}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {hasAI && !canExpand && !expanded && (
            <View style={[es.lockBadge, { backgroundColor: colors.warning + "22" }]}>
              <Feather name="lock" size={10} color={colors.warning} />
              <Text style={[es.lockText, { color: colors.warning }]}>PRO</Text>
            </View>
          )}
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
        </View>
      </View>

      {/* AI usage hint when not expanded */}
      {!expanded && hasAI && canExpand && summaryLimit < 9999 && (
        <Text style={[es.hint, { color: colors.mutedForeground }]}>
          Tap for AI analysis · {Math.max(0, summaryLimit - summaryCount)} summary{summaryLimit - summaryCount !== 1 ? "s" : ""} left for this stock
        </Text>
      )}

      {expanded && (
        <View style={es.body}>
          <View style={[es.divider, { backgroundColor: colors.border }]} />
          {event.what ? (
            <View style={es.section}>
              <Text style={[es.sectionLabel, { color: colors.primary }]}>WHAT HAPPENED</Text>
              <Text style={[es.sectionText, { color: colors.foreground }]}>{event.what}</Text>
            </View>
          ) : null}
          {event.why ? (
            <View style={es.section}>
              <Text style={[es.sectionLabel, { color: "#F59E0B" }]}>WHY IT MATTERS</Text>
              <Text style={[es.sectionText, { color: colors.foreground }]}>{event.why}</Text>
            </View>
          ) : null}
          {event.unusual ? (
            <View style={es.section}>
              <Text style={[es.sectionLabel, { color: colors.mutedForeground }]}>UNUSUAL</Text>
              <Text style={[es.sectionText, { color: colors.foreground }]}>{event.unusual}</Text>
            </View>
          ) : null}
          {event.url ? (
            <TouchableOpacity
              style={[es.readMore, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(event.url)}
            >
              <Feather name="external-link" size={12} color={colors.primary} />
              <Text style={[es.readMoreText, { color: colors.primary }]}>Read full article</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

const es = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  header: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10 },
  sentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20, marginBottom: 4 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  lockText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  sectionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  readMore: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, marginTop: 4 },
  readMoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});

// ── Main Screen ───────────────────────────────────────────────────
export default function StockDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, addToWatchlist, removeFromWatchlist, isInWatchlist, isInFolder, activeFolderId, folders } = useWatchlist();
  const {
    tier,
    canViewStock,
    canUseAIForStock,
    recordStockView,
    recordAIUsageForStock,
    aiUsageForStock,
    summariesPerStockLimit,
    stocksLimit,
  } = useSubscription();

  const [liveQuote, setLiveQuote] = useState<any>(null);
  const [chartPrices, setChartPrices] = useState<number[]>([]);
  const [chartTimestamps, setChartTimestamps] = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [chartMode, setChartMode] = useState<ChartMode>("price");
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<EventPeriod>("week");
  const [selectedRange, setSelectedRange] = useState(2); // 1M default
  const [stockViewable, setStockViewable] = useState(true);
  const [paywallReason, setPaywallReason] = useState<"ai_stock_limit" | "stock_daily_limit">("ai_stock_limit");
  const [showPaywall, setShowPaywall] = useState(false);
  const stockViewRecorded = useRef(false);

  const cachedStock = stocks[ticker ?? ""];
  const inActiveFolder = isInFolder(ticker ?? "", activeFolderId);
  const inAnyFolder = isInWatchlist(ticker ?? "");
  const activeFolderName = folders.find((f) => f.id === activeFolderId)?.name ?? "Watchlist";

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const chartWidth = SCREEN_WIDTH - 32;

  // Check & record stock view on mount
  useEffect(() => {
    if (!ticker || stockViewRecorded.current) return;
    stockViewRecorded.current = true;
    const viewable = canViewStock(ticker);
    setStockViewable(viewable);
    if (viewable) {
      recordStockView(ticker);
    }
  }, [ticker]);

  // Load live quote
  useEffect(() => {
    if (!ticker) return;
    getQuotes([ticker]).then((qs) => {
      if (qs[0]) setLiveQuote(qs[0]);
    }).catch(() => {});
  }, [ticker]);

  // Load chart data
  const loadChart = useCallback(async (rangeIdx: number) => {
    if (!ticker) return;
    setChartLoading(true);
    try {
      const { range, interval } = CHART_RANGES[rangeIdx];
      const data = await getChart(ticker, range, interval);
      setChartPrices(data.prices);
      setChartTimestamps(data.timestamps);
    } catch {
      setChartPrices(cachedStock?.priceHistory ?? []);
      setChartTimestamps([]);
    } finally {
      setChartLoading(false);
    }
  }, [ticker, cachedStock]);

  useEffect(() => { loadChart(selectedRange); }, [selectedRange]);

  // Load events
  useEffect(() => {
    if (!ticker) return;
    setEventsLoading(true);
    setEvents([]);
    getEvents(ticker, selectedPeriod)
      .then((evts) => setEvents(evts))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [ticker, selectedPeriod]);

  // Derived values
  const price = liveQuote?.regularMarketPrice ?? cachedStock?.price ?? 0;
  const change = liveQuote?.regularMarketChange ?? cachedStock?.change ?? 0;
  const changePercent = liveQuote?.regularMarketChangePercent ?? cachedStock?.changePercent ?? 0;
  const currency = liveQuote?.currency ?? cachedStock?.currency ?? "USD";
  const currSym = getCurrencySymbol(currency);
  const marketCap = formatMarketCap(liveQuote?.marketCap ?? undefined);
  const name = liveQuote?.longName ?? liveQuote?.shortName ?? cachedStock?.name ?? ticker ?? "";
  const sector = liveQuote?.sector ?? cachedStock?.sector ?? "";
  const exchange = liveQuote?.fullExchangeName ?? cachedStock?.exchange ?? "";
  const flag = exchangeToFlag(liveQuote?.exchange ?? liveQuote?.fullExchangeName ?? exchange);
  const fiftyTwoHigh = liveQuote?.fiftyTwoWeekHigh;
  const fiftyTwoLow = liveQuote?.fiftyTwoWeekLow;
  const volume = liveQuote?.regularMarketVolume;
  const pe = liveQuote?.trailingPE;

  const isPositive = changePercent >= 0;
  const changeColor = isPositive ? colors.positive : colors.negative;

  // Chart % change from first to last
  const chartChangePct =
    chartPrices.length >= 2
      ? ((chartPrices[chartPrices.length - 1] - chartPrices[0]) / (chartPrices[0] || 1)) * 100
      : 0;

  // Y-axis padding per range — applied on top of actual data min/max inside the chart
  // Rules: 1D ±1.5, 1W ±3, 1M ±5, YTD ±8, 1Y ±15, 3Y ±20, 5Y ±25
  // Same number works for both price (dollar points) and percent (percentage points)
  const chartYPadding = useMemo(() => {
    const padTable = [1.5, 3, 5, 8, 15, 20, 25];
    return padTable[selectedRange] ?? 25;
  }, [selectedRange]);

  // Per-stock AI tracking
  const summaryCount = ticker ? aiUsageForStock(ticker) : 0;
  const canViewAI = ticker ? canUseAIForStock(ticker) : false;

  const handleNeedUpgrade = (reason: "ai_stock_limit" | "stock_daily_limit") => {
    setPaywallReason(reason);
    setShowPaywall(true);
  };

  if (!cachedStock && !liveQuote) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Loading {ticker}…</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 54 : insets.bottom + 20 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <View style={[styles.header, { paddingTop: topPadding + 8 }]}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={[styles.backButton, { backgroundColor: colors.secondary }]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={18} color={colors.foreground} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              if (inActiveFolder) {
                removeFromWatchlist(ticker!);
              } else {
                addToWatchlist(ticker!);
              }
            }}
            style={[styles.watchlistButton, {
              backgroundColor: inActiveFolder ? `${colors.primary}22` : colors.primary,
              borderColor: inActiveFolder ? `${colors.primary}44` : colors.primary,
            }]}
          >
            <Feather name={inActiveFolder ? "check" : "plus"} size={14} color={inActiveFolder ? colors.primary : colors.primaryForeground} />
            <Text style={[styles.watchlistButtonText, { color: inActiveFolder ? colors.primary : colors.primaryForeground }]} numberOfLines={1}>
              {inActiveFolder ? activeFolderName : inAnyFolder ? `Add to ${activeFolderName}` : "Add to watchlist"}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Hero ── */}
        <View style={styles.heroSection}>
          <View style={styles.tickerRow}>
            <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.tickerBadgeText, { color: colors.primary }]}>{ticker}</Text>
            </View>
            {exchange ? <Text style={[styles.exchangeLabel, { color: colors.mutedForeground }]}>{flag} {exchange}</Text> : null}
            {sector ? <Text style={[styles.sectorLabel, { color: colors.mutedForeground }]}>· {sector}</Text> : null}
            {currency ? (
              <View style={[styles.currencyBadge, { backgroundColor: colors.secondary }]}>
                <Text style={[styles.currencyText, { color: colors.mutedForeground }]}>{currency}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.stockName, { color: colors.foreground }]}>{name}</Text>

          <View style={styles.priceRow}>
            <Text style={[styles.priceText, { color: colors.foreground }]}>
              {currSym}{formatPrice(price, currency)}
            </Text>
            <View style={[styles.changePill, { backgroundColor: `${changeColor}22` }]}>
              <Feather name={isPositive ? "trending-up" : "trending-down"} size={13} color={changeColor} />
              <Text style={[styles.changeText, { color: changeColor }]}>
                {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
              </Text>
            </View>
          </View>
          <Text style={[styles.changeAbsolute, { color: changeColor }]}>
            {change >= 0 ? "+" : ""}{currSym}{Math.abs(change).toFixed(2)} today
          </Text>
        </View>

        {/* ── Chart ── */}
        <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border, paddingTop: 36 }]}>
          {/* Range + Mode toggle row */}
          <View style={styles.chartTopRow}>
            <View style={styles.rangeRow}>
              {CHART_RANGES.map((r, i) => (
                <TouchableOpacity
                  key={r.label}
                  style={[
                    styles.rangeChip,
                    i === selectedRange && { backgroundColor: colors.primary },
                    i !== selectedRange && { backgroundColor: "transparent" },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedRange(i);
                  }}
                >
                  <Text style={[styles.rangeChipText, { color: i === selectedRange ? colors.primaryForeground : colors.mutedForeground }]}>
                    {r.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {/* Price / % toggle */}
            <View style={[styles.modeToggle, { backgroundColor: colors.secondary }]}>
              <TouchableOpacity
                style={[styles.modeBtn, chartMode === "price" && { backgroundColor: colors.primary }]}
                onPress={() => setChartMode("price")}
              >
                <Text style={[styles.modeBtnText, { color: chartMode === "price" ? colors.primaryForeground : colors.mutedForeground }]}>
                  {currSym}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, chartMode === "percent" && { backgroundColor: colors.primary }]}
                onPress={() => setChartMode("percent")}
              >
                <Text style={[styles.modeBtnText, { color: chartMode === "percent" ? colors.primaryForeground : colors.mutedForeground }]}>
                  %
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Chart % summary */}
          {chartPrices.length >= 2 && (
            <View style={{ paddingHorizontal: 16, marginBottom: 6 }}>
              <Text style={{ color: chartChangePct >= 0 ? colors.positive : colors.negative, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>
                {chartChangePct >= 0 ? "+" : ""}{chartChangePct.toFixed(2)}% this period
              </Text>
            </View>
          )}

          {chartLoading ? (
            <View style={{ height: CHART_HEIGHT + 20, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <InteractiveChart
              prices={chartPrices}
              timestamps={chartTimestamps}
              interval={CHART_RANGES[selectedRange].interval}
              color={chartChangePct >= 0 ? colors.positive : colors.negative}
              positiveColor={colors.positive}
              negativeColor={colors.negative}
              borderColor={colors.border}
              mutedColor={colors.mutedForeground}
              width={chartWidth}
              currency={currency}
              mode={chartMode}
              yPadding={chartYPadding}
            />
          )}
        </View>

        {/* ── Stats Grid ── */}
        <View style={[styles.statsGrid, { paddingHorizontal: 16, marginBottom: 16 }]}>
          {[
            { label: "Market Cap", value: marketCap },
            { label: "52W High", value: fiftyTwoHigh ? `${currSym}${fiftyTwoHigh.toFixed(2)}` : "—" },
            { label: "52W Low", value: fiftyTwoLow ? `${currSym}${fiftyTwoLow.toFixed(2)}` : "—" },
            { label: "P/E Ratio", value: pe ? pe.toFixed(1) : "—" },
            { label: "Volume", value: volume ? (volume >= 1e6 ? `${(volume / 1e6).toFixed(1)}M` : `${(volume / 1e3).toFixed(0)}K`) : "—" },
            { label: "Currency", value: `${currency}  (${currSym})` },
          ].map((item) => (
            <View key={item.label} style={[styles.statItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
              <Text style={[styles.statValue, { color: colors.foreground }]}>{item.value}</Text>
            </View>
          ))}
        </View>

        {/* ── AI News Section ── */}
        <View style={[styles.section, { paddingHorizontal: 16 }]}>
          <View style={styles.sectionHeaderRow}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent News</Text>
              <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
                Real events with AI-generated plain-language summaries.
              </Text>
            </View>
            {/* AI quota indicator */}
            {tier !== "premium" && (
              <View style={[styles.quotaBadge, { backgroundColor: colors.secondary }]}>
                <Feather name="zap" size={11} color={canViewAI ? colors.primary : colors.warning} />
                <Text style={[styles.quotaText, { color: canViewAI ? colors.primary : colors.warning }]}>
                  {summaryCount}/{summaryLimit(tier)}
                </Text>
              </View>
            )}
          </View>

          {/* Period picker */}
          <View style={{ flexDirection: "row", gap: 6, marginBottom: 14, marginTop: 4 }}>
            {EVENT_PERIODS.map((p) => {
              const active = selectedPeriod === p.key;
              return (
                <TouchableOpacity
                  key={p.key}
                  style={[
                    styles.periodPill,
                    {
                      backgroundColor: active ? colors.primary : colors.secondary,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedPeriod(p.key);
                  }}
                >
                  <Text style={[styles.periodPillText, { color: active ? colors.primaryForeground : colors.mutedForeground }]}>
                    {p.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Stock limit banner */}
          {!stockViewable && (
            <TouchableOpacity
              style={[styles.limitBanner, { backgroundColor: colors.warning + "18", borderColor: colors.warning + "44" }]}
              onPress={() => handleNeedUpgrade("stock_daily_limit")}
            >
              <Feather name="lock" size={14} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.limitBannerTitle, { color: colors.warning }]}>Daily stock limit reached</Text>
                <Text style={[styles.limitBannerSub, { color: colors.mutedForeground }]}>
                  Free plan: {tier === "free" ? 3 : 10} stocks/day with AI analysis. Tap to upgrade.
                </Text>
              </View>
              <Feather name="chevron-right" size={14} color={colors.warning} />
            </TouchableOpacity>
          )}

          {eventsLoading ? (
            <View style={styles.eventsLoading}>
              <ActivityIndicator color={colors.primary} />
              <Text style={[styles.eventsLoadingText, { color: colors.mutedForeground }]}>
                Fetching news and generating summaries…
              </Text>
            </View>
          ) : events.length === 0 ? (
            <View style={[styles.noEvents, { borderColor: colors.border }]}>
              <Text style={[styles.noEventsText, { color: colors.mutedForeground }]}>
                No recent news found for {ticker}.
              </Text>
            </View>
          ) : (
            events.map((event) => (
              <ExpandableEventCard
                key={event.id}
                event={event}
                colors={colors}
                canExpand={stockViewable && canViewAI}
                summaryCount={summaryCount}
                summaryLimit={summaryLimit(tier)}
                onNeedUpgrade={() => handleNeedUpgrade(stockViewable ? "ai_stock_limit" : "stock_daily_limit")}
                onExpand={() => ticker && recordAIUsageForStock(ticker)}
              />
            ))
          )}
        </View>
      </ScrollView>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason={paywallReason}
      />
    </>
  );
}

function summaryLimit(tier: string): number {
  if (tier === "pro") return 3;
  if (tier === "premium") return 5;
  return 1; // free
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 12,
  },
  backButton: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  watchlistButton: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 10, borderWidth: 1, gap: 5,
  },
  watchlistButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroSection: { paddingHorizontal: 16, paddingBottom: 8 },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  tickerBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tickerBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  exchangeLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectorLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  currencyBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  currencyText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  stockName: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceText: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  changePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 4 },
  changeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeAbsolute: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 4 },

  chartCard: { marginHorizontal: 16, marginBottom: 16, paddingBottom: 12, borderRadius: 16, borderWidth: 1 },
  chartTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, marginBottom: 8 },
  rangeRow: { flexDirection: "row", gap: 2 },
  rangeChip: { paddingVertical: 5, paddingHorizontal: 8, borderRadius: 8, alignItems: "center" },
  rangeChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  modeToggle: { flexDirection: "row", borderRadius: 8, padding: 2, gap: 2 },
  modeBtn: { paddingVertical: 4, paddingHorizontal: 10, borderRadius: 6, alignItems: "center" },
  modeBtnText: { fontSize: 12, fontFamily: "Inter_700Bold" },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statItem: { width: "48%", flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  statValue: { fontSize: 15, fontFamily: "Inter_700Bold" },

  section: { paddingBottom: 16 },
  sectionHeaderRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 12 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 2 },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  quotaBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, marginTop: 2 },
  quotaText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  limitBanner: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1, marginBottom: 12,
  },
  limitBannerTitle: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  limitBannerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },

  eventsLoading: { alignItems: "center", gap: 10, paddingVertical: 24 },
  eventsLoadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  periodPill: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  periodPillText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  noEvents: { padding: 20, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center" },
  noEventsText: { fontSize: 13, fontFamily: "Inter_400Regular" },

  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backLink: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
