import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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
import { getEvents, type EventPeriod, type StockEvent } from "@/services/stockApi";
import ExpandableEventCard from "@/components/ExpandableEventCard";
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
  folderIds: Set<string>;
  tickers: Set<string>;
}

function FilterPanel({
  visible,
  onClose,
  folders,
  allTickers,
  stocks,
  filterState,
  onChange,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  folders: { id: string; name: string; tickers: string[] }[];
  allTickers: string[];
  stocks: Record<string, { name: string }>;
  filterState: FilterState;
  onChange: (f: FilterState) => void;
  colors: Colors;
}) {
  const [localFolders, setLocalFolders] = useState<Set<string>>(new Set(filterState.folderIds));
  const [localTickers, setLocalTickers] = useState<Set<string>>(new Set(filterState.tickers));

  useEffect(() => {
    if (visible) {
      setLocalFolders(new Set(filterState.folderIds));
      setLocalTickers(new Set(filterState.tickers));
    }
  }, [visible]);

  const toggleFolder = (id: string) => {
    setLocalFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTicker = (t: string) => {
    setLocalTickers((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const handleApply = () => {
    onChange({ folderIds: localFolders, tickers: localTickers });
    onClose();
  };

  const handleClear = () => {
    setLocalFolders(new Set());
    setLocalTickers(new Set());
  };

  const hasChanges = localFolders.size > 0 || localTickers.size > 0;

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={fp.overlay}>
        <TouchableOpacity style={fp.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[fp.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[fp.handle, { backgroundColor: colors.border }]} />
          <View style={fp.header}>
            <Text style={[fp.title, { color: colors.foreground }]}>Filter Digest</Text>
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
            {folders.length > 1 && (
              <>
                <Text style={[fp.sectionLabel, { color: colors.mutedForeground }]}>FOLDERS</Text>
                {folders.map((folder) => {
                  const selected = localFolders.has(folder.id);
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      style={[fp.row, {
                        backgroundColor: selected ? colors.primary + "12" : "transparent",
                        borderColor: selected ? colors.primary + "44" : colors.border,
                      }]}
                      onPress={() => toggleFolder(folder.id)}
                      activeOpacity={0.7}
                    >
                      <Feather name="folder" size={14} color={selected ? colors.primary : colors.mutedForeground} />
                      <Text style={[fp.rowLabel, { color: colors.foreground }]}>{folder.name}</Text>
                      <View style={[fp.check, {
                        backgroundColor: selected ? colors.primary : "transparent",
                        borderColor: selected ? colors.primary : colors.border,
                      }]}>
                        {selected && <Feather name="check" size={11} color={colors.primaryForeground} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}

            <Text style={[fp.sectionLabel, { color: colors.mutedForeground, marginTop: folders.length > 1 ? 16 : 0 }]}>STOCKS</Text>
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

export default function DigestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { stocks, folders, activeFolderId } = useWatchlist();
  const [activeTab, setActiveTab] = useState<Tab>("daily");
  const [filterVisible, setFilterVisible] = useState(false);
  const [filterState, setFilterState] = useState<FilterState>({ folderIds: new Set(), tickers: new Set() });

  useEffect(() => {
    const folderIds = new Set(folders.map((f) => f.id));
    setFilterState((prev) => {
      const prunedFolderIds = new Set(Array.from(prev.folderIds).filter((id) => folderIds.has(id)));
      if (prunedFolderIds.size === prev.folderIds.size) return prev;
      return { ...prev, folderIds: prunedFolderIds };
    });
  }, [folders]);

  // Reset filters when the active portfolio changes
  useEffect(() => {
    setFilterState({ folderIds: new Set(), tickers: new Set() });
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

  const activeFilterCount = filterState.folderIds.size + filterState.tickers.size;

  const getFilteredEntries = useCallback((entries: StockEvent[]): StockEvent[] => {
    if (filterState.folderIds.size === 0 && filterState.tickers.size === 0) return entries;

    const allowedTickers = new Set<string>();

    filterState.folderIds.forEach((folderId) => {
      const folder = folders.find((f) => f.id === folderId);
      folder?.tickers.forEach((t) => allowedTickers.add(t));
    });

    filterState.tickers.forEach((t) => allowedTickers.add(t));

    return entries.filter((e) => allowedTickers.has(e.ticker));
  }, [filterState, folders]);

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
            {!isEmpty && !portfolioEmpty && activeFolder ? (
              <View
                style={[
                  styles.portfolioChip,
                  {
                    backgroundColor: `${colors.primary}18`,
                    borderColor: `${colors.primary}44`,
                  },
                ]}
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
              </View>
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
              accessibilityLabel="Open filters"
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

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <View style={styles.activeFiltersRow}>
                {Array.from(filterState.folderIds).map((fId) => {
                  const folder = folders.find((f) => f.id === fId);
                  if (!folder) return null;
                  return (
                    <TouchableOpacity
                      key={`f-${fId}`}
                      style={[styles.filterChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                      onPress={() => {
                        const next = new Set(filterState.folderIds);
                        next.delete(fId);
                        setFilterState((p) => ({ ...p, folderIds: next }));
                      }}
                    >
                      <Feather name="folder" size={11} color={colors.primary} />
                      <Text style={[styles.filterChipText, { color: colors.primary }]}>{folder.name}</Text>
                      <Feather name="x" size={11} color={colors.primary} />
                    </TouchableOpacity>
                  );
                })}
                {Array.from(filterState.tickers).map((t) => (
                  <TouchableOpacity
                    key={`t-${t}`}
                    style={[styles.filterChip, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "44" }]}
                    onPress={() => {
                      const next = new Set(filterState.tickers);
                      next.delete(t);
                      setFilterState((p) => ({ ...p, tickers: next }));
                    }}
                  >
                    <Text style={[styles.filterChipText, { color: colors.primary }]}>{t}</Text>
                    <Feather name="x" size={11} color={colors.primary} />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setFilterState({ folderIds: new Set(), tickers: new Set() })}>
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
        folders={isDefaultFolder ? folders : []}
        allTickers={portfolioTickers}
        stocks={stocks}
        filterState={filterState}
        onChange={setFilterState}
        colors={colors}
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
