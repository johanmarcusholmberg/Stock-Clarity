import { AddIcon, CheckIcon, FolderIcon, GlobeIcon, SearchIcon } from "@/components/icons/StockIcons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import debounce from "lodash.debounce";
import { useColors } from "@/hooks/useColors";
import { useWatchlist, WatchlistFolder } from "@/context/WatchlistContext";
import SearchBar from "@/components/SearchBar";
import { TabHintPopup } from "@/components/TabHintPopup";
import {
  SearchResult,
  QuoteResult,
  searchStocks,
  getQuotes,
  exchangeToFlag,
  formatPrice,
} from "@/services/stockApi";

interface ResultWithQuote extends SearchResult {
  quote?: QuoteResult;
}

interface PendingAdd {
  result: ResultWithQuote;
}

export default function SearchScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    folders,
    activeFolderId,
    addToFolder,
    removeFromFolder,
  } = useWatchlist();

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultWithQuote[]>([]);
  const [loading, setLoading] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [pendingAdd, setPendingAdd] = useState<PendingAdd | null>(null);
  const [folderPickerVisible, setFolderPickerVisible] = useState(false);

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const doSearch = useCallback(
    debounce(async (q: string) => {
      if (!q.trim()) { setResults([]); setLoading(false); return; }
      setLoading(true);
      try {
        const quotes = await searchStocks(q);
        const equities = quotes.filter((r) => r.type === "EQUITY" || r.type === "ETF" || !r.type).slice(0, 20);
        setResults(equities);
        if (equities.length > 0) {
          setQuoteLoading(true);
          try {
            const symbols = equities.slice(0, 10).map((r) => r.symbol).join(",");
            const liveQuotes = await getQuotes(symbols.split(","));
            const quoteMap: Record<string, QuoteResult> = {};
            liveQuotes.forEach((q) => { quoteMap[q.symbol] = q; });
            setResults(equities.map((r) => ({ ...r, quote: quoteMap[r.symbol] })));
          } finally {
            setQuoteLoading(false);
          }
        }
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 400),
    []
  );

  useEffect(() => {
    if (query.trim()) {
      setLoading(true);
      doSearch(query);
    } else {
      setResults([]);
      setLoading(false);
    }
    return () => doSearch.cancel();
  }, [query]);

  const isInActiveFolder = useCallback((ticker: string) => {
    const activeFolder = folders.find((f) => f.id === activeFolderId);
    return activeFolder ? activeFolder.tickers.includes(ticker) : false;
  }, [folders, activeFolderId]);

  const getStockDataFromResult = (result: ResultWithQuote) => ({
    ticker: result.symbol,
    name: result.longName || result.shortName || result.symbol,
    exchange: result.exchange,
    exchangeFlag: exchangeToFlag(result.exchange),
    price: result.quote?.regularMarketPrice ?? 0,
    currency: result.quote?.currency ?? "USD",
    change: result.quote?.regularMarketChange ?? 0,
    changePercent: result.quote?.regularMarketChangePercent ?? 0,
  });

  const handleToggle = (result: ResultWithQuote) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (isInActiveFolder(result.symbol)) {
      removeFromFolder(result.symbol, activeFolderId);
      return;
    }

    if (folders.length > 1) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setPendingAdd({ result });
      setFolderPickerVisible(true);
      return;
    }

    addToFolder(result.symbol, activeFolderId, getStockDataFromResult(result));
  };

  const handleToggleLongPress = (result: ResultWithQuote) => {
    if (isInActiveFolder(result.symbol)) return;
    if (folders.length <= 1) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPendingAdd({ result });
    setFolderPickerVisible(true);
  };

  const handleFolderPick = (folder: WatchlistFolder) => {
    if (!pendingAdd) return;
    addToFolder(pendingAdd.result.symbol, folder.id, getStockDataFromResult(pendingAdd.result));
    setFolderPickerVisible(false);
    setPendingAdd(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleFolderPickCancel = () => {
    setFolderPickerVisible(false);
    setPendingAdd(null);
  };

  const renderItem = ({ item }: { item: ResultWithQuote }) => {
    const inActive = isInActiveFolder(item.symbol);
    const q = item.quote;
    const isPositive = (q?.regularMarketChangePercent ?? 0) >= 0;
    const changeColor = isPositive ? colors.positive : colors.negative;
    const flag = exchangeToFlag(item.exchange);

    return (
      <TouchableOpacity
        style={[styles.row, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: item.symbol } })}
        activeOpacity={0.7}
      >
        <View style={styles.rowLeft}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerText, { color: colors.primary }]} numberOfLines={1}>
              {item.symbol.length > 8 ? item.symbol.split(".")[0] : item.symbol}
            </Text>
            <Text style={styles.flagText}>{flag}</Text>
          </View>
          <View style={styles.nameBlock}>
            <Text style={[styles.stockName, { color: colors.foreground }]} numberOfLines={1}>
              {item.longName || item.shortName || item.symbol}
            </Text>
            <Text style={[styles.stockMeta, { color: colors.mutedForeground }]} numberOfLines={1}>
              {item.exchange} {q?.currency ? `· ${q.currency}` : ""}{q?.sector ? ` · ${q.sector}` : ""}
            </Text>
          </View>
        </View>
        {q ? (
          <View style={styles.rowRight}>
            <Text style={[styles.priceText, { color: colors.foreground }]}>
              {formatPrice(q.regularMarketPrice)}
            </Text>
            <Text style={[styles.changeText, { color: changeColor }]}>
              {isPositive ? "+" : ""}{q.regularMarketChangePercent.toFixed(2)}%
            </Text>
          </View>
        ) : quoteLoading ? (
          <ActivityIndicator size="small" color={colors.mutedForeground} />
        ) : null}
        <TouchableOpacity
          style={[styles.addBtn, {
            backgroundColor: inActive ? `${colors.primary}22` : colors.primary,
            borderColor: inActive ? `${colors.primary}44` : colors.primary,
          }]}
          onPress={() => handleToggle(item)}
          onLongPress={() => handleToggleLongPress(item)}
          delayLongPress={400}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {inActive
            ? <CheckIcon size={16} color={colors.primary} />
            : <AddIcon size={16} color={colors.primaryForeground} />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 16, paddingHorizontal: 16, paddingBottom: 12 }}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>World Markets</Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          Search any publicly listed stock or ETF from global exchanges.
        </Text>
        <View style={{ marginTop: 12 }}>
          <SearchBar
            value={query}
            onChangeText={setQuery}
            placeholder="Try 'Apple', 'TSLA', 'Siemens'..."
          />
        </View>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Searching global markets…</Text>
        </View>
      ) : query.trim() === "" ? (
        <View style={styles.emptyPrompt}>
          <View style={[styles.emptyIcon, { backgroundColor: `${colors.primary}15` }]}>
            <GlobeIcon size={32} color={colors.primary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Search any stock worldwide</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Search by company name or ticker symbol across NASDAQ, NYSE, LSE, TSE, HKEX, TSX, ASX, and more.
          </Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyPrompt}>
          <SearchIcon size={28} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No results for "{query}"</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Try the full company name or official ticker symbol.
          </Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.symbol}
          renderItem={renderItem}
          contentContainerStyle={{
            paddingHorizontal: 16,
            paddingBottom: bottomPadding,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={{ height: 7 }} />}
        />
      )}

      <TabHintPopup
        tabKey="search"
        hint="Use Search to find any publicly listed stock or ETF from markets worldwide. Tap a result to view its chart, or tap the + button to add it to your watchlist."
      />
      <Modal
        visible={folderPickerVisible}
        transparent
        animationType="slide"
        onRequestClose={handleFolderPickCancel}
      >
        <TouchableOpacity
          style={styles.pickerOverlay}
          activeOpacity={1}
          onPress={handleFolderPickCancel}
        >
          <View
            style={[styles.pickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.pickerHandle}>
              <View style={[styles.handle, { backgroundColor: colors.border }]} />
            </View>
            <Text style={[styles.pickerTitle, { color: colors.foreground }]}>Add to Folder</Text>
            {pendingAdd && (
              <Text style={[styles.pickerSubtitle, { color: colors.mutedForeground }]}>
                Choose a folder for {pendingAdd.result.longName || pendingAdd.result.shortName || pendingAdd.result.symbol}
              </Text>
            )}
            <View style={styles.pickerFolders}>
              {folders.map((folder) => {
                const isActive = folder.id === activeFolderId;
                const alreadyInFolder = pendingAdd
                  ? folder.tickers.includes(pendingAdd.result.symbol)
                  : false;
                return (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.pickerFolderRow,
                      {
                        backgroundColor: alreadyInFolder
                          ? `${colors.primary}10`
                          : colors.secondary,
                        borderColor: alreadyInFolder ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => !alreadyInFolder && handleFolderPick(folder)}
                    disabled={alreadyInFolder}
                    activeOpacity={alreadyInFolder ? 1 : 0.7}
                  >
                    <View style={styles.pickerFolderLeft}>
                      <FolderIcon
                        size={18}
                        color={alreadyInFolder ? colors.primary : colors.mutedForeground}
                      />
                      <View>
                        <Text style={[styles.pickerFolderName, { color: alreadyInFolder ? colors.primary : colors.foreground }]}>
                          {folder.name}
                          {isActive ? " (current)" : ""}
                        </Text>
                        <Text style={[styles.pickerFolderCount, { color: colors.mutedForeground }]}>
                          {folder.tickers.length} stock{folder.tickers.length !== 1 ? "s" : ""}
                        </Text>
                      </View>
                    </View>
                    {alreadyInFolder ? (
                      <CheckIcon size={16} color={colors.primary} />
                    ) : (
                      <AddIcon size={16} color={colors.mutedForeground} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
            <TouchableOpacity
              style={[styles.pickerCancelBtn, { borderColor: colors.border }]}
              onPress={handleFolderPickCancel}
            >
              <Text style={[styles.pickerCancelText, { color: colors.mutedForeground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  screenTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  emptyPrompt: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  emptyText: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 19 },
  row: {
    flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 14,
    borderWidth: 1, gap: 10,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  tickerBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 52, alignItems: "center", gap: 2 },
  tickerText: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  flagText: { fontSize: 10 },
  nameBlock: { flex: 1, minWidth: 0 },
  stockName: { fontSize: 13, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  stockMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rowRight: { alignItems: "flex-end", minWidth: 64 },
  priceText: { fontSize: 13, fontFamily: "Inter_700Bold", marginBottom: 1 },
  changeText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  addBtn: { width: 34, height: 34, borderRadius: 9, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  pickerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  pickerSheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingBottom: 32,
  },
  pickerHandle: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  pickerTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 24,
    marginBottom: 4,
  },
  pickerSubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 24,
    marginBottom: 16,
    lineHeight: 19,
  },
  pickerFolders: {
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 16,
  },
  pickerFolderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
  },
  pickerFolderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    flex: 1,
  },
  pickerFolderName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  pickerFolderCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  pickerCancelBtn: {
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
  pickerCancelText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
