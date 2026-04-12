import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Platform,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import SearchBar from "@/components/SearchBar";

const EXCHANGES = [
  { key: "NASDAQ", label: "NASDAQ — United States", flag: "🇺🇸" },
  { key: "NYSE", label: "NYSE — United States", flag: "🇺🇸" },
  { key: "LSE", label: "LSE — United Kingdom", flag: "🇬🇧" },
  { key: "XETRA", label: "XETRA — Germany", flag: "🇩🇪" },
  { key: "Euronext", label: "Euronext — France", flag: "🇫🇷" },
  { key: "TSE", label: "TSE — Japan", flag: "🇯🇵" },
  { key: "HKEX", label: "HKEX — Hong Kong", flag: "🇭🇰" },
  { key: "TSX", label: "TSX — Canada", flag: "🇨🇦" },
  { key: "ASX", label: "ASX — Australia", flag: "🇦🇺" },
  { key: "SIX", label: "SIX — Switzerland", flag: "🇨🇭" },
  { key: "NSE", label: "NSE — India", flag: "🇮🇳" },
];

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();
  const [query, setQuery] = useState("");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const allStocks = Object.values(stocks);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return allStocks;
    return allStocks.filter(
      (s) =>
        s.ticker.toUpperCase().includes(q) ||
        s.name.toUpperCase().includes(q) ||
        s.sector.toUpperCase().includes(q) ||
        s.exchange.toUpperCase().includes(q) ||
        s.exchangeFlag.includes(q)
    );
  }, [allStocks, query]);

  const sections = useMemo(() => {
    if (query.trim()) {
      return [{ title: `Results (${filtered.length})`, data: filtered }];
    }
    return EXCHANGES.map((ex) => ({
      title: `${ex.flag}  ${ex.label}`,
      data: allStocks.filter((s) => s.exchange === ex.key),
    })).filter((s) => s.data.length > 0);
  }, [filtered, allStocks, query]);

  const handleToggle = (ticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (isInWatchlist(ticker)) {
      removeFromWatchlist(ticker);
    } else {
      addToWatchlist(ticker);
    }
  };

  const renderItem = ({ item }: { item: ReturnType<typeof Object.values<typeof stocks>>[0] }) => {
    const stock = item as typeof allStocks[0];
    const inWatchlist = isInWatchlist(stock.ticker);
    const isPositive = stock.changePercent >= 0;
    const changeColor = isPositive ? colors.positive : colors.negative;

    const formatPrice = (price: number, currency: string) => {
      if (price >= 1000) {
        return `${currency === "GBp" ? "p" : ""}${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
      }
      return `${price.toFixed(2)}`;
    };

    return (
      <View style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.rowLeft}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerText, { color: colors.primary }]} numberOfLines={1}>
              {stock.ticker.length > 8 ? stock.ticker.split(".")[0] : stock.ticker}
            </Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.stockName, { color: colors.foreground }]} numberOfLines={1}>
              {stock.name}
            </Text>
            <Text style={[styles.stockMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {stock.sector} · {stock.currency}
            </Text>
          </View>
        </View>
        <View style={styles.rowRight}>
          <Text style={[styles.stockPrice, { color: colors.foreground }]}>
            {formatPrice(stock.price, stock.currency)}
          </Text>
          <Text style={[styles.stockChange, { color: changeColor }]}>
            {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addBtn, {
            backgroundColor: inWatchlist ? `${colors.primary}22` : colors.primary,
            borderColor: inWatchlist ? `${colors.primary}44` : colors.primary,
          }]}
          onPress={() => handleToggle(stock.ticker)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name={inWatchlist ? "check" : "plus"} size={16} color={inWatchlist ? colors.primary : colors.primaryForeground} />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 16, paddingHorizontal: 16 }}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>World Markets</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Search stocks from 11 global exchanges and add them to your watchlist.
        </Text>
        <View style={{ marginTop: 12, marginBottom: 4 }}>
          <SearchBar value={query} onChangeText={setQuery} placeholder="Search by name, ticker, exchange..." />
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.ticker}
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: bottomPadding,
          paddingTop: 8,
        }}
        renderSectionHeader={({ section: { title } }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
            <Text style={[styles.sectionHeaderText, { color: colors.mutedForeground }]}>{title}</Text>
          </View>
        )}
        renderItem={renderItem}
        ListEmptyComponent={
          <View style={styles.emptySearch}>
            <Feather name="globe" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No stocks matched "{query}"</Text>
          </View>
        }
        stickySectionHeadersEnabled={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionHeader: { paddingVertical: 10 },
  sectionHeaderText: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12,
    borderWidth: 1, marginBottom: 7, gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  tickerBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 44, alignItems: "center" },
  tickerText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  nameBlock: { flex: 1, minWidth: 0 },
  stockName: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  stockMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rowRight: { alignItems: "flex-end", minWidth: 60 },
  stockPrice: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  stockChange: { fontSize: 11, fontFamily: "Inter_500Medium" },
  addBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  emptySearch: { alignItems: "center", paddingTop: 48, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
});
