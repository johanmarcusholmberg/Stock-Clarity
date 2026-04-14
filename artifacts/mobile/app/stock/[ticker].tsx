import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Modal,
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
import { useMultiRangeChart } from "@/hooks/useMultiRangeChart";
import { useWatchlist } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { getQuotes, getEvents, CHART_RANGES, EVENT_PERIODS, formatPrice, formatMarketCap, exchangeToFlag, type StockEvent, type EventPeriod } from "@/services/stockApi";
import { isMarketOpen } from "@/utils/marketHours";

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
function fmtTime(tsMs: number): string {
  const d = new Date(tsMs);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

function fmtDate(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWeekdayDate(tsMs: number): string {
  const d = new Date(tsMs);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-US", { month: "short" });
  return `${weekday} ${day} ${month}`;
}

function fmtMonthShort(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", { month: "short" });
}

function fmtMonthYear(tsMs: number): string {
  return new Date(tsMs).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function fmtYear(tsMs: number): string {
  return String(new Date(tsMs).getFullYear());
}

// Sample an array of indices down to at most maxCount, always keeping first and last.
function sampleIndices(indices: number[], maxCount: number): number[] {
  if (indices.length <= maxCount) return indices;
  const result = [indices[0]];
  const step = (indices.length - 1) / (maxCount - 1);
  for (let i = 1; i < maxCount - 1; i++) {
    result.push(indices[Math.round(i * step)]);
  }
  result.push(indices[indices.length - 1]);
  return [...new Set(result)];
}

function computeXLabels(
  timestamps: number[],
  rangeKey: string,
  plotLeft: number,
  plotRight: number
): { label: string; x: number }[] {
  if (!timestamps.length) return [];
  const n = timestamps.length;
  const plotWidth = plotRight - plotLeft;
  const px = (idx: number) => plotLeft + (idx / Math.max(n - 1, 1)) * plotWidth;

  // ── 1D: adaptive interval — 30-min early in day, 1-hour once past midday ─
  if (rangeKey === "1d") {
    const spanMs = timestamps[n - 1] - timestamps[0];
    const spanHours = spanMs / 3_600_000;
    // Use 30-min markers when < 3.5h of data has loaded (early session), else 1-hour
    const useHalfHour = spanHours < 3.5;
    const candidates: number[] = [0]; // always include market open
    for (let i = 1; i < n; i++) {
      const d = new Date(timestamps[i]);
      const m = d.getMinutes();
      if (useHalfHour) {
        // 30-min marks: :00 and :30
        if (m === 0 || m === 30) candidates.push(i);
      } else {
        // 1-hour marks: :00 only
        if (m === 0) candidates.push(i);
      }
    }
    const maxLabels = useHalfHour ? 7 : 6;
    const picked = sampleIndices(candidates, maxLabels);
    return picked.map((i) => ({ label: fmtTime(timestamps[i]), x: px(i) }));
  }

  // ── 5D: one label per trading day with weekday + date ────────────
  if (rangeKey === "5d") {
    // Collect first bar index of each unique calendar date
    const seen = new Set<string>();
    const dayIndices: number[] = [];
    for (let i = 0; i < n; i++) {
      const d = new Date(timestamps[i]);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!seen.has(key)) { seen.add(key); dayIndices.push(i); }
    }
    // Place each label at the midpoint of that day's bars for even visual spacing
    const dayCount = dayIndices.length;
    return dayIndices.map((startIdx, di) => {
      const endIdx = di < dayCount - 1 ? dayIndices[di + 1] - 1 : n - 1;
      const midIdx = Math.round((startIdx + endIdx) / 2);
      return { label: fmtWeekdayDate(timestamps[startIdx]), x: px(midIdx) };
    });
  }

  // ── 1M: one label per week (~every 5 trading days) ───────────────
  if (rangeKey === "1mo") {
    const indices: number[] = [];
    for (let i = 0; i < n; i += 5) indices.push(i);
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    return sampleIndices(indices, 6).map((i) => ({ label: fmtDate(timestamps[i]), x: px(i) }));
  }

  // ── YTD: one label per month ──────────────────────────────────────
  if (rangeKey === "ytd") {
    const indices: number[] = [0];
    let lastMonth = new Date(timestamps[0]).getMonth();
    for (let i = 1; i < n; i++) {
      const mo = new Date(timestamps[i]).getMonth();
      if (mo !== lastMonth) { indices.push(i); lastMonth = mo; }
    }
    return sampleIndices(indices, 8).map((i) => ({ label: fmtMonthShort(timestamps[i]), x: px(i) }));
  }

  // ── 1Y: one label every 2 months ─────────────────────────────────
  if (rangeKey === "1y") {
    const monthBounds: number[] = [0];
    let lastMonth = new Date(timestamps[0]).getMonth();
    for (let i = 1; i < n; i++) {
      const mo = new Date(timestamps[i]).getMonth();
      if (mo !== lastMonth) { monthBounds.push(i); lastMonth = mo; }
    }
    const everyOther = monthBounds.filter((_, i) => i % 2 === 0);
    return sampleIndices(everyOther, 6).map((i) => ({ label: fmtMonthYear(timestamps[i]), x: px(i) }));
  }

  // ── 3Y: one label per 6 months (every 6th monthly data point) ────
  if (rangeKey === "3y") {
    const indices: number[] = [];
    for (let i = 0; i < n; i += 6) indices.push(i);
    if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    return sampleIndices(indices, 7).map((i) => ({ label: fmtMonthYear(timestamps[i]), x: px(i) }));
  }

  // ── 5Y: one label per calendar year ──────────────────────────────
  if (rangeKey === "5y") {
    const yearBounds: number[] = [0];
    let lastYear = new Date(timestamps[0]).getFullYear();
    for (let i = 1; i < n; i++) {
      const yr = new Date(timestamps[i]).getFullYear();
      if (yr !== lastYear) { yearBounds.push(i); lastYear = yr; }
    }
    if (yearBounds[yearBounds.length - 1] !== n - 1) yearBounds.push(n - 1);
    return sampleIndices(yearBounds, 6).map((i) => ({ label: fmtYear(timestamps[i]), x: px(i) }));
  }

  // ── Fallback: 5 evenly-spaced ─────────────────────────────────────
  const count = Math.min(5, n);
  return Array.from({ length: count }, (_, j) => {
    const i = Math.round((j / (count - 1)) * (n - 1));
    return { label: fmtDate(timestamps[i]), x: px(i) };
  });
}

// ── Interactive Chart ─────────────────────────────────────────────
interface ChartProps {
  prices: number[];
  timestamps: number[];
  rangeKey: string;
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

function InteractiveChart({ prices, timestamps, rangeKey, color, positiveColor, negativeColor, borderColor, mutedColor, width, currency, mode, yPadding, onHoverChange }: ChartProps) {
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
          {computeXLabels(timestamps, rangeKey, plotLeft, plotRight).map((lbl, i) => (
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
  const { stocks, addToWatchlist, isInWatchlist, isInFolder, folders, addToFolder, removeFromFolder } = useWatchlist();
  const [folderSheetVisible, setFolderSheetVisible] = useState(false);
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
  // All chart ranges fetched in parallel via TanStack Query
  const chart = useMultiRangeChart(ticker);
  const chartLoading = chart.isInitialLoading;
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>("price");
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState<EventPeriod>("week");
  const [selectedRange, setSelectedRange] = useState(0); // 1D default — always reset on open
  const [stockViewable, setStockViewable] = useState(true);
  const [paywallReason, setPaywallReason] = useState<"ai_stock_limit" | "stock_daily_limit">("ai_stock_limit");
  const [showPaywall, setShowPaywall] = useState(false);
  const [lastManualRefresh, setLastManualRefresh] = useState<number | null>(null);
  // 10-second tick for cooldown — avoids per-second re-renders
  const [tickMs, setTickMs] = useState(Date.now());
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stockViewRecorded = useRef(false);
  // Separate ref for the events effect — lets us clear stale events only on
  // ticker change, not on period switch (period switch shows stale while loading).
  const prevEventTickerRef = useRef<string | null>(null);

  // Derived chart data from cache for the selected range
  const chartPrices = chart.data[selectedRange]?.prices ?? [];
  const chartTimestamps = chart.data[selectedRange]?.timestamps ?? [];

  const cachedStock = stocks[ticker ?? ""];
  const inAnyFolder = isInWatchlist(ticker ?? "");

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

  // 10-second tick — drives the cooldown display without per-second re-renders
  useEffect(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => setTickMs(Date.now()), 10_000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, []);

  // Derived cooldown values (no separate interval needed — driven by tickMs)
  const cooldownTotal = tier === "premium" ? 60 : 300; // seconds
  const cooldownRemainSec = lastManualRefresh !== null
    ? Math.max(0, cooldownTotal - Math.floor((tickMs - lastManualRefresh) / 1000))
    : 0;
  const isOnCooldown = cooldownRemainSec > 0;
  const cooldownMin = Math.ceil(cooldownRemainSec / 60);

  // ─────────────────────────────────────────────────────────────────────────
  // Quote refresh — chart data is handled by useMultiRangeChart (TanStack Query).
  // We still need to keep liveQuote fresh: fetch on mount and on every range
  // switch so the hero price never shows a stale value.
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!ticker) return;
    getQuotes([ticker]).then((quotes) => {
      if (quotes[0]) setLiveQuote(quotes[0]);
    }).catch(() => {});
  }, [selectedRange, ticker]);

  // Manual refresh: invalidate all chart queries (TanStack Query refetches in
  // background) + fetch fresh quote.
  const handleManualRefresh = useCallback(async () => {
    if (isOnCooldown || refreshing || !ticker) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    setRefreshError(false);
    // Record timestamp immediately so button disables right away
    const now = Date.now();
    setLastManualRefresh(now);
    setTickMs(now); // force cooldown to re-derive immediately
    try {
      // Invalidate all chart queries — TanStack Query refetches them in parallel
      chart.invalidateAll();
      // Refresh quote
      const quotes = await getQuotes([ticker]);
      if (quotes[0]) setLiveQuote(quotes[0]);
    } catch {
      // Full rollback: revert timestamp so the cooldown doesn't linger on error
      setLastManualRefresh(null);
      setTickMs(Date.now());
      setRefreshError(true);
      setTimeout(() => setRefreshError(false), 3000);
    } finally {
      setRefreshing(false);
    }
  }, [isOnCooldown, refreshing, ticker, chart]);

  // Load events
  // On ticker change: clear stale events from the previous stock immediately.
  // On period switch: keep current events visible while the new period loads —
  // this avoids a blank list flash when the backend cache is warm.
  useEffect(() => {
    if (!ticker) return;
    const tickerChanged = prevEventTickerRef.current !== ticker;
    prevEventTickerRef.current = ticker;
    setEventsLoading(true);
    if (tickerChanged) setEvents([]);
    getEvents(ticker, selectedPeriod)
      .then((evts) => setEvents(evts))
      .catch(() => setEvents([]))
      .finally(() => setEventsLoading(false));
  }, [ticker, selectedPeriod]);

  // ── Non-price metadata (never range-dependent) ───────────────────
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

  // Market open/closed status derived from exchange
  const marketOpen = useMemo(() => {
    const exch = liveQuote?.exchange ?? liveQuote?.fullExchangeName ?? exchange;
    return exch ? isMarketOpen(exch) : false;
  }, [liveQuote?.exchange, liveQuote?.fullExchangeName, exchange]);

  const chartFirst = chartPrices.length > 0 ? chartPrices[0] : null;
  const chartLast  = chartPrices.length > 0 ? chartPrices[chartPrices.length - 1] : null;
  const is1D = CHART_RANGES[selectedRange].range === "1d";

  // livePrice: always the most recent real-time quote, independent of chart range.
  const livePrice: number | null = liveQuote?.regularMarketPrice ?? null;

  // displayPrice: hero value shown to the user.
  // Always live quote first — switching chart ranges must not change this number.
  const displayPrice = livePrice ?? chartLast ?? cachedStock?.price ?? 0;

  // periodEnd: used for change calculations and the Current/End strip value.
  // Prefer live price so the displayed % always reflects range-start → now.
  const periodStart: number | null = chartFirst;
  const periodEnd: number | null   = livePrice ?? chartLast ?? null;

  // displayChartPrices: when market is open, patch the last chart bar to match
  // livePrice so the graph endpoint visually aligns with the displayed price.
  // Only the final point is replaced — historical shape is unchanged.
  const displayChartPrices = useMemo(() => {
    if (!livePrice || !marketOpen || chartPrices.length === 0) return chartPrices;
    const patched = [...chartPrices];
    patched[patched.length - 1] = livePrice;
    return patched;
  }, [chartPrices, livePrice, marketOpen]);

  // Change relative to the start of the selected chart window
  const periodChangePoints = (periodStart != null && periodEnd != null)
    ? periodEnd - periodStart
    : (liveQuote?.regularMarketChange ?? cachedStock?.change ?? 0);
  const periodChangePct = (periodStart != null && Math.abs(periodStart) > 0 && periodEnd != null)
    ? ((periodEnd - periodStart) / Math.abs(periodStart)) * 100
    : (liveQuote?.regularMarketChangePercent ?? cachedStock?.changePercent ?? 0);

  // Label for the change row: "today" only for 1D, otherwise "this {range}"
  const periodLabel = is1D ? "today" : `this ${CHART_RANGES[selectedRange].label}`;

  // Open/Start strip: 1D uses today's open from the quote, all other ranges use chart first bar
  const stripStartPrice: number | null = is1D
    ? (liveQuote?.regularMarketOpen ?? chartFirst)
    : chartFirst;
  const stripStartLabel = is1D ? "Open" : "Start";
  // "Current" whenever market is open (live price exists), regardless of range
  const stripEndLabel = marketOpen ? "Current" : (is1D ? "Close" : "End");

  const isPositive = periodChangePct >= 0;
  const changeColor = isPositive ? colors.positive : colors.negative;

  const chartChangePct = periodChangePct;

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
              setFolderSheetVisible(true);
            }}
            style={[styles.watchlistButton, {
              backgroundColor: inAnyFolder ? `${colors.positive}18` : colors.primary,
              borderColor: inAnyFolder ? `${colors.positive}44` : colors.primary,
            }]}
          >
            <Feather
              name={inAnyFolder ? "bookmark" : "bookmark"}
              size={14}
              color={inAnyFolder ? colors.positive : colors.primaryForeground}
            />
            <Text style={[styles.watchlistButtonText, { color: inAnyFolder ? colors.positive : colors.primaryForeground }]} numberOfLines={1}>
              {inAnyFolder ? "Saved" : "Save to Watchlist"}
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
              {currSym}{formatPrice(displayPrice, currency)}
            </Text>
            <View style={[styles.changePill, { backgroundColor: `${changeColor}22` }]}>
              <Feather name={isPositive ? "trending-up" : "trending-down"} size={13} color={changeColor} />
              <Text style={[styles.changeText, { color: changeColor }]}>
                {isPositive ? "+" : ""}{periodChangePct.toFixed(2)}%
              </Text>
            </View>
          </View>
          {/* ── Start/Open · End/Current|Close strip — all from chart data ── */}
          {stripStartPrice != null && periodEnd != null && (
            <View style={[styles.openCloseRow, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.openCloseItem}>
                <Text style={[styles.openCloseLabel, { color: colors.mutedForeground }]}>{stripStartLabel}</Text>
                <Text style={[styles.openCloseValue, { color: colors.foreground }]}>
                  {currSym}{formatPrice(stripStartPrice, currency)}
                </Text>
              </View>
              <View style={[styles.openCloseDivider, { backgroundColor: colors.border }]} />
              <View style={styles.openCloseItem}>
                <Text style={[styles.openCloseLabel, { color: colors.mutedForeground }]}>{stripEndLabel}</Text>
                <Text style={[styles.openCloseValue, { color: colors.foreground }]}>
                  {currSym}{formatPrice(periodEnd, currency)}
                </Text>
              </View>
              <View style={[styles.openCloseDivider, { backgroundColor: colors.border }]} />
              <View style={styles.openCloseItem}>
                <Text style={[styles.openCloseLabel, { color: colors.mutedForeground }]}>Change</Text>
                <Text style={[styles.openCloseValue, { color: changeColor }]}>
                  {periodChangePoints >= 0 ? "+" : ""}{periodChangePct.toFixed(2)}%
                </Text>
                <Text style={[styles.openCloseSubValue, { color: changeColor }]}>
                  {periodChangePoints >= 0 ? "+" : ""}{currSym}{Math.abs(periodChangePoints).toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Market status chip */}
          <View style={styles.marketStatusRow}>
            <View style={[
              styles.marketStatusChip,
              { backgroundColor: marketOpen ? `${colors.positive}18` : `${colors.mutedForeground}14`,
                borderColor: marketOpen ? `${colors.positive}44` : `${colors.mutedForeground}30` }
            ]}>
              <View style={[styles.marketStatusDot, { backgroundColor: marketOpen ? colors.positive : colors.mutedForeground }]} />
              <Text style={[styles.marketStatusText, { color: marketOpen ? colors.positive : colors.mutedForeground }]}>
                {marketOpen ? "Market open" : "Market closed"}
                {exchange ? ` · ${exchange}` : ""}
              </Text>
            </View>
          </View>
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

          {chartLoading ? (
            <View style={{ height: CHART_HEIGHT + 20, alignItems: "center", justifyContent: "center" }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : (
            <InteractiveChart
              prices={displayChartPrices}
              timestamps={chartTimestamps}
              rangeKey={CHART_RANGES[selectedRange].range}
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

          {/* ── Manual refresh ── */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 14, paddingTop: 4 }}>
            {/* Free tier: info text */}
            {tier === "free" && (
              <Text style={[styles.autoUpdateNote, { color: colors.mutedForeground }]}>
                Auto-updates every 15 min · Upgrade to Pro or Premium for manual refresh
              </Text>
            )}
            {/* Pro / Premium: refresh button */}
            {(tier === "pro" || tier === "premium") && (
              <TouchableOpacity
                onPress={handleManualRefresh}
                disabled={isOnCooldown || refreshing}
                style={[
                  styles.refreshButton,
                  {
                    backgroundColor: (isOnCooldown || refreshing) ? colors.secondary : refreshError ? `${colors.negative}14` : `${colors.primary}18`,
                    borderColor: (isOnCooldown || refreshing) ? colors.border : refreshError ? `${colors.negative}40` : `${colors.primary}44`,
                  },
                ]}
              >
                <Feather
                  name="refresh-cw"
                  size={13}
                  color={(isOnCooldown || refreshing) ? colors.mutedForeground : refreshError ? colors.negative : colors.primary}
                />
                <Text style={[styles.refreshButtonText, { color: (isOnCooldown || refreshing) ? colors.mutedForeground : refreshError ? colors.negative : colors.primary }]}>
                  {refreshing
                    ? "Refreshing all data…"
                    : refreshError
                    ? "Refresh failed — try again"
                    : isOnCooldown
                    ? `Refreshes in ${cooldownMin} min`
                    : "Refresh Stock"}
                </Text>
                {!refreshing && !refreshError && !isOnCooldown && tier === "pro" && (
                  <View style={[styles.tierChip, { backgroundColor: colors.warning + "22" }]}>
                    <Text style={[styles.tierChipText, { color: colors.warning }]}>PRO</Text>
                  </View>
                )}
                {!refreshing && !refreshError && !isOnCooldown && tier === "premium" && (
                  <View style={[styles.tierChip, { backgroundColor: colors.positive + "22" }]}>
                    <Text style={[styles.tierChipText, { color: colors.positive }]}>PREMIUM</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
          </View>
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

      {/* ── Folder Picker Sheet ── */}
      <Modal
        visible={folderSheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFolderSheetVisible(false)}
      >
        <TouchableOpacity
          style={styles.folderSheetOverlay}
          activeOpacity={1}
          onPress={() => setFolderSheetVisible(false)}
        >
          <View
            style={[styles.folderSheetPanel, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.folderSheetHeader}>
              <Text style={[styles.folderSheetTitle, { color: colors.foreground }]}>Save to Folders</Text>
              <Text style={[styles.folderSheetSub, { color: colors.mutedForeground }]}>{ticker}</Text>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {folders.map((folder) => {
                const inThis = isInFolder(ticker ?? "", folder.id);
                return (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderSheetRow,
                      { borderColor: inThis ? `${colors.positive}44` : colors.border, backgroundColor: inThis ? `${colors.positive}10` : "transparent" },
                    ]}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      if (inThis) {
                        removeFromFolder(ticker!, folder.id);
                      } else {
                        addToFolder(ticker!, folder.id, {
                          ticker: ticker!,
                          name,
                          exchange,
                          exchangeFlag: flag,
                          price,
                          currency,
                          change: periodChangePoints,
                          changePercent: periodChangePct,
                        });
                      }
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={styles.folderSheetRowInfo}>
                      <Text style={[styles.folderSheetRowName, { color: colors.foreground }]}>{folder.name}</Text>
                      {folder.tickers.length > 0 && (
                        <Text style={[styles.folderSheetRowCount, { color: colors.mutedForeground }]}>
                          {folder.tickers.length} stock{folder.tickers.length !== 1 ? "s" : ""}
                        </Text>
                      )}
                    </View>
                    <View style={[styles.folderSheetCheck, {
                      backgroundColor: inThis ? colors.positive : "transparent",
                      borderColor: inThis ? colors.positive : colors.border,
                    }]}>
                      {inThis && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            {!inAnyFolder && (
              <TouchableOpacity
                style={[styles.folderSheetSaveBtn, { backgroundColor: colors.primary }]}
                onPress={() => {
                  addToWatchlist(ticker!);
                  setFolderSheetVisible(false);
                }}
              >
                <Feather name="bookmark" size={16} color={colors.primaryForeground} />
                <Text style={[styles.folderSheetSaveBtnText, { color: colors.primaryForeground }]}>
                  Save to My Watchlist
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.folderSheetDone, { backgroundColor: colors.secondary, borderColor: colors.border }]}
              onPress={() => setFolderSheetVisible(false)}
            >
              <Text style={[styles.folderSheetDoneText, { color: colors.foreground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason={paywallReason}
        currentTier={tier}
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

  marketClosedBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, marginBottom: 8, alignSelf: "flex-start" },
  marketClosedText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  autoUpdateNote: { fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 15, textAlign: "center" },
  refreshButton: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, alignSelf: "stretch", justifyContent: "center" },
  refreshButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  tierChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginLeft: 2 },
  tierChipText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },

  openCloseRow: { flexDirection: "row", alignItems: "stretch", marginTop: 14, borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  openCloseItem: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12, paddingHorizontal: 6, gap: 4 },
  openCloseLabel: { fontSize: 10, fontFamily: "Inter_400Regular", textTransform: "uppercase", letterSpacing: 0.5 },
  openCloseValue: { fontSize: 13, fontFamily: "Inter_700Bold", textAlign: "center" },
  openCloseSubValue: { fontSize: 11, fontFamily: "Inter_400Regular", textAlign: "center", opacity: 0.8 },
  openCloseDivider: { width: 1, alignSelf: "stretch" },
  marketStatusRow: { marginTop: 10, flexDirection: "row" },
  marketStatusChip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  marketStatusDot: { width: 6, height: 6, borderRadius: 3 },
  marketStatusText: { fontSize: 11, fontFamily: "Inter_400Regular" },

  folderSheetOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
  folderSheetPanel: { width: "100%", maxWidth: 360, borderRadius: 22, borderWidth: 1, padding: 20, gap: 14 },
  folderSheetHeader: { gap: 2 },
  folderSheetTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  folderSheetSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  folderSheetRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  folderSheetRowInfo: { flex: 1, gap: 2 },
  folderSheetRowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  folderSheetRowCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  folderSheetCheck: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  folderSheetSaveBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 13, borderRadius: 12, gap: 8 },
  folderSheetSaveBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  folderSheetDone: { alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  folderSheetDoneText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
