import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useMemo, useState } from "react";
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
import { useNotify } from "@/context/NotifyContext";
import { useWatchlist } from "@/context/WatchlistContext";
import AlertSetupSheet from "@/components/AlertSetupSheet";
import NotifyOptInSheet from "@/components/NotifyOptInSheet";
import type { UserAlert, AlertType } from "@/services/alertsApi";
import { isEventSuppressed, type NotifyEvent } from "@/services/notifyApi";

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
  const notify = useNotify();
  const [symbolSheet, setSymbolSheet] = useState<string | null>(null);
  const [optInVisible, setOptInVisible] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  // First-time opt-in: show the sheet exactly once per device when notify is
  // enabled AND the user has no defaults yet AND the AsyncStorage flag is
  // unset. We wait for AsyncStorage hydration to avoid a one-frame flash on
  // launch when the flag was previously set. Choosing any option (incl.
  // "Off") writes muted defaults so this never fires twice.
  useEffect(() => {
    if (!notify.enabled) return;
    if (!notify.firstTimeHydrated) return;
    if (notify.firstTimeShown) return;
    if (notify.defaults.news || notify.defaults.earnings) return;
    setOptInVisible(true);
  }, [
    notify.enabled,
    notify.firstTimeHydrated,
    notify.firstTimeShown,
    notify.defaults.news,
    notify.defaults.earnings,
  ]);

  const groupedAlerts = useMemo(() => {
    const map = new Map<string, UserAlert[]>();
    for (const a of alerts) {
      const list = map.get(a.symbol) ?? [];
      list.push(a);
      map.set(a.symbol, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [alerts]);

  // Combined inbox: alert_events (price fires) UNION notification_events
  // (news + earnings), grouped by symbol, ordered by fired_at DESC inside
  // each group. Cap each symbol so the screen stays scannable.
  const inboxBySymbol = useMemo(() => {
    type Item =
      | { kind: "price"; firedAt: string; symbol: string; data: typeof events[number] }
      | { kind: "notify"; firedAt: string; symbol: string; data: NotifyEvent };
    const items: Item[] = [];
    for (const e of events) {
      items.push({ kind: "price", firedAt: e.firedAt, symbol: e.symbol, data: e });
    }
    for (const n of notify.events) {
      items.push({ kind: "notify", firedAt: n.fired_at, symbol: n.symbol, data: n });
    }
    items.sort((a, b) => +new Date(b.firedAt) - +new Date(a.firedAt));
    const map = new Map<string, Item[]>();
    for (const it of items) {
      const list = map.get(it.symbol) ?? [];
      list.push(it);
      map.set(it.symbol, list);
    }
    return Array.from(map.entries())
      .map(([symbol, list]) => [symbol, list.slice(0, 6)] as const)
      .sort(
        (a, b) =>
          +new Date(b[1][0]?.firedAt ?? 0) - +new Date(a[1][0]?.firedAt ?? 0),
      );
  }, [events, notify.events]);

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

      {inboxBySymbol.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.mutedForeground, marginTop: 20 }]}>
            RECENT FIRES
          </Text>
          {inboxBySymbol.map(([symbol, items]) => (
            <View
              key={symbol}
              style={[styles.inboxCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <TouchableOpacity
                style={styles.inboxHeader}
                onPress={() =>
                  router.push({ pathname: "/stock/[ticker]", params: { ticker: symbol } })
                }
              >
                <Text style={[styles.inboxSymbol, { color: colors.foreground }]}>{symbol}</Text>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
              {items.map((it) => {
                if (it.kind === "price") {
                  const e = it.data;
                  return (
                    <View
                      key={`p-${e.id}`}
                      style={[styles.inboxRow, { borderTopColor: colors.border }]}
                    >
                      <View style={[styles.fireIcon, { backgroundColor: colors.primary + "22" }]}>
                        <Feather name="bell" size={12} color={colors.primary} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[styles.fireSymbol, { color: colors.foreground }]}>
                          {TYPE_LABEL[e.type]} {e.threshold}
                          {e.type === "pct_change_day" ? "%" : ""}
                        </Text>
                        <Text style={[styles.fireMeta, { color: colors.mutedForeground }]}>
                          price {e.priceAtFire.toFixed(2)} · {formatRelative(e.firedAt)}
                          {e.deliveredVia ? ` · ${e.deliveredVia}` : ""}
                        </Text>
                      </View>
                    </View>
                  );
                }
                const n = it.data;
                const suppressed = isEventSuppressed(n);
                const tone = suppressed ? colors.mutedForeground : colors.foreground;
                const subTone = colors.mutedForeground;
                const reason = suppressed
                  ? n.delivered_via === "suppressed:cap"
                    ? "held — daily cap"
                    : n.delivered_via === "suppressed:quiet_hours"
                      ? "held — quiet hours"
                      : "held"
                  : n.delivered_via ?? "queued";
                return (
                  <View
                    key={`n-${n.id}`}
                    style={[
                      styles.inboxRow,
                      { borderTopColor: colors.border, opacity: suppressed ? 0.55 : 1 },
                    ]}
                  >
                    <View
                      style={[
                        styles.fireIcon,
                        {
                          backgroundColor: suppressed
                            ? colors.mutedForeground + "22"
                            : colors.primary + "22",
                        },
                      ]}
                    >
                      <Feather
                        name={n.kind === "news" ? "rss" : "calendar"}
                        size={12}
                        color={suppressed ? colors.mutedForeground : colors.primary}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={[styles.fireSymbol, { color: tone }]}
                        numberOfLines={1}
                      >
                        {n.title}
                      </Text>
                      <Text style={[styles.fireMeta, { color: subTone }]} numberOfLines={1}>
                        {formatRelative(n.fired_at)} · {reason}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
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
      <NotifyOptInSheet visible={optInVisible} onClose={() => setOptInVisible(false)} />
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
  inboxCard: {
    borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6,
  },
  inboxHeader: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingBottom: 8,
  },
  inboxSymbol: { fontSize: 14, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  inboxRow: {
    flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 8, paddingBottom: 8,
    borderTopWidth: 1,
  },
});
