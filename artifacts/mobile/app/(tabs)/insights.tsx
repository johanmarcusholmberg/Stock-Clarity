import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useState } from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWatchlist, Stock } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";

type FeatherIconName = React.ComponentProps<typeof Feather>["name"];
type PerfPeriod = "today" | "1w" | "1m";

function getPerformance(stock: Stock, period: PerfPeriod): number {
  if (period === "today") return stock.changePercent;
  const history = stock.priceHistory;
  if (!history || history.length < 2) return stock.changePercent;
  const current = history[history.length - 1];
  const daysBack = period === "1w" ? 5 : 20;
  const past = history[Math.max(0, history.length - 1 - daysBack)];
  if (!past || past === 0) return stock.changePercent;
  return ((current - past) / past) * 100;
}

function getVolatility(stock: Stock): number {
  const h = stock.priceHistory;
  if (!h || h.length < 2) return 0;
  const changes: number[] = [];
  for (let i = 1; i < h.length; i++) {
    if (h[i - 1] !== 0) changes.push(Math.abs((h[i] - h[i - 1]) / h[i - 1]) * 100);
  }
  if (!changes.length) return 0;
  return changes.reduce((a, b) => a + b, 0) / changes.length;
}

function get52wProximity(stock: Stock): { pctFromHigh: number; pctFromLow: number } {
  const h = stock.priceHistory;
  if (!h || !h.length) return { pctFromHigh: 0, pctFromLow: 0 };
  const high = Math.max(...h);
  const low = Math.min(...h);
  const current = stock.price;
  const pctFromHigh = high > 0 ? ((current - high) / high) * 100 : 0;
  const pctFromLow = low > 0 ? ((current - low) / low) * 100 : 0;
  return { pctFromHigh, pctFromLow };
}

function ColoredPct({ value, style }: { value: number; style?: object }) {
  const colors = useColors();
  const color = value >= 0 ? colors.positive : colors.negative;
  return (
    <Text style={[{ color, fontFamily: "Inter_600SemiBold", fontSize: 13 }, style]}>
      {value >= 0 ? "+" : ""}{value.toFixed(2)}%
    </Text>
  );
}

function SectionHeader({ title, icon }: { title: string; icon: FeatherIconName }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
      <Feather name={icon} size={16} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>{title}</Text>
    </View>
  );
}

function LockOverlay({ onUpgrade, message }: { onUpgrade: () => void; message: string }) {
  const colors = useColors();
  return (
    <View style={{
      position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: colors.background + "E8",
      borderRadius: 14, alignItems: "center", justifyContent: "center",
      padding: 20, gap: 10,
    }}>
      <View style={{ backgroundColor: colors.card, borderRadius: 40, padding: 10, marginBottom: 4 }}>
        <Feather name="lock" size={22} color={colors.primary} />
      </View>
      <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 15, textAlign: "center" }}>{message}</Text>
      <TouchableOpacity
        style={{ backgroundColor: colors.primary, borderRadius: 10, paddingHorizontal: 22, paddingVertical: 10, marginTop: 2 }}
        onPress={onUpgrade}
      >
        <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>Upgrade</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function InsightsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { watchlist, stocks } = useWatchlist();
  const { tier } = useSubscription();
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [period, setPeriod] = useState<PerfPeriod>("today");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const watchedStocks = useMemo(
    () => watchlist.map((t) => stocks[t]).filter(Boolean) as Stock[],
    [watchlist, stocks]
  );

  const isProOrPremium = tier === "pro" || tier === "premium";
  const isPremium = tier === "premium";

  // ─── Computed stats ────────────────────────────────────────────────────────

  const gainers = watchedStocks.filter((s) => s.changePercent >= 0);
  const losers = watchedStocks.filter((s) => s.changePercent < 0);
  const avgChange = watchedStocks.length
    ? watchedStocks.reduce((sum, s) => sum + s.changePercent, 0) / watchedStocks.length
    : 0;

  const sortedByPerf = useMemo(() =>
    [...watchedStocks].sort((a, b) => getPerformance(b, period) - getPerformance(a, period)),
    [watchedStocks, period]
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

  const exchangeBreakdown = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of watchedStocks) {
      const ex = s.exchange || "Unknown";
      map[ex] = (map[ex] || 0) + 1;
    }
    return Object.entries(map)
      .map(([name, count]) => ({ name, count, pct: (count / watchedStocks.length) * 100 }))
      .sort((a, b) => b.count - a.count);
  }, [watchedStocks]);

  const avgVolatility = useMemo(() => {
    if (!watchedStocks.length) return 0;
    return watchedStocks.reduce((sum, s) => sum + getVolatility(s), 0) / watchedStocks.length;
  }, [watchedStocks]);

  // Weighted average P/E — price-weighted across stocks that have P/E data.
  // Yahoo Finance returns trailingPE on live quotes; seed data has static values.
  const weightedAvgPE = useMemo(() => {
    const withPE = watchedStocks.filter((s) => s.pe != null && s.pe > 0 && s.price > 0);
    if (!withPE.length) return null;
    const totalPrice = withPE.reduce((sum, s) => sum + s.price, 0);
    const weighted = withPE.reduce((sum, s) => sum + s.pe! * s.price, 0);
    return weighted / totalPrice;
  }, [watchedStocks]);

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
            Add some stocks to your watchlist to see portfolio-level insights and analytics here.
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

  // ─── Main screen ───────────────────────────────────────────────────────────
  return (
    <View style={[s.fill, { backgroundColor: colors.background }]}>
      <ScrollView
        style={s.fill}
        contentContainerStyle={{ paddingTop: topPadding + 16, paddingBottom: bottomPadding, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <Text style={{ color: colors.foreground, fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 4 }}>
          Insights
        </Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 20 }}>
          Analytics for your {watchedStocks.length} watched stock{watchedStocks.length !== 1 ? "s" : ""}
        </Text>

        {/* ── Free Preview Card (visible to all) ───────────────────────────── */}
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SectionHeader title="Today's Snapshot" icon="activity" />
          <View style={{ flexDirection: "row", gap: 10, marginBottom: 4 }}>
            <View style={[s.miniCard, { backgroundColor: colors.secondary, flex: 1 }]}>
              <Text style={{ color: colors.positive, fontSize: 22, fontFamily: "Inter_700Bold" }}>{gainers.length}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>Gainers</Text>
            </View>
            <View style={[s.miniCard, { backgroundColor: colors.secondary, flex: 1 }]}>
              <Text style={{ color: colors.negative, fontSize: 22, fontFamily: "Inter_700Bold" }}>{losers.length}</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>Losers</Text>
            </View>
            <View style={[s.miniCard, { backgroundColor: colors.secondary, flex: 1 }]}>
              <ColoredPct value={avgChange} style={{ fontSize: 16 }} />
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 }}>Avg Δ</Text>
            </View>
          </View>
        </View>

        {/* ── Teaser block for Free users (immediately below preview card) ─── */}
        {!isProOrPremium && (
          <View style={{ marginTop: 14 }}>
            {/* Blurred/dimmed shape previewing the sections below */}
            <View style={{ borderRadius: 14, overflow: "hidden", marginBottom: 14 }}>
              {/* Ghost rows that hint at the content underneath */}
              <View style={{ backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 16, gap: 10 }}>
                <View style={{ height: 14, width: "55%", backgroundColor: colors.secondary, borderRadius: 6 }} />
                {[80, 60, 45].map((w, i) => (
                  <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <View style={{ height: 10, width: `${w}%`, backgroundColor: colors.secondary, borderRadius: 4 }} />
                    <View style={{ height: 10, flex: 1, backgroundColor: colors.secondary, borderRadius: 4, opacity: 0.5 }} />
                  </View>
                ))}
                <View style={{ height: 6, width: "100%", backgroundColor: colors.secondary, borderRadius: 3, marginTop: 4 }} />
                <View style={{ height: 6, width: "70%", backgroundColor: colors.secondary, borderRadius: 3, opacity: 0.6 }} />
              </View>

              {/* Lock overlay on top of ghost rows */}
              <View style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: colors.background + "CC",
                borderRadius: 14, alignItems: "center", justifyContent: "center",
                padding: 24, gap: 10,
              }}>
                <View style={{ backgroundColor: colors.card, borderRadius: 40, padding: 10 }}>
                  <Feather name="lock" size={22} color={colors.primary} />
                </View>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_700Bold", fontSize: 16, textAlign: "center" }}>
                  Unlock Full Insights
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 }}>
                  Pro unlocks performance rankings, sector breakdown, and 52-week range. Premium adds exchange mix, volatility, and more.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 28, paddingVertical: 11, marginTop: 4 }}
                  onPress={() => setPaywallVisible(true)}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 15 }}>View Plans</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}

        {/* ── Pro stats sections ────────────────────────────────────────────── */}
        <View style={{ marginTop: isProOrPremium ? 16 : 0 }}>
          {/* Performance rankings */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, overflow: "hidden" }]}>
            <SectionHeader title="Performance" icon="trending-up" />

            {/* Period selector */}
            <View style={{ flexDirection: "row", backgroundColor: colors.secondary, borderRadius: 10, padding: 3, marginBottom: 14, gap: 2 }}>
              {(["today", "1w", "1m"] as PerfPeriod[]).map((p) => (
                <TouchableOpacity
                  key={p}
                  disabled={!isProOrPremium}
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
                <ColoredPct value={getPerformance(stock, period)} />
              </View>
            ))}

            <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 14, marginBottom: 8, letterSpacing: 0.5 }}>WORST</Text>
            {worstPerformers.map((stock, i) => (
              <View key={stock.ticker} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 7, borderBottomWidth: i < worstPerformers.length - 1 ? 1 : 0, borderBottomColor: colors.border }}>
                <Text style={{ color: colors.negative, fontFamily: "Inter_700Bold", fontSize: 13, width: 20 }}>#{i + 1}</Text>
                <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 }}>{stock.ticker}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }} numberOfLines={1}>{stock.name}</Text>
                <ColoredPct value={getPerformance(stock, period)} />
              </View>
            ))}

            {!isProOrPremium && (
              <LockOverlay message="Upgrade to Pro to see performance rankings" onUpgrade={() => setPaywallVisible(true)} />
            )}
          </View>

          {/* Sector Breakdown */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14, overflow: "hidden" }]}>
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
            {!isProOrPremium && (
              <LockOverlay message="Upgrade to Pro to see sector breakdown" onUpgrade={() => setPaywallVisible(true)} />
            )}
          </View>

          {/* 52-Week Proximity */}
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 14, overflow: "hidden" }]}>
            <SectionHeader title="52-Week Range Proximity" icon="maximize-2" />
            {watchedStocks.map((stock) => {
              const { pctFromHigh, pctFromLow } = get52wProximity(stock);
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
            {!isProOrPremium && (
              <LockOverlay message="Upgrade to Pro to see 52-week range data" onUpgrade={() => setPaywallVisible(true)} />
            )}
          </View>
        </View>

        {/* ── Premium Section ──────────────────────────────────────────────── */}
        <View style={{ marginTop: 14 }}>
          <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border, overflow: "hidden" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12, marginTop: 4 }}>
              <Feather name="star" size={16} color={colors.warning} />
              <Text style={{ color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" }}>Premium Insights</Text>
              <View style={{ backgroundColor: colors.warning + "22", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ color: colors.warning, fontSize: 10, fontFamily: "Inter_700Bold" }}>PREMIUM</Text>
              </View>
            </View>

            {/* Weighted avg P/E — price-weighted using trailingPE from Yahoo Finance */}
            <View style={[s.premiumRow, { borderBottomColor: colors.border }]}>
              <View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 }}>Weighted Avg P/E</Text>
                {weightedAvgPE != null ? (
                  <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>{weightedAvgPE.toFixed(1)}×</Text>
                ) : (
                  <>
                    <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>N/A</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 }}>No P/E data available</Text>
                  </>
                )}
              </View>
              <Feather name="bar-chart" size={20} color={colors.primary} />
            </View>

            {/* Exchange breakdown */}
            <View style={{ marginTop: 12, marginBottom: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 8, letterSpacing: 0.5 }}>EXCHANGE MIX</Text>
              {exchangeBreakdown.map((ex) => (
                <View key={ex.name} style={{ marginBottom: 8 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 3 }}>
                    <Text style={{ color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" }}>{ex.name}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>{ex.pct.toFixed(0)}%</Text>
                  </View>
                  <View style={{ height: 5, backgroundColor: colors.secondary, borderRadius: 3, overflow: "hidden" }}>
                    <View style={{ height: 5, width: `${ex.pct}%` as `${number}%`, backgroundColor: colors.accent, borderRadius: 3 }} />
                  </View>
                </View>
              ))}
            </View>

            {/* Volatility snapshot */}
            <View style={[s.premiumRow, { borderBottomWidth: 0, marginTop: 4 }]}>
              <View>
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 }}>Avg Monthly Volatility</Text>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <Text style={{ color: colors.foreground, fontSize: 20, fontFamily: "Inter_700Bold" }}>{avgVolatility.toFixed(2)}%</Text>
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" }}>avg daily swing</Text>
                </View>
              </View>
              <Feather name="zap" size={20} color={colors.warning} />
            </View>

            {!isPremium && (
              <LockOverlay
                message="Upgrade to Premium to unlock advanced analytics"
                onUpgrade={() => setPaywallVisible(true)}
              />
            )}
          </View>
        </View>
      </ScrollView>

      <PaywallSheet visible={paywallVisible} onClose={() => setPaywallVisible(false)} triggerReason="general" />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16 },
  miniCard: { padding: 12, borderRadius: 12, alignItems: "center" },
  premiumRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 10, borderBottomWidth: 1,
  },
});
