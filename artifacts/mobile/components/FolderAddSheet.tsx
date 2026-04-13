import React, { useState, useMemo, useCallback } from "react";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

const DEFAULT_FOLDER_ID = "default";

interface SearchResult {
  ticker: string;
  name: string;
  exchange: string;
  flag?: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  folderId: string;
  folderName: string;
}

export function FolderAddSheet({ visible, onClose, folderId, folderName }: Props) {
  const colors = useColors();
  const { folders, stocks, addToFolder } = useWatchlist();

  const [tab, setTab] = useState<"watchlist" | "search">("watchlist");
  const [pendingTickers, setPendingTickers] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<ReturnType<typeof setTimeout> | null>(null);

  const currentFolderTickers = useMemo(
    () => folders.find((f) => f.id === folderId)?.tickers ?? [],
    [folders, folderId]
  );

  const defaultFolderTickers = useMemo(
    () => folders.find((f) => f.id === DEFAULT_FOLDER_ID)?.tickers ?? [],
    [folders]
  );

  const watchlistCandidates = useMemo(
    () => defaultFolderTickers.filter((t) => !currentFolderTickers.includes(t)),
    [defaultFolderTickers, currentFolderTickers]
  );

  const togglePending = useCallback((ticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchDebounce) clearTimeout(searchDebounce);
    if (!q.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const res = await fetch(`${API_BASE}/stocks/search?q=${encodeURIComponent(q.trim())}`);
        if (res.ok) {
          const data = await res.json();
          const results: SearchResult[] = (data.results ?? []).slice(0, 10).map((r: any) => ({
            ticker: r.ticker ?? r.symbol ?? "",
            name: r.name ?? r.longname ?? r.shortname ?? "",
            exchange: r.exchange ?? "",
            flag: r.flag ?? r.exchangeFlag ?? "🌐",
          })).filter((r: SearchResult) => r.ticker);
          setSearchResults(results);
        }
      } catch {}
      setSearchLoading(false);
    }, 350);
    setSearchDebounce(t);
  }, [searchDebounce]);

  const handleConfirm = useCallback(() => {
    if (pendingTickers.size === 0) { onClose(); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pendingTickers.forEach((ticker) => {
      const stockData = stocks[ticker];
      addToFolder(ticker, folderId, stockData ? {
        ticker,
        name: stockData.name,
        exchange: stockData.exchange,
        exchangeFlag: stockData.exchangeFlag,
        price: stockData.price,
        currency: stockData.currency,
        change: stockData.change,
        changePercent: stockData.changePercent,
      } : undefined);
      if (folderId !== DEFAULT_FOLDER_ID) {
        addToFolder(ticker, DEFAULT_FOLDER_ID, stockData ? {
          ticker,
          name: stockData.name,
          exchange: stockData.exchange,
          exchangeFlag: stockData.exchangeFlag,
          price: stockData.price,
          currency: stockData.currency,
          change: stockData.change,
          changePercent: stockData.changePercent,
        } : undefined);
      }
    });
    setPendingTickers(new Set());
    setSearchQuery("");
    setSearchResults([]);
    onClose();
  }, [pendingTickers, folderId, stocks, addToFolder, onClose]);

  const handleClose = useCallback(() => {
    setPendingTickers(new Set());
    setSearchQuery("");
    setSearchResults([]);
    setTab("watchlist");
    onClose();
  }, [onClose]);

  const isDefaultFolder = folderId === DEFAULT_FOLDER_ID;

  return (
    <Modal visible={visible} transparent animationType="slide" presentationStyle="overFullScreen" onRequestClose={handleClose}>
      <View style={s.overlay}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={handleClose} />
        <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.handle, { backgroundColor: colors.border }]} />
          <View style={s.header}>
            <View>
              <Text style={[s.title, { color: colors.foreground }]}>Add to {folderName}</Text>
              <Text style={[s.subtitle, { color: colors.mutedForeground }]}>
                {pendingTickers.size > 0 ? `${pendingTickers.size} selected` : "Tap stocks to select"}
              </Text>
            </View>
            <TouchableOpacity
              style={[s.confirmBtn, {
                backgroundColor: pendingTickers.size > 0 ? colors.primary : colors.secondary,
                borderColor: pendingTickers.size > 0 ? colors.primary : colors.border,
              }]}
              onPress={handleConfirm}
            >
              <Text style={[s.confirmBtnText, { color: pendingTickers.size > 0 ? colors.primaryForeground : colors.mutedForeground }]}>
                {pendingTickers.size > 0 ? `Add ${pendingTickers.size}` : "Done"}
              </Text>
            </TouchableOpacity>
          </View>

          {!isDefaultFolder && (
            <View style={[s.tabs, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <TouchableOpacity
                style={[s.tabBtn, tab === "watchlist" && { backgroundColor: colors.card }]}
                onPress={() => setTab("watchlist")}
              >
                <Feather name="bookmark" size={13} color={tab === "watchlist" ? colors.primary : colors.mutedForeground} />
                <Text style={[s.tabBtnText, { color: tab === "watchlist" ? colors.primary : colors.mutedForeground }]}>My Watchlist</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.tabBtn, tab === "search" && { backgroundColor: colors.card }]}
                onPress={() => setTab("search")}
              >
                <Feather name="search" size={13} color={tab === "search" ? colors.primary : colors.mutedForeground} />
                <Text style={[s.tabBtnText, { color: tab === "search" ? colors.primary : colors.mutedForeground }]}>Search</Text>
              </TouchableOpacity>
            </View>
          )}

          {(tab === "watchlist" || isDefaultFolder) ? (
            <ScrollView style={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {watchlistCandidates.length === 0 ? (
                <View style={s.empty}>
                  <Feather name="check-circle" size={28} color={colors.positive} />
                  <Text style={[s.emptyText, { color: colors.mutedForeground }]}>
                    {defaultFolderTickers.length === 0
                      ? "Your watchlist is empty. Use Search to add stocks."
                      : "All watchlist stocks are already in this folder."}
                  </Text>
                  {!isDefaultFolder && (
                    <TouchableOpacity onPress={() => setTab("search")}>
                      <Text style={[s.emptyLink, { color: colors.primary }]}>Search for more stocks →</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                watchlistCandidates.map((ticker) => {
                  const stock = stocks[ticker];
                  const selected = pendingTickers.has(ticker);
                  return (
                    <TouchableOpacity
                      key={ticker}
                      style={[s.row, {
                        backgroundColor: selected ? colors.primary + "12" : "transparent",
                        borderColor: selected ? colors.primary + "44" : colors.border,
                      }]}
                      onPress={() => togglePending(ticker)}
                      activeOpacity={0.7}
                    >
                      <View style={s.rowInfo}>
                        <Text style={[s.rowTicker, { color: colors.foreground }]}>{ticker}</Text>
                        {stock?.name ? (
                          <Text style={[s.rowName, { color: colors.mutedForeground }]} numberOfLines={1}>{stock.name}</Text>
                        ) : null}
                      </View>
                      <View style={[s.checkbox, {
                        backgroundColor: selected ? colors.primary : "transparent",
                        borderColor: selected ? colors.primary : colors.border,
                      }]}>
                        {selected && <Feather name="check" size={12} color={colors.primaryForeground} />}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          ) : (
            <View style={{ flex: 1 }}>
              <View style={[s.searchBox, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="search" size={16} color={colors.mutedForeground} />
                <TextInput
                  style={[s.searchInput, { color: colors.foreground }]}
                  placeholder="Search stocks, e.g. AAPL, Tesla..."
                  placeholderTextColor={colors.mutedForeground}
                  value={searchQuery}
                  onChangeText={handleSearch}
                  autoFocus
                  returnKeyType="search"
                  autoCapitalize="none"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchQuery(""); setSearchResults([]); }}>
                    <Feather name="x" size={16} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </View>
              <ScrollView style={s.list} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                {searchLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ padding: 24 }} />
                ) : searchResults.length === 0 && searchQuery.length > 0 ? (
                  <View style={s.empty}>
                    <Text style={[s.emptyText, { color: colors.mutedForeground }]}>No results for "{searchQuery}"</Text>
                  </View>
                ) : searchResults.length === 0 ? (
                  <View style={s.empty}>
                    <Feather name="search" size={28} color={colors.border} />
                    <Text style={[s.emptyText, { color: colors.mutedForeground }]}>Search for any stock worldwide</Text>
                  </View>
                ) : (
                  searchResults.map((result) => {
                    const alreadyIn = currentFolderTickers.includes(result.ticker);
                    const selected = pendingTickers.has(result.ticker);
                    return (
                      <TouchableOpacity
                        key={result.ticker}
                        style={[s.row, {
                          backgroundColor: selected ? colors.primary + "12" : alreadyIn ? colors.secondary : "transparent",
                          borderColor: selected ? colors.primary + "44" : colors.border,
                          opacity: alreadyIn ? 0.5 : 1,
                        }]}
                        onPress={() => !alreadyIn && togglePending(result.ticker)}
                        activeOpacity={alreadyIn ? 1 : 0.7}
                      >
                        <View style={s.rowInfo}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <Text style={[s.rowTicker, { color: colors.foreground }]}>{result.ticker}</Text>
                            {result.flag && <Text style={{ fontSize: 13 }}>{result.flag}</Text>}
                          </View>
                          {result.name ? (
                            <Text style={[s.rowName, { color: colors.mutedForeground }]} numberOfLines={1}>{result.name}</Text>
                          ) : null}
                        </View>
                        {alreadyIn ? (
                          <View style={[s.checkbox, { backgroundColor: colors.positive, borderColor: colors.positive }]}>
                            <Feather name="check" size={12} color="#fff" />
                          </View>
                        ) : (
                          <View style={[s.checkbox, {
                            backgroundColor: selected ? colors.primary : "transparent",
                            borderColor: selected ? colors.primary : colors.border,
                          }]}>
                            {selected && <Feather name="check" size={12} color={colors.primaryForeground} />}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })
                )}
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, borderBottomWidth: 0, maxHeight: "85%", minHeight: 420 },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 12, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  confirmBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  confirmBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  tabs: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, borderRadius: 12, borderWidth: 1, padding: 3 },
  tabBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 8, borderRadius: 9 },
  tabBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { flex: 1, paddingHorizontal: 16 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 13, borderRadius: 12, borderWidth: 1, marginBottom: 8, gap: 12 },
  rowInfo: { flex: 1, gap: 2 },
  rowTicker: { fontSize: 14, fontFamily: "Inter_700Bold" },
  rowName: { fontSize: 12, fontFamily: "Inter_400Regular" },
  checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12, borderWidth: 1, marginHorizontal: 16, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular" },
  empty: { alignItems: "center", paddingVertical: 32, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyLink: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
