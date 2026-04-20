import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useAlerts } from "@/context/AlertsContext";
import { useWatchlist } from "@/context/WatchlistContext";
import AlertSetupSheet from "@/components/AlertSetupSheet";
import type { UserAlert, AlertType } from "@/services/alertsApi";

const TYPE_LABEL: Record<AlertType, string> = {
  price_above: "Above",
  price_below: "Below",
  pct_change_day: "±% day",
};

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks } = useWatchlist();
  const { enabled, evaluatorHealthy, alerts, events, loading, refresh } = useAlerts();
  const [symbolSheet, setSymbolSheet] = useState<string | null>(null);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const groupedAlerts = useMemo(() => {
    const map = new Map<string, UserAlert[]>();
    for (const a of alerts) {
      const list = map.get(a.symbol) ?? [];
      list.push(a);
      map.set(a.symbol, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [alerts]);

  const recentFires = events.slice(0, 10);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPadding + 16,
        paddingBottom: bottomPadding,
        paddingHorizontal: 16,
      }}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={refresh} tintColor={colors.primary} />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Alerts</Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Your price and daily-move alerts, grouped by stock.
      </Text>

      {!enabled && (
        <View style={[styles.banner, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
          <Feather name="info" size={16} color={colors.mutedForeground} />
          <Text style={[styles.bannerText, { color: colors.mutedForeground }]}>
            Alerts are rolling out gradually. You'll get access once the feature is enabled for your account.
          </Text>
        </View>
      )}
      {enabled && !evaluatorHealthy && (
        <View style={[styles.banner, { backgroundColor: colors.warning + "22", borderColor: colors.warning + "55" }]}>
          <Feather name="alert-triangle" size={16} color={colors.warning} />
          <Text style={[styles.bannerText, { color: colors.warning }]}>
            Alerts may be delayed — our evaluator isn't checking in right now.
          </Text>
        </View>
      )}

      {enabled && groupedAlerts.length === 0 && (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="bell-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No alerts yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Open a stock and tap the bell icon to set a price or daily-move alert.
          </Text>
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync();
              router.push("/(tabs)/index");
            }}
            style={[styles.ctaBtn, { backgroundColor: colors.primary }]}
          >
            <Text style={[styles.ctaBtnText, { color: colors.primaryForeground }]}>Browse watchlist</Text>
          </TouchableOpacity>
        </View>
      )}

      {groupedAlerts.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>BY STOCK</Text>
          {groupedAlerts.map(([symbol, list]) => {
            const stock = stocks[symbol];
            const active = list.filter((a) => a.status === "active").length;
            const snoozed = list.filter((a) => a.status === "snoozed").length;
            return (
              <TouchableOpacity
                key={symbol}
                style={[styles.groupCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSymbolSheet(symbol);
                }}
              >
                <View style={styles.groupHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.groupSymbol, { color: colors.foreground }]}>{symbol}</Text>
                    {stock?.name && (
                      <Text style={[styles.groupName, { color: colors.mutedForeground }]} numberOfLines={1}>
                        {stock.name}
                      </Text>
                    )}
                  </View>
                  <View style={[styles.countPill, { backgroundColor: colors.primary + "22" }]}>
                    <Text style={[styles.countPillText, { color: colors.primary }]}>
                      {active} active{snoozed ? ` · ${snoozed} snoozed` : ""}
                    </Text>
                  </View>
                </View>
                {list.map((a) => (
                  <View
                    key={a.id}
                    style={[styles.alertRow, { borderTopColor: colors.border }]}
                  >
                    <Text style={[styles.alertType, { color: colors.primary }]}>{TYPE_LABEL[a.type]}</Text>
                    <Text style={[styles.alertThreshold, { color: colors.foreground }]}>
                      {a.threshold}
                      {a.type === "pct_change_day" ? "%" : ""}
                    </Text>
                    <Text
                      style={[
                        styles.alertStatus,
                        {
                          color:
                            a.status === "active"
                              ? colors.positive
                              : a.status === "snoozed"
                                ? colors.warning
                                : colors.mutedForeground,
                        },
                      ]}
                    >
                      {a.status}
                    </Text>
                    <Text style={[styles.alertLastFired, { color: colors.mutedForeground }]}>
                      {a.lastFiredAt ? `fired ${formatRelative(a.lastFiredAt)}` : "—"}
                    </Text>
                  </View>
                ))}
              </TouchableOpacity>
            );
          })}
        </>
      )}

      {recentFires.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
            RECENT FIRES
          </Text>
          {recentFires.map((e) => (
            <TouchableOpacity
              key={e.id}
              style={[styles.fireRow, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: e.symbol } })}
            >
              <View style={[styles.fireIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="bell" size={14} color={colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.fireSymbol, { color: colors.foreground }]}>
                  {e.symbol} {TYPE_LABEL[e.type]} {e.threshold}
                  {e.type === "pct_change_day" ? "%" : ""}
                </Text>
                <Text style={[styles.fireMeta, { color: colors.mutedForeground }]}>
                  price {e.priceAtFire.toFixed(2)} · {formatRelative(e.firedAt)}
                  {e.deliveredVia ? ` · ${e.deliveredVia}` : ""}
                </Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
          ))}
        </>
      )}

      {symbolSheet && (
        <AlertSetupSheet
          visible={!!symbolSheet}
          onClose={() => setSymbolSheet(null)}
          symbol={symbolSheet}
          currentPrice={stocks[symbolSheet]?.price}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", marginBottom: 4 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginBottom: 16 },
  banner: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 10,
    borderRadius: 10, borderWidth: 1, marginBottom: 14,
  },
  bannerText: { fontSize: 12, fontFamily: "Inter_500Medium", flex: 1 },
  sectionLabel: {
    fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 8,
  },
  groupCard: {
    borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10,
  },
  groupHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 },
  groupSymbol: { fontSize: 16, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  groupName: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  countPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  countPillText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  alertRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingTop: 8, paddingBottom: 4, borderTopWidth: 1,
  },
  alertType: { fontSize: 12, fontFamily: "Inter_700Bold", width: 64 },
  alertThreshold: { fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 },
  alertStatus: { fontSize: 11, fontFamily: "Inter_600SemiBold", textTransform: "uppercase" },
  alertLastFired: { fontSize: 11, fontFamily: "Inter_400Regular" },
  empty: {
    alignItems: "center", paddingVertical: 44, gap: 10, borderWidth: 1,
    borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 24, marginTop: 8,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  ctaBtn: { marginTop: 6, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  ctaBtnText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  fireRow: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12,
    borderRadius: 12, borderWidth: 1, marginBottom: 8,
  },
  fireIcon: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  fireSymbol: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  fireMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
});
