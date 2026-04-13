import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Dimensions,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Defs, LinearGradient, Path, Stop, Polyline } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { getChart, getQuotes, getEvents, CHART_RANGES, formatPrice, formatMarketCap, exchangeToFlag, type StockEvent } from "@/services/stockApi";

const SCREEN_WIDTH = Dimensions.get("window").width;
const CHART_HEIGHT = 120;
const CHART_PADDING = { left: 8, right: 8, top: 12, bottom: 12 };

function buildPath(prices: number[], width: number, height: number): string {
  if (!prices.length) return "";
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pts = prices.map((p, i) => {
    const x = CHART_PADDING.left + (i / (prices.length - 1)) * (width - CHART_PADDING.left - CHART_PADDING.right);
    const y = CHART_PADDING.top + (1 - (p - min) / range) * (height - CHART_PADDING.top - CHART_PADDING.bottom);
    return `${x},${y}`;
  });
  return "M" + pts.join("L");
}

interface ChartProps {
  prices: number[];
  color: string;
  width: number;
}

function LiveChart({ prices, color, width }: ChartProps) {
  if (!prices.length) return null;
  const height = CHART_HEIGHT;
  const pathD = buildPath(prices, width, height);
  const first = prices[0];
  const last = prices[prices.length - 1];
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const endX = CHART_PADDING.left + ((prices.length - 1) / (prices.length - 1)) * (width - CHART_PADDING.left - CHART_PADDING.right);
  const endY = CHART_PADDING.top + (1 - (last - min) / range) * (height - CHART_PADDING.top - CHART_PADDING.bottom);

  const closedPath = `${pathD}L${endX},${height - CHART_PADDING.bottom}L${CHART_PADDING.left},${height - CHART_PADDING.bottom}Z`;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={color} stopOpacity={0.0} />
        </LinearGradient>
      </Defs>
      <Path d={closedPath} fill="url(#grad)" />
      <Path d={pathD} stroke={color} strokeWidth={2} fill="none" />
    </Svg>
  );
}

const SENTIMENT_ICON: Record<string, string> = { positive: "trending-up", negative: "trending-down", neutral: "minus" };

interface ExpandableEventCardProps {
  event: StockEvent;
  colors: ReturnType<typeof import("@/hooks/useColors").useColors>;
}

function ExpandableEventCard({ event, colors }: ExpandableEventCardProps) {
  const [expanded, setExpanded] = useState(false);
  const sentColor = event.sentiment === "positive" ? colors.positive : event.sentiment === "negative" ? colors.negative : colors.mutedForeground;
  const date = new Date(event.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <TouchableOpacity
      style={[styles.eventCard, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setExpanded(!expanded); }}
      activeOpacity={0.8}
    >
      <View style={styles.eventHeader}>
        <View style={[styles.eventSentimentDot, { backgroundColor: sentColor }]} />
        <View style={styles.eventHeaderText}>
          <Text style={[styles.eventTitle, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
            {event.title}
          </Text>
          <Text style={[styles.eventMeta, { color: colors.mutedForeground }]}>
            {event.publisher ? `${event.publisher} · ` : ""}{date}
          </Text>
        </View>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
      </View>

      {expanded && (
        <View style={styles.eventBody}>
          <View style={[styles.eventDivider, { backgroundColor: colors.border }]} />
          <View style={styles.eventSection}>
            <Text style={[styles.eventSectionLabel, { color: colors.primary }]}>WHAT HAPPENED</Text>
            <Text style={[styles.eventSectionText, { color: colors.foreground }]}>{event.what}</Text>
          </View>
          <View style={styles.eventSection}>
            <Text style={[styles.eventSectionLabel, { color: "#F59E0B" }]}>WHY IT MATTERS</Text>
            <Text style={[styles.eventSectionText, { color: colors.foreground }]}>{event.why}</Text>
          </View>
          <View style={styles.eventSection}>
            <Text style={[styles.eventSectionLabel, { color: colors.mutedForeground }]}>UNUSUAL</Text>
            <Text style={[styles.eventSectionText, { color: colors.foreground }]}>{event.unusual}</Text>
          </View>
          {event.url ? (
            <TouchableOpacity
              style={[styles.readMoreBtn, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(event.url)}
            >
              <Feather name="external-link" size={12} color={colors.primary} />
              <Text style={[styles.readMoreText, { color: colors.primary }]}>Read full article</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function StockDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  const [liveQuote, setLiveQuote] = useState<any>(null);
  const [chartPrices, setChartPrices] = useState<number[]>([]);
  const [chartLoading, setChartLoading] = useState(true);
  const [events, setEvents] = useState<StockEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [selectedRange, setSelectedRange] = useState(2); // 1M default

  const cachedStock = stocks[ticker ?? ""];
  const inWatchlist = isInWatchlist(ticker ?? "");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const chartWidth = SCREEN_WIDTH - 48;

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
    } catch {
      setChartPrices(cachedStock?.priceHistory ?? []);
    } finally {
      setChartLoading(false);
    }
  }, [ticker, cachedStock]);

  useEffect(() => { loadChart(selectedRange); }, [selectedRange]);

  // Load events
  useEffect(() => {
    if (!ticker) return;
    setEventsLoading(true);
    getEvents(ticker).then((evts) => setEvents(evts)).catch(() => setEvents([])).finally(() => setEventsLoading(false));
  }, [ticker]);

  // Derived values
  const price = liveQuote?.regularMarketPrice ?? cachedStock?.price ?? 0;
  const change = liveQuote?.regularMarketChange ?? cachedStock?.change ?? 0;
  const changePercent = liveQuote?.regularMarketChangePercent ?? cachedStock?.changePercent ?? 0;
  const currency = liveQuote?.currency ?? cachedStock?.currency ?? "USD";
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 54 : insets.bottom + 20 }}
      showsVerticalScrollIndicator={false}
    >
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
            if (inWatchlist) { removeFromWatchlist(ticker!); }
            else { addToWatchlist(ticker!); }
          }}
          style={[styles.watchlistButton, {
            backgroundColor: inWatchlist ? `${colors.primary}22` : colors.primary,
            borderColor: inWatchlist ? `${colors.primary}44` : colors.primary,
          }]}
        >
          <Feather name={inWatchlist ? "check" : "plus"} size={14} color={inWatchlist ? colors.primary : colors.primaryForeground} />
          <Text style={[styles.watchlistButtonText, { color: inWatchlist ? colors.primary : colors.primaryForeground }]}>
            {inWatchlist ? "Watching" : "Add to watchlist"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.heroSection}>
        <View style={styles.tickerRow}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerBadgeText, { color: colors.primary }]}>{ticker}</Text>
          </View>
          {exchange ? <Text style={[styles.exchangeLabel, { color: colors.mutedForeground }]}>{flag} {exchange}</Text> : null}
          {sector ? <Text style={[styles.sectorLabel, { color: colors.mutedForeground }]}>· {sector}</Text> : null}
        </View>
        <Text style={[styles.stockName, { color: colors.foreground }]}>{name}</Text>

        <View style={styles.priceRow}>
          <Text style={[styles.priceText, { color: colors.foreground }]}>
            {currency === "GBp" ? "p" : ""}{formatPrice(price, currency)}
          </Text>
          <View style={[styles.changePill, { backgroundColor: `${changeColor}22` }]}>
            <Feather name={isPositive ? "trending-up" : "trending-down"} size={13} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {isPositive ? "+" : ""}{changePercent.toFixed(2)}%
            </Text>
          </View>
        </View>
        <Text style={[styles.changeAbsolute, { color: changeColor }]}>
          {change >= 0 ? "+" : ""}{change.toFixed(2)} today
        </Text>
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rangeRow}>
          {CHART_RANGES.map((r, i) => (
            <TouchableOpacity
              key={r.label}
              style={[
                styles.rangeChip,
                i === selectedRange && { backgroundColor: colors.primary, borderColor: colors.primary },
                i !== selectedRange && { backgroundColor: "transparent", borderColor: "transparent" },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedRange(i); }}
            >
              <Text style={[styles.rangeChipText, { color: i === selectedRange ? colors.primaryForeground : colors.mutedForeground }]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {chartLoading ? (
          <View style={{ height: CHART_HEIGHT, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <LiveChart prices={chartPrices} color={changeColor} width={chartWidth} />
        )}

        {chartPrices.length > 0 && (
          <View style={styles.chartFooterRow}>
            <Text style={[styles.chartFooterLabel, { color: colors.mutedForeground }]}>
              {formatPrice(chartPrices[0])}
            </Text>
            <Text style={[styles.chartFooterLabel, { color: changeColor }]}>
              {formatPrice(chartPrices[chartPrices.length - 1])}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.statsGrid, { paddingHorizontal: 16, marginBottom: 16 }]}>
        {[
          { label: "Market Cap", value: marketCap },
          { label: "52W High", value: fiftyTwoHigh ? formatPrice(fiftyTwoHigh) : "—" },
          { label: "52W Low", value: fiftyTwoLow ? formatPrice(fiftyTwoLow) : "—" },
          { label: "P/E Ratio", value: pe ? pe.toFixed(1) : "—" },
          { label: "Volume", value: volume ? (volume >= 1e6 ? `${(volume / 1e6).toFixed(1)}M` : `${(volume / 1e3).toFixed(0)}K`) : "—" },
          { label: "Currency", value: currency || "—" },
        ].map((item) => (
          <View key={item.label} style={[styles.statItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>{item.label}</Text>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{item.value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.section, { paddingHorizontal: 16 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent News</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
          Real events with AI-generated plain-language summaries. Tap to expand.
        </Text>

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
          events.map((event) => <ExpandableEventCard key={event.id} event={event} colors={colors} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingBottom: 12 },
  backButton: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  watchlistButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1, gap: 5 },
  watchlistButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  heroSection: { paddingHorizontal: 16, paddingBottom: 8 },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" },
  tickerBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  tickerBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  exchangeLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  sectorLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  stockName: { fontSize: 24, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 10 },
  priceRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  priceText: { fontSize: 36, fontFamily: "Inter_700Bold", letterSpacing: -1 },
  changePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, gap: 4 },
  changeText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  changeAbsolute: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2, marginBottom: 4 },
  chartCard: { marginHorizontal: 16, marginBottom: 16, padding: 16, borderRadius: 16, borderWidth: 1 },
  rangeRow: { flexDirection: "row", gap: 2, marginBottom: 12 },
  rangeChip: { flex: 1, paddingVertical: 5, borderRadius: 8, alignItems: "center", borderWidth: 1 },
  rangeChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  chartFooterRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
  chartFooterLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  statItem: { width: "48%", flexGrow: 1, padding: 12, borderRadius: 12, borderWidth: 1 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 4 },
  statValue: { fontSize: 16, fontFamily: "Inter_700Bold" },
  section: { paddingBottom: 16 },
  sectionTitle: { fontSize: 20, fontFamily: "Inter_700Bold", marginBottom: 4 },
  sectionSubtitle: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17, marginBottom: 12 },
  eventsLoading: { alignItems: "center", gap: 10, paddingVertical: 24 },
  eventsLoadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  noEvents: { padding: 20, borderRadius: 12, borderWidth: 1, borderStyle: "dashed", alignItems: "center" },
  noEventsText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  eventCard: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  eventHeader: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10 },
  eventSentimentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  eventHeaderText: { flex: 1 },
  eventTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20, marginBottom: 4 },
  eventMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  eventBody: { paddingHorizontal: 14, paddingBottom: 14 },
  eventDivider: { height: 1, marginBottom: 12 },
  eventSection: { marginBottom: 12 },
  eventSectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  eventSectionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  readMoreBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, marginTop: 4 },
  readMoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  notFound: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  notFoundText: { fontSize: 16, fontFamily: "Inter_400Regular" },
  backLink: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
