import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
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
import { useWatchlist } from "@/context/WatchlistContext";
import AlertCard from "@/components/AlertCard";

type AlertFilter = "all" | "price_spike" | "volume_surge" | "gap_up" | "gap_down" | "breakout";

const ALERT_FILTERS: { key: AlertFilter; label: string; icon: string }[] = [
  { key: "all", label: "All", icon: "bell" },
  { key: "gap_up", label: "Gap Up", icon: "trending-up" },
  { key: "gap_down", label: "Gap Down", icon: "trending-down" },
  { key: "volume_surge", label: "Volume", icon: "activity" },
  { key: "price_spike", label: "Spike", icon: "zap" },
  { key: "breakout", label: "Breakout", icon: "maximize-2" },
];

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { alerts, unreadAlertCount } = useWatchlist();
  const [filter, setFilter] = useState<AlertFilter>("all");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const filtered = filter === "all" ? alerts : alerts.filter((a) => a.type === filter);
  const unread = filtered.filter((a) => !a.read);
  const read = filtered.filter((a) => a.read);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPadding + 16,
        paddingBottom: bottomPadding,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Alerts</Text>
        {unreadAlertCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
            <Text style={[styles.countText, { color: colors.primary }]}>{unreadAlertCount} new</Text>
          </View>
        )}
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Unusual activity on your watchlist — with plain-language explanations.
      </Text>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterScroll}
        style={{ marginBottom: 16 }}
      >
        {ALERT_FILTERS.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              styles.filterChip,
              {
                backgroundColor: filter === f.key ? colors.primary : colors.secondary,
                borderColor: filter === f.key ? colors.primary : colors.border,
              },
            ]}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(f.key); }}
          >
            <Feather
              name={f.icon as any}
              size={12}
              color={filter === f.key ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text style={[styles.filterChipText, { color: filter === f.key ? colors.primaryForeground : colors.mutedForeground }]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {filtered.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="bell-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
            {filter === "all" ? "No alerts yet" : `No ${ALERT_FILTERS.find(f => f.key === filter)?.label} alerts`}
          </Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            {filter === "all"
              ? "When unusual price or volume activity occurs on your watchlist stocks, you'll see it here with context."
              : "Try another filter or add more stocks to your watchlist."}
          </Text>
        </View>
      ) : (
        <>
          {unread.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>NEW</Text>
              {unread.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </>
          )}
          {read.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: unread.length > 0 ? 8 : 0 }]}>EARLIER</Text>
              {read.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  countText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, marginBottom: 16 },
  filterScroll: { paddingRight: 16, gap: 8 },
  filterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, gap: 5 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  groupLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 8 },
  empty: {
    alignItems: "center", paddingVertical: 48, gap: 10, borderWidth: 1,
    borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 24, marginTop: 8,
  },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
});
