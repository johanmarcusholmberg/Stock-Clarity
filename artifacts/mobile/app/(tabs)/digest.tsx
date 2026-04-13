import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
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
import { useWatchlist, DigestEntry } from "@/context/WatchlistContext";
import { getEvents, type EventPeriod } from "@/services/stockApi";
import DigestCard from "@/components/DigestCard";

type Tab = "daily" | "weekly";

const DAILY_CACHE_KEY = "@stockclarify_digest_daily";
const WEEKLY_CACHE_KEY = "@stockclarify_digest_weekly";
const DAILY_DATE_KEY = "@stockclarify_digest_daily_date";
const WEEKLY_DATE_KEY = "@stockclarify_digest_weekly_date";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function weekString() {
  const d = new Date();
  const week = Math.ceil(d.getDate() / 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-W${week}`;
}

export default function DigestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks } = useWatchlist();
  const [activeTab, setActiveTab] = useState<Tab>("daily");

  const [dailyEntries, setDailyEntries] = useState<DigestEntry[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<DigestEntry[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [dailyRefreshing, setDailyRefreshing] = useState(false);
  const [weeklyRefreshing, setWeeklyRefreshing] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const tickers = Object.keys(stocks);

  const fetchForPeriod = useCallback(async (period: EventPeriod): Promise<DigestEntry[]> => {
    const currentTickers = Object.keys(stocks);
    if (!currentTickers.length) return [];

    const results = await Promise.allSettled(
      currentTickers.map(async (ticker) => {
        const evts = await getEvents(ticker, period);
        return evts.slice(0, 3).map((e) => ({
          id: `${ticker}-${e.id}`,
          ticker,
          stockName: stocks[ticker]?.name ?? ticker,
          summary: e.title,
          what: e.what ?? "",
          why: e.why ?? "",
          unusual: e.unusual ?? "",
          sentiment: e.sentiment,
          timestamp: e.timestamp,
        } as DigestEntry));
      })
    );

    return results
      .flatMap((r) => (r.status === "fulfilled" ? r.value : []))
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [stocks]);

  const loadDaily = useCallback(async (force = false) => {
    const cached = await AsyncStorage.getItem(DAILY_CACHE_KEY);
    const cachedDate = await AsyncStorage.getItem(DAILY_DATE_KEY);

    if (!force && cached && cachedDate === todayString()) {
      try {
        const parsed = JSON.parse(cached) as DigestEntry[];
        if (parsed.length > 0) {
          setDailyEntries(parsed);
          return;
        }
      } catch {}
    }

    setDailyLoading(true);
    try {
      const entries = await fetchForPeriod("day");
      setDailyEntries(entries);
      await AsyncStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(entries));
      await AsyncStorage.setItem(DAILY_DATE_KEY, todayString());
    } catch {
      if (cached) {
        try { setDailyEntries(JSON.parse(cached)); } catch {}
      }
    } finally {
      setDailyLoading(false);
    }
  }, [fetchForPeriod]);

  const loadWeekly = useCallback(async (force = false) => {
    const cached = await AsyncStorage.getItem(WEEKLY_CACHE_KEY);
    const cachedDate = await AsyncStorage.getItem(WEEKLY_DATE_KEY);

    if (!force && cached && cachedDate === weekString()) {
      try {
        const parsed = JSON.parse(cached) as DigestEntry[];
        if (parsed.length > 0) {
          setWeeklyEntries(parsed);
          return;
        }
      } catch {}
    }

    setWeeklyLoading(true);
    try {
      const entries = await fetchForPeriod("week");
      setWeeklyEntries(entries);
      await AsyncStorage.setItem(WEEKLY_CACHE_KEY, JSON.stringify(entries));
      await AsyncStorage.setItem(WEEKLY_DATE_KEY, weekString());
    } catch {
      if (cached) {
        try { setWeeklyEntries(JSON.parse(cached)); } catch {}
      }
    } finally {
      setWeeklyLoading(false);
    }
  }, [fetchForPeriod]);

  useEffect(() => {
    if (tickers.length > 0) {
      loadDaily();
    }
  }, [tickers.join(",")]);

  useEffect(() => {
    if (activeTab === "weekly" && tickers.length > 0 && weeklyEntries.length === 0) {
      loadWeekly();
    }
  }, [activeTab, tickers.join(",")]);

  const handleDailyRefresh = async () => {
    setDailyRefreshing(true);
    await loadDaily(true);
    setDailyRefreshing(false);
  };

  const handleWeeklyRefresh = async () => {
    setWeeklyRefreshing(true);
    await loadWeekly(true);
    setWeeklyRefreshing(false);
  };

  const isEmpty = tickers.length === 0;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPadding + 16,
        paddingBottom: bottomPadding,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={activeTab === "daily" ? dailyRefreshing : weeklyRefreshing}
          onRefresh={activeTab === "daily" ? handleDailyRefresh : handleWeeklyRefresh}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Market Digest</Text>
      <Text style={[styles.date, { color: colors.mutedForeground }]}>{today}</Text>

      {isEmpty ? (
        <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
          <Feather name="book-open" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing to digest</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Add stocks to your watchlist to see daily summaries and weekly highlights here.
          </Text>
        </View>
      ) : (
        <>
          {/* Tab switcher */}
          <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 20 }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "daily" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("daily")}
            >
              <Text style={[styles.tabText, { color: activeTab === "daily" ? colors.primaryForeground : colors.mutedForeground }]}>
                Daily Brief
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "weekly" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("weekly")}
            >
              <Text style={[styles.tabText, { color: activeTab === "weekly" ? colors.primaryForeground : colors.mutedForeground }]}>
                Weekly Brief
              </Text>
            </TouchableOpacity>
          </View>

          {/* Daily Brief */}
          {activeTab === "daily" && (
            <View style={styles.contentSection}>
              <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                <Feather name="sun" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>
                  Today's most relevant news for your watchlist — refreshed daily.
                </Text>
              </View>

              {dailyLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                    Fetching today's news for your watchlist…
                  </Text>
                </View>
              ) : dailyEntries.length === 0 ? (
                <View style={[styles.noDataContainer, { borderColor: colors.border }]}>
                  <Feather name="inbox" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.noDataText, { color: colors.mutedForeground }]}>
                    No news found for today. Pull down to refresh.
                  </Text>
                </View>
              ) : (
                dailyEntries.map((entry) => (
                  <DigestCard key={entry.id} entry={entry} />
                ))
              )}
            </View>
          )}

          {/* Weekly Brief */}
          {activeTab === "weekly" && (
            <View style={styles.contentSection}>
              <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                <Feather name="calendar" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>
                  The most important highlights from the past 7 days across your watchlist.
                </Text>
              </View>

              {weeklyLoading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color={colors.primary} size="small" />
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                    Fetching this week's highlights for your watchlist…
                  </Text>
                </View>
              ) : weeklyEntries.length === 0 ? (
                <View style={[styles.noDataContainer, { borderColor: colors.border }]}>
                  <Feather name="inbox" size={24} color={colors.mutedForeground} />
                  <Text style={[styles.noDataText, { color: colors.mutedForeground }]}>
                    No news found for this week. Pull down to refresh.
                  </Text>
                </View>
              ) : (
                weeklyEntries.map((entry) => (
                  <DigestCard key={entry.id} entry={entry} />
                ))
              )}
            </View>
          )}
        </>
      )}
    </ScrollView>
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
  date: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  tabContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  contentSection: {
    gap: 0,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  loadingContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  noDataContainer: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 14,
  },
  noDataText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingHorizontal: 24,
    marginTop: 24,
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
});
