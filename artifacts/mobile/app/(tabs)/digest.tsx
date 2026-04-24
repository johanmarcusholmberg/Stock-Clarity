import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  ActivityIndicator,
  Modal,
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
import { useWatchlist } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { getEvents, type EventPeriod, type StockEvent } from "@/services/stockApi";
import ExpandableEventCard from "@/components/ExpandableEventCard";
import { PaywallSheet } from "@/components/PaywallSheet";
import { TabHintPopup } from "@/components/TabHintPopup";

type Colors = ReturnType<typeof useColors>;

type Tab = "daily" | "weekly";

// Cache keys are versioned — v2 invalidates older caches that stored
// pre-refactor DigestEntry shapes with sourceUrl fields. New entries use
// the StockEvent shape (with event.url) fetched through getEvents().
const DAILY_CACHE_KEY = "@stockclarify_digest_daily_v2";
const WEEKLY_CACHE_KEY = "@stockclarify_digest_weekly_v2";
const DAILY_DATE_KEY = "@stockclarify_digest_daily_date_v2";
const WEEKLY_DATE_KEY = "@stockclarify_digest_weekly_date_v2";

function todayString() {
  return new Date().toISOString().slice(0, 10);
}

function weekString() {
  const d = new Date();
  const week = Math.ceil(d.getDate() / 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-W${week}`;
}

interface FilterState {
  tickers: Set<string>;
}

/**
 * Stock-level filter for the Digest.  Narrows the events shown to a subset
 * of the active portfolio's tickers.  Portfolio *switching* is handled by
 * the portfolio pill + PortfolioSheet — this sheet is ticker-only.
 */
function FilterPanel({
  visible,
  onClose,
  allTickers,
  stocks,
  filterState,
  onChange,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  allTickers: string[];
  stocks: Record<string, { name: string }>;
  filterState: FilterState;
  onChange: (f: FilterState) => void;
  colors: Colors;
}) {
  const [localTickers, setLocalTickers] = useState<Set<string>>(new Set(filterState.tickers));

  useEffect(() => {
    if (visible) {
      setLocalTickers(new Set(filterState.tickers));
    }
  }, [visible]);

  const toggleTicker = (t: string) => {
    setLocalTickers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleApply = () => {
    onChange({ tickers: localTickers });
    onClose();
  };

  const handleClear = () => {
    setLocalTickers(new Set());
  };

  const hasChanges = localTickers.size > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={fp.overlay}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[fp.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[fp.handle, { backgroundColor: colors.border }]} />
          <View style={fp.header}>
            <Text style={[fp.title, { color: colors.foreground }]}>Filter stocks</Text>
            <View style={fp.headerRight}>
              {hasChanges && (
                <TouchableOpacity onPress={handleClear}>
                  <Text style={[fp.clearText, { color: colors.mutedForeground }]}>Clear</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[fp.applyBtn, { backgroundColor: colors.primary }]}
                onPress={handleApply}
              >
                <Text style={[fp.applyText, { color: colors.primaryForeground }]}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>

          <ScrollView style={fp.scroll} showsVerticalScrollIndicator={false}>
            <Text style={[fp.sectionLabel, { color: colors.mutedForeground }]}>STOCKS</Text>
            {allTickers.map((ticker) => {
              const selected = localTickers.has(ticker);
              return (
                <TouchableOpacity
                  key={ticker}
                  style={[fp.row, {
                    backgroundColor: selected ? colors.primary + "12" : "transparent",
                    borderColor: selected ? colors.primary + "44" : colors.border,
                  }]}
                  onPress={() => toggleTicker(ticker)}
                  activeOpacity={0.7}
                >
                  <Text style={[fp.tickerText, { color: selected ? colors.primary : colors.foreground }]}>{ticker}</Text>
                  {stocks[ticker]?.name ? (
                    <Text style={[fp.rowName, { color: colors.mutedForeground }]} numberOfLines={1}>{stocks[ticker].name}</Text>
                  ) : null}
                  <View style={[fp.check, {
                    backgroundColor: selected ? colors.primary : "transparent",
                    borderColor: selected ? colors.primary : colors.border,
                  }]}>
                    {selected && <Feather name="check" size={11} color={colors.primaryForeground} />}
                  </View>
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/**
 * Portfolio selector sheet — opened by tapping the pill under the screen
 * title.  Lets the user switch between "My Watchlist" (the default folder
 * aka "All stocks" in the user's mental model) and any named portfolios
 * they've created.  Tapping a row switches the active portfolio and
 * closes the sheet.
 */
function PortfolioSheet({
  visible,
  onClose,
  folders,
  activeFolderId,
  onSelect,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  folders: { id: string; name: string; tickers: string[] }[];
  activeFolderId: string;
  onSelect: (id: string) => void;
  colors: Colors;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={ps.overlay}>
        <TouchableOpacity style={ps.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[ps.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[ps.handle, { backgroundColor: colors.border }]} />
          <View style={ps.header}>
            <Text style={[ps.title, { color: colors.foreground }]}>Switch portfolio</Text>
          </View>
          <ScrollView style={ps.scroll} showsVerticalScrollIndicator={false}>
            {folders.map((folder) => {
              const selected = folder.id === activeFolderId;
              const isDefault = folder.id === "default";
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[ps.row, {
                    backgroundColor: selected ? `${colors.primary}15` : "transparent",
                    borderColor: selected ? `${colors.primary}44` : colors.border,
                  }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelect(folder.id);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather
                    name={isDefault ? "eye" : "folder"}
                    size={14}
                    color={selected ? colors.primary : colors.mutedForeground}
                  />
                  <View style={ps.rowText}>
                    <Text
                      style={[ps.rowName, { color: selected ? colors.primary : colors.foreground }]}
                      numberOfLines={1}
                    >
                      {folder.name}
                    </Text>
                    <Text style={[ps.rowCount, { color: colors.mutedForeground }]}>
                      {folder.tickers.length} {folder.tickers.length === 1 ? "stock" : "stocks"}
                    </Text>
                  </View>
                  {selected && <Feather name="check" size={16} color={colors.primary} />}
                </TouchableOpacity>
              );
            })}
            <View style={{ height: 32 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const fp = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, maxHeight: "80%", minHeight: 360 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 10 },
  clearText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  applyBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10 },
  applyText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  scroll: { flex: 1, paddingHorizontal: 16 },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 8 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 10 },
  rowLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
  rowName: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular" },
  tickerText: { fontSize: 13, fontFamily: "Inter_700Bold", minWidth: 52 },
  check: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
});

const ps = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, maxHeight: "70%", minHeight: 260 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  scroll: { flex: 1, paddingHorizontal: 16 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  rowText: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowCount: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
});

export default function DigestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, folders, activeFolderId, setActiveFolderId } = useWatchlist();
  const { tier } = useSubscription();
  const [activeTab, setActiveTab] = useState<Tab>("daily");
  const [filterVisible, setFilterVisible] = useState(false);
  const [portfolioSheetVisible, setPortfolioSheetVisible] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallReason, setPaywallReason] = useState<"ai_limit" | "stock_daily_limit">("ai_limit");
  const [filterState, setFilterState] = useState<FilterState>({ tickers: new Set() });

  // Reset stock filters when the active portfolio changes — the ticker set
  // the user was filtering against may no longer be valid.
  useEffect(() => {
    setFilterState({ tickers: new Set() });
  }, [activeFolderId]);

  const [dailyEntries, setDailyEntries] = useState<StockEvent[]>([]);
  const [weeklyEntries, setWeeklyEntries] = useState<StockEvent[]>([]);
  const [dailyLoading, setDailyLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [dailyRefreshing, setDailyRefreshing] = useState(false);
  const [weeklyRefreshing, setWeeklyRefreshing] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const tickers = Object.keys(stocks);

  const allWatchlistTickers = useMemo(() => {
    return Array.from(new Set(folders.flatMap((f) => f.tickers)));
  }, [folders]);

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const isDefaultFolder = activeFolderId === "default";

  const portfolioTickers = useMemo(() => {
    if (isDefaultFolder) return allWatchlistTickers;
    return activeFolder?.tickers || [];
  }, [isDefaultFolder, allWatchlistTickers, activeFolder]);

  const fetchForPeriod = useCallback(async (period: EventPeriod): Promise<StockEvent[]> => {
    const currentTickers = Object.keys(stocks);
    if (!currentTickers.length) return [];

    const results = await Promise.allSettled(
      currentTickers.map(async (ticker) => {
        const evts = await getEvents(ticker, period);
        return evts.slice(0, 3);
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
        const parsed = JSON.parse(cached) as StockEvent[];
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
        const parsed = JSON.parse(cached) as StockEvent[];
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
  const portfolioEmpty = !isDefaultFolder && (activeFolder?.tickers.length ?? 0) === 0;

  const activeFilterCount = filterState.tickers.size;

  const getFilteredEntries = useCallback((entries: StockEvent[]): StockEvent[] => {
    if (filterState.tickers.size === 0) return entries;
    return entries.filter((e) => filterState.tickers.has(e.ticker));
  }, [filterState]);

  const getPortfolioEntries = useCallback((entries: StockEvent[]): StockEvent[] => {
    if (isDefaultFolder) return entries;
    const tickerSet = new Set(activeFolder?.tickers || []);
    return entries.filter((e) => tickerSet.has(e.ticker));
  }, [isDefaultFolder, activeFolder]);

  const filteredDaily = useMemo(() => getFilteredEntries(getPortfolioEntries(dailyEntries)), [dailyEntries, getFilteredEntries, getPortfolioEntries]);
  const filteredWeekly = useMemo(() => getFilteredEntries(getPortfolioEntries(weeklyEntries)), [weeklyEntries, getFilteredEntries, getPortfolioEntries]);

  return (
    <>
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
        <View style={styles.titleRow}>
          <View style={styles.titleBlock}>
            <Text style={[styles.screenTitle, { color: colors.foreground }]}>Market Digest</Text>
            {!isEmpty && activeFolder ? (
              <TouchableOpacity
                style={[
                  styles.portfolioChip,
                  {
                    backgroundColor: `${colors.primary}18`,
                    borderColor: `${colors.primary}44`,
                  },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setPortfolioSheetVisible(true);
                }}
                activeOpacity={0.7}
                accessibilityLabel={`Switch portfolio. Current: ${activeFolder.name}`}
              >
                <Feather
                  name={isDefaultFolder ? "eye" : "folder"}
                  size={12}
                  color={colors.primary}
                />
                <Text
                  style={[styles.portfolioChipText, { color: colors.primary }]}
                  numberOfLines={1}
                >
                  {activeFolder.name}
                </Text>
                <Feather name="chevron-down" size={12} color={colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
          {!isEmpty && !portfolioEmpty && (
            <TouchableOpacity
              style={[
                styles.filterButton,
                {
                  backgroundColor: activeFilterCount > 0 ? colors.primary : colors.secondary,
                  borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setFilterVisible(true)}
              accessibilityLabel="Filter stocks"
            >
              <Feather
                name="filter"
                size={14}
                color={activeFilterCount > 0 ? colors.primaryForeground : colors.mutedForeground}
              />
              {activeFilterCount > 0 && (
                <Text style={[styles.filterBadgeText, { color: colors.primaryForeground }]}>{activeFilterCount}</Text>
              )}
            </TouchableOpacity>
          )}
        </View>

        {isEmpty ? (
          <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
            <Feather name="book-open" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing to digest</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Add stocks to your watchlist to see daily summaries and weekly highlights here.
            </Text>
          </View>
        ) : portfolioEmpty ? (
          <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
            <Feather name="folder" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Empty portfolio</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              {`Add stocks to "${activeFolder?.name}" to see briefs here.`}
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

            {/* Active stock-filter chips */}
            {activeFilterCount > 0 && (
              <View style={styles.activeFiltersRow}>
                {Array.from(filterState.tickers).map((t) => (
                  <TouchableOpacity
                    key={`t-${t}`}
                    style={[styles.filterChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                    onPress={() => {
                      const next = new Set(filterState.tickers);
                      next.delete(t);
                      setFilterState({ tickers: next });
                    }}
                  >
                    <Text style={[styles.filterChipText, { color: colors.primary }]}>{t}</Text>
                    <Feather name="x" size={11} color={colors.primary} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setFilterState({ tickers: new Set() })}>
                  <Text style={[styles.clearAllText, { color: colors.mutedForeground }]}>Clear all</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Daily Brief */}
            {activeTab === "daily" && (
              <View style={styles.contentSection}>
                <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                  <Feather name="sun" size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                    Today's top headlines across your stocks.
                  </Text>
                </View>

                {dailyLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                      Fetching today's headlines…
                    </Text>
                  </View>
                ) : filteredDaily.length === 0 ? (
                  <View style={[styles.noDataContainer, { borderColor: colors.border }]}>
                    <Feather name="inbox" size={24} color={colors.mutedForeground} />
                    <Text style={[styles.noDataText, { color: colors.mutedForeground }]}>
                      {activeFilterCount > 0
                        ? "No news matches your filters. Try adjusting or clearing them."
                        : "No news found for today. Pull down to refresh."}
                    </Text>
                  </View>
                ) : (
                  filteredDaily.map((event) => (
                    <ExpandableEventCard
                      key={event.id}
                      event={event}
                      showTicker
                      stockName={stocks[event.ticker]?.name ?? event.ticker}
                      onNeedUpgrade={(reason) => {
                        setPaywallReason(reason);
                        setShowPaywall(true);
                      }}
                    />
                  ))
                )}
              </View>
            )}

            {/* Weekly Brief */}
            {activeTab === "weekly" && (
              <View style={styles.contentSection}>
                <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                  <Feather name="calendar" size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.primary }]} numberOfLines={1} ellipsizeMode="tail">
                    Key highlights from the last 7 days.
                  </Text>
                </View>

                {weeklyLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator color={colors.primary} size="small" />
                    <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                      Fetching this week's highlights…
                    </Text>
                  </View>
                ) : filteredWeekly.length === 0 ? (
                  <View style={[styles.noDataContainer, { borderColor: colors.border }]}>
                    <Feather name="inbox" size={24} color={colors.mutedForeground} />
                    <Text style={[styles.noDataText, { color: colors.mutedForeground }]}>
                      {activeFilterCount > 0
                        ? "No news matches your filters. Try adjusting or clearing them."
                        : "No news found for this week. Pull down to refresh."}
                    </Text>
                  </View>
                ) : (
                  filteredWeekly.map((event) => (
                    <ExpandableEventCard
                      key={event.id}
                      event={event}
                      showTicker
                      stockName={stocks[event.ticker]?.name ?? event.ticker}
                      onNeedUpgrade={(reason) => {
                        setPaywallReason(reason);
                        setShowPaywall(true);
                      }}
                    />
                  ))
                )}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <FilterPanel
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        allTickers={portfolioTickers}
        stocks={stocks}
        filterState={filterState}
        onChange={setFilterState}
        colors={colors}
      />
      <PortfolioSheet
        visible={portfolioSheetVisible}
        onClose={() => setPortfolioSheetVisible(false)}
        folders={folders}
        activeFolderId={activeFolderId}
        onSelect={(id) => {
          setActiveFolderId(id);
          setPortfolioSheetVisible(false);
        }}
        colors={colors}
      />
      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason={paywallReason}
        currentTier={tier}
      />
      <TabHintPopup
        tabKey="digest"
        hint="The Digest tab gives you daily and weekly AI-powered summaries of the biggest news across your watchlist stocks. Stay informed without the noise."
      />
    </>
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
    gap: 10,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  portfolioChip: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "100%",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  portfolioChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  filterButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 4,
  },
  filterBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_700Bold",
  },
  activeFiltersRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  clearAllText: {
    fontSize: 12,
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
    paddingHorizontal: 16,
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
