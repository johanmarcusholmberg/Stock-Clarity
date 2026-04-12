import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import React from "react";
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
import EventCard from "@/components/EventCard";
import MiniChart from "@/components/MiniChart";

export default function StockDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, events, addToWatchlist, removeFromWatchlist, isInWatchlist } = useWatchlist();

  const stock = stocks[ticker ?? ""];
  const stockEvents = events.filter((e) => e.ticker === ticker);
  const inWatchlist = isInWatchlist(ticker ?? "");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 20 : insets.bottom + 20;

  if (!stock) {
    return (
      <View style={[styles.notFound, { backgroundColor: colors.background }]}>
        <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
        <Text style={[styles.notFoundText, { color: colors.mutedForeground }]}>Stock not found</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={[styles.backLink, { color: colors.primary }]}>Go back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const isPositive = stock.change >= 0;
  const changeColor = isPositive ? colors.positive : colors.negative;

  const handleToggleWatchlist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (inWatchlist) {
      removeFromWatchlist(ticker!);
    } else {
      addToWatchlist(ticker!);
    }
  };

  const formatPrice = (price: number) => {
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingBottom: bottomPadding,
      }}
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
          onPress={handleToggleWatchlist}
          style={[
            styles.watchlistButton,
            {
              backgroundColor: inWatchlist ? `${colors.primary}22` : colors.primary,
              borderColor: inWatchlist ? `${colors.primary}44` : colors.primary,
            },
          ]}
        >
          <Feather
            name={inWatchlist ? "check" : "plus"}
            size={14}
            color={inWatchlist ? colors.primary : colors.primaryForeground}
          />
          <Text
            style={[
              styles.watchlistButtonText,
              { color: inWatchlist ? colors.primary : colors.primaryForeground },
            ]}
          >
            {inWatchlist ? "Watching" : "Add to watchlist"}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.heroSection, { paddingHorizontal: 16 }]}>
        <View style={styles.tickerRow}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerBadgeText, { color: colors.primary }]}>{stock.ticker}</Text>
          </View>
          <Text style={[styles.sectorLabel, { color: colors.mutedForeground }]}>{stock.sector}</Text>
        </View>
        <Text style={[styles.stockName, { color: colors.foreground }]}>{stock.name}</Text>
        <Text style={[styles.stockDescription, { color: colors.mutedForeground }]}>{stock.description}</Text>

        <View style={styles.priceRow}>
          <Text style={[styles.priceText, { color: colors.foreground }]}>${formatPrice(stock.price)}</Text>
          <View style={[styles.changePill, { backgroundColor: `${changeColor}22` }]}>
            <Feather name={isPositive ? "trending-up" : "trending-down"} size={13} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}% today
            </Text>
          </View>
        </View>
      </View>

      <View style={[styles.chartCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.chartHeader}>
          <Text style={[styles.chartTitle, { color: colors.foreground }]}>30-Day Price</Text>
          <Text style={[styles.marketCap, { color: colors.mutedForeground }]}>Market cap: {stock.marketCap}</Text>
        </View>
        <MiniChart data={stock.priceHistory} color={changeColor} width={300} height={80} />
        <View style={styles.chartFooterRow}>
          <Text style={[styles.chartFooterLabel, { color: colors.mutedForeground }]}>30 days ago</Text>
          <Text style={[styles.chartFooterLabel, { color: colors.mutedForeground }]}>Today</Text>
        </View>
      </View>

      <View style={[styles.section, { paddingHorizontal: 16 }]}>
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>Recent Events</Text>
        <Text style={[styles.sectionSubtitle, { color: colors.mutedForeground }]}>
          Tap to expand each event — covers what happened, why it may matter, and context.
        </Text>
        {stockEvents.length === 0 ? (
          <View style={[styles.noEvents, { borderColor: colors.border }]}>
            <Text style={[styles.noEventsText, { color: colors.mutedForeground }]}>
              No recent events to display for {stock.ticker}.
            </Text>
          </View>
        ) : (
          stockEvents.map((event) => <EventCard key={event.id} event={event} />)
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  watchlistButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 5,
  },
  watchlistButtonText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  heroSection: {
    paddingBottom: 16,
  },
  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  tickerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tickerBadgeText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  sectorLabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  stockName: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  stockDescription: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 16,
  },
  priceRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  priceText: {
    fontSize: 32,
    fontFamily: "Inter_700Bold",
    letterSpacing: -1,
  },
  changePill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  changeText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  chartCard: {
    margin: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  chartHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  chartTitle: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  marketCap: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  chartFooterRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
  },
  chartFooterLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
  },
  section: {
    marginTop: 4,
    paddingBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  sectionSubtitle: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
    marginBottom: 12,
  },
  noEvents: {
    padding: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    alignItems: "center",
  },
  noEventsText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  notFound: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  notFoundText: {
    fontSize: 16,
    fontFamily: "Inter_400Regular",
  },
  backLink: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
