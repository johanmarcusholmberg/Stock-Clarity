import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import SearchBar from "@/components/SearchBar";

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, watchlist, addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [query, setQuery] = useState("");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const allStocks = Object.values(stocks);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return allStocks;
    return allStocks.filter(
      (s) =>
        s.ticker.includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q)
    );
  }, [allStocks, query]);

  const handleToggle = (ticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isInWatchlist(ticker)) {
      removeFromWatchlist(ticker);
    } else {
      addToWatchlist(ticker);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 16, paddingHorizontal: 16 }}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Add Stocks</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Search and add stocks to your watchlist.
        </Text>
        <View style={{ marginTop: 12, marginBottom: 4 }}>
          <SearchBar value={query} onChangeText={setQuery} autoFocus={false} />
        </View>
        <Text style={[styles.resultsCount, { color: colors.mutedForeground }]}>
          {filtered.length} stock{filtered.length !== 1 ? "s" : ""}
        </Text>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.ticker}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: bottomPadding,
          paddingTop: 4,
        }}
        scrollEnabled={filtered.length > 0}
        renderItem={({ item }) => {
          const inWatchlist = isInWatchlist(item.ticker);
          const isPositive = item.changePercent >= 0;
          const changeColor = isPositive ? colors.positive : colors.negative;
          return (
            <View
              style={[
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.rowLeft}>
                <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
                  <Text style={[styles.tickerText, { color: colors.primary }]}>{item.ticker}</Text>
                </View>
                <View style={styles.nameBlock}>
                  <Text style={[styles.stockName, { color: colors.foreground }]} numberOfLines={1}>
                    {item.name}
                  </Text>
                  <Text style={[styles.stockSector, { color: colors.mutedForeground }]}>{item.sector}</Text>
                </View>
              </View>
              <View style={styles.rowRight}>
                <Text style={[styles.stockPrice, { color: colors.foreground }]}>
                  ${item.price >= 1000 ? item.price.toLocaleString("en-US", { maximumFractionDigits: 0 }) : item.price.toFixed(2)}
                </Text>
                <Text style={[styles.stockChange, { color: changeColor }]}>
                  {isPositive ? "+" : ""}{item.changePercent.toFixed(2)}%
                </Text>
              </View>
              <TouchableOpacity
                style={[
                  styles.addBtn,
                  {
                    backgroundColor: inWatchlist ? `${colors.primary}22` : colors.primary,
                    borderColor: inWatchlist ? `${colors.primary}44` : colors.primary,
                  },
                ]}
                onPress={() => handleToggle(item.ticker)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Feather
                  name={inWatchlist ? "check" : "plus"}
                  size={16}
                  color={inWatchlist ? colors.primary : colors.primaryForeground}
                />
              </TouchableOpacity>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptySearch}>
            <Feather name="search" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No stocks matched "{query}"</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  resultsCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 12,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 7,
    gap: 10,
  },
  rowLeft: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  tickerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 44,
    alignItems: "center",
  },
  tickerText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  nameBlock: {
    flex: 1,
    minWidth: 0,
  },
  stockName: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 1,
  },
  stockSector: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
  rowRight: {
    alignItems: "flex-end",
    minWidth: 60,
  },
  stockPrice: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 1,
  },
  stockChange: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  addBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySearch: {
    alignItems: "center",
    paddingTop: 48,
    gap: 10,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
});
