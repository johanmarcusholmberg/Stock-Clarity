import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import {
  FlatList,
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
import StockCard from "@/components/StockCard";

export default function WatchlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { watchlist, stocks, unreadAlertCount } = useWatchlist();

  const watchedStocks = watchlist
    .map((ticker) => stocks[ticker])
    .filter(Boolean);

  const totalPortfolioValue = watchedStocks.reduce((sum, s) => sum + s.price, 0);
  const gainers = watchedStocks.filter((s) => s.changePercent >= 0).length;
  const losers = watchedStocks.filter((s) => s.changePercent < 0).length;

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

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
        <View>
          <Text style={[styles.greeting, { color: colors.mutedForeground }]}>Good morning</Text>
          <Text style={[styles.appTitle, { color: colors.foreground }]}>StockClarify</Text>
        </View>
        <TouchableOpacity
          style={[styles.alertButton, { backgroundColor: colors.secondary }]}
          onPress={() => router.push("/(tabs)/alerts")}
        >
          <Feather name="bell" size={20} color={unreadAlertCount > 0 ? colors.primary : colors.mutedForeground} />
          {unreadAlertCount > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.primary }]}>
              <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{unreadAlertCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={[styles.statsRow, { marginTop: 20, marginBottom: 24 }]}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.foreground }]}>{watchedStocks.length}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Watching</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.positive }]}>{gainers}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Gainers</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.statValue, { color: colors.negative }]}>{losers}</Text>
          <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Losers</Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Watchlist</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}
          onPress={() => router.push("/(tabs)/search")}
        >
          <Feather name="plus" size={14} color={colors.primary} />
          <Text style={[styles.addButtonText, { color: colors.primary }]}>Add stock</Text>
        </TouchableOpacity>
      </View>

      {watchedStocks.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No stocks yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Add stocks to your watchlist to start receiving updates and insights.
          </Text>
          <TouchableOpacity
            style={[styles.emptyButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Text style={[styles.emptyButtonText, { color: colors.primaryForeground }]}>Browse stocks</Text>
          </TouchableOpacity>
        </View>
      ) : (
        watchedStocks.map((stock) => <StockCard key={stock.ticker} stock={stock} />)
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  greeting: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 2,
  },
  appTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  alertButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 14,
    height: 14,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
  },
  statsRow: {
    flexDirection: "row",
    gap: 10,
  },
  statCard: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  statValue: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  addButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
  },
  addButtonText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
  emptyButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    marginTop: 8,
  },
  emptyButtonText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
