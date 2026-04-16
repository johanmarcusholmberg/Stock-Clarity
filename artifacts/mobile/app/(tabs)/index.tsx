import { Feather } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import DraggableFlatList, { RenderItemParams } from "react-native-draggable-flatlist";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useMiniCharts } from "@/hooks/useMiniCharts";
import { useWatchlist, Stock } from "@/context/WatchlistContext";
import StockCard from "@/components/StockCard";

import { FolderAddSheet } from "@/components/FolderAddSheet";
import { TabHintPopup } from "@/components/TabHintPopup";

type Colors = ReturnType<typeof useColors>;

const DEFAULT_FOLDER_ID = "default";

function getTimeAwareGreeting(name: string, timezone?: string): string {
  const greetName = name ? `, ${name}` : "";
  try {
    const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
    const now = new Date();
    const hourStr = new Intl.DateTimeFormat("en", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).format(now);
    const hour = parseInt(hourStr, 10);
    if (hour >= 5 && hour < 12) return `Good morning${greetName}`;
    if (hour >= 12 && hour < 17) return `Good day${greetName}`;
    if (hour >= 17 && hour < 24) return `Good evening${greetName}`;
    return `Still working late${greetName}?`;
  } catch {
    return `Good morning${greetName}`;
  }
}

type Filter = "all" | "gainers" | "losers";

interface DeleteModalState {
  visible: boolean;
  folderName: string;
  folderId: string;
  hasStocks: boolean;
}

function DeleteFolderModal({
  state,
  onCancel,
  onDeleteFolderOnly,
  onDeleteFolderAndStocks,
  colors,
}: {
  state: DeleteModalState;
  onCancel: () => void;
  onDeleteFolderOnly: () => void;
  onDeleteFolderAndStocks: () => void;
  colors: Colors;
}) {
  return (
    <Modal visible={state.visible} transparent animationType="fade" presentationStyle="overFullScreen" onRequestClose={onCancel}>
      <View style={dm.overlay}>
        <View style={[dm.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[dm.title, { color: colors.foreground }]}>Delete "{state.folderName}"?</Text>
          <Text style={[dm.message, { color: colors.mutedForeground }]}>
            {state.hasStocks
              ? "Choose what happens to the stocks in this portfolio:"
              : "This portfolio is empty. It will be permanently deleted."}
          </Text>

          <View style={[dm.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={dm.option} onPress={onDeleteFolderOnly} activeOpacity={0.7}>
            <Feather name="folder-minus" size={16} color={colors.foreground} />
            <View style={dm.optionText}>
              <Text style={[dm.optionTitle, { color: colors.foreground }]}>Delete portfolio only</Text>
              <Text style={[dm.optionDesc, { color: colors.mutedForeground }]}>
                {state.hasStocks
                  ? "Stocks stay in My Watchlist and any other portfolios."
                  : "The portfolio is removed. No stock data is affected."}
              </Text>
            </View>
          </TouchableOpacity>

          {state.hasStocks && (
            <>
              <View style={[dm.divider, { backgroundColor: colors.border }]} />
              <TouchableOpacity style={dm.option} onPress={onDeleteFolderAndStocks} activeOpacity={0.7}>
                <Feather name="trash-2" size={16} color={colors.negative} />
                <View style={dm.optionText}>
                  <Text style={[dm.optionTitle, { color: colors.negative }]}>Delete portfolio and remove stocks</Text>
                  <Text style={[dm.optionDesc, { color: colors.mutedForeground }]}>
                    Stocks are fully unfollowed from every portfolio.
                  </Text>
                </View>
              </TouchableOpacity>
            </>
          )}

          <View style={[dm.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity style={[dm.cancelBtn, { backgroundColor: colors.secondary }]} onPress={onCancel} activeOpacity={0.7}>
            <Text style={[dm.cancelText, { color: colors.foreground }]}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const dm = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24 },
  dialog: { width: "100%", maxWidth: 380, borderRadius: 18, borderWidth: 1, overflow: "hidden" },
  title: { fontSize: 17, fontFamily: "Inter_700Bold", paddingHorizontal: 20, paddingTop: 20, paddingBottom: 6 },
  message: { fontSize: 13, fontFamily: "Inter_400Regular", paddingHorizontal: 20, paddingBottom: 16, lineHeight: 19 },
  divider: { height: 1 },
  option: { flexDirection: "row", alignItems: "flex-start", gap: 12, paddingHorizontal: 20, paddingVertical: 16 },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  optionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  cancelBtn: { margin: 12, paddingVertical: 14, borderRadius: 12, alignItems: "center" },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

export default function WatchlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const {
    watchlist,
    stocks,
    unreadAlertCount,
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    canCreateFolder,
    displayName,
    removeFromFolder,
    reorderFolder,
    deleteFolder,
  } = useWatchlist();

  const [filter, setFilter] = useState<Filter>("all");
  const [showPercent, setShowPercent] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [pendingRemovals, setPendingRemovals] = useState<Set<string>>(new Set());
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [deleteModal, setDeleteModal] = useState<DeleteModalState>({ visible: false, folderName: "", folderId: "", hasStocks: false });
  const [pickerVisible, setPickerVisible] = useState(false);
  const [creatingPortfolio, setCreatingPortfolio] = useState(false);
  const [newPortfolioName, setNewPortfolioName] = useState("");
  const [pickerDeletePending, setPickerDeletePending] = useState(false);
  const params = useLocalSearchParams<{ pendingTimezone?: string }>();

  useEffect(() => {
    AsyncStorage.getItem("@stockclarify_show_percent").then((v) => {
      if (v !== null) setShowPercent(v === "true");
    });
  }, []);

  const toggleChangeMode = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPercent((prev) => {
      const next = !prev;
      AsyncStorage.setItem("@stockclarify_show_percent", String(next));
      return next;
    });
  };

  useEffect(() => {
    const tz = params.pendingTimezone;
    if (!tz || !user) return;
    const existingTz = (user.unsafeMetadata as Record<string, unknown>)?.timezone;
    if (existingTz === tz) return;
    user.update({
      unsafeMetadata: { ...user.unsafeMetadata, timezone: tz },
    }).then(() => {
      router.setParams({ pendingTimezone: undefined });
    }).catch(() => {});
  }, [params.pendingTimezone, user?.id]);

  const timezone = (user?.unsafeMetadata as Record<string, unknown> | undefined)?.timezone as string | undefined;
  const greeting = useMemo(
    () => getTimeAwareGreeting(displayName, timezone),
    [displayName, timezone]
  );

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const isDefaultFolder = activeFolderId === DEFAULT_FOLDER_ID;
  const portfolios = folders.filter((f) => f.id !== DEFAULT_FOLDER_ID);

  const allWatched = watchlist.map((ticker) => stocks[ticker]).filter(Boolean);

  // Fetch real 1Y chart data for all visible tickers via TanStack Query.
  // Mini-charts display 1Y history; the progress number on each card uses
  // the 1D change from stock.changePercent (sourced from refreshQuotes).
  const { charts: miniCharts } = useMiniCharts(watchlist);
  const gainers = allWatched.filter((s) => s.changePercent >= 0);
  const losers = allWatched.filter((s) => s.changePercent < 0);

  const baseDisplayed = filter === "gainers" ? gainers : filter === "losers" ? losers : allWatched;
  const displayed = editMode
    ? baseDisplayed.filter((s) => !pendingRemovals.has(s.ticker))
    : baseDisplayed;

  const dragEnabled = filter === "all" && !editMode && displayed.length > 1;

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: allWatched.length },
    { key: "gainers", label: "Gainers", count: gainers.length },
    { key: "losers", label: "Losers", count: losers.length },
  ];

  const handleEnterEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingRemovals(new Set());
    setEditMode(true);
  }, []);

  const handleDoneEdit = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    pendingRemovals.forEach((ticker) => {
      removeFromFolder(ticker, activeFolderId);
    });
    setPendingRemovals(new Set());
    setEditMode(false);
  }, [pendingRemovals, removeFromFolder, activeFolderId]);

  const handlePendingRemove = useCallback((ticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPendingRemovals((prev) => {
      const next = new Set(prev);
      next.add(ticker);
      return next;
    });
  }, []);

  const handleDeleteFolder = useCallback(() => {
    if (!activeFolder || isDefaultFolder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const hasStocks = watchlist.length > 0;

    if (Platform.OS === "web") {
      setDeleteModal({ visible: true, folderName: activeFolder.name, folderId: activeFolderId, hasStocks });
    } else {
      const buttons: import("react-native").AlertButton[] = [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete portfolio only",
          style: "default",
          onPress: () => {
            deleteFolder(activeFolderId, false);
            setEditMode(false);
          },
        },
      ];
      if (hasStocks) {
        buttons.push({
          text: "Delete portfolio and remove stocks",
          style: "destructive",
          onPress: () => {
            deleteFolder(activeFolderId, true);
            setEditMode(false);
          },
        });
      }
      Alert.alert(
        `Delete "${activeFolder.name}"?`,
        hasStocks
          ? "Choose what happens to the stocks in this portfolio:"
          : "This portfolio is empty. It will be permanently deleted.",
        buttons
      );
    }
  }, [activeFolder, isDefaultFolder, activeFolderId, watchlist.length, deleteFolder]);

  const handleModalCancel = useCallback(() => {
    setDeleteModal({ visible: false, folderName: "", folderId: "", hasStocks: false });
    if (pickerDeletePending) {
      setPickerDeletePending(false);
      const remaining = folders.filter((f) => f.id !== DEFAULT_FOLDER_ID).length;
      if (remaining > 0) {
        setTimeout(() => setPickerVisible(true), 350);
      }
    }
  }, [pickerDeletePending, folders]);

  const handleModalDeleteFolderOnly = useCallback(() => {
    deleteFolder(deleteModal.folderId, false);
    setEditMode(false);
    setDeleteModal({ visible: false, folderName: "", folderId: "", hasStocks: false });
    if (pickerDeletePending) {
      setPickerDeletePending(false);
      const remaining = folders.filter((f) => f.id !== DEFAULT_FOLDER_ID && f.id !== deleteModal.folderId).length;
      if (remaining > 0) {
        setTimeout(() => setPickerVisible(true), 350);
      }
    }
  }, [deleteModal.folderId, deleteFolder, pickerDeletePending, folders]);

  const handleModalDeleteFolderAndStocks = useCallback(() => {
    deleteFolder(deleteModal.folderId, true);
    setEditMode(false);
    setDeleteModal({ visible: false, folderName: "", folderId: "", hasStocks: false });
    if (pickerDeletePending) {
      setPickerDeletePending(false);
      const remaining = folders.filter((f) => f.id !== DEFAULT_FOLDER_ID && f.id !== deleteModal.folderId).length;
      if (remaining > 0) {
        setTimeout(() => setPickerVisible(true), 350);
      }
    }
  }, [deleteModal.folderId, deleteFolder, pickerDeletePending, folders]);

  const closePortfolioPicker = useCallback(() => {
    setPickerVisible(false);
    setCreatingPortfolio(false);
    setNewPortfolioName("");
  }, []);

  const handleCreatePortfolio = useCallback(() => {
    const name = newPortfolioName.trim();
    if (!name) return;
    const folder = createFolder(name);
    if (!folder) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setActiveFolderId(folder.id);
    closePortfolioPicker();
    setTimeout(() => setAddSheetVisible(true), 350);
  }, [newPortfolioName, createFolder, setActiveFolderId, closePortfolioPicker]);

  const handlePickerDelete = useCallback((folder: { id: string; name: string; tickers: string[] }) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPickerVisible(false);
    setCreatingPortfolio(false);
    setNewPortfolioName("");
    setPickerDeletePending(true);
    setTimeout(() => {
      setDeleteModal({
        visible: true,
        folderName: folder.name,
        folderId: folder.id,
        hasStocks: folder.tickers.length > 0,
      });
    }, 350);
  }, []);

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 16 }}>
        <View style={[styles.titleRow, { paddingHorizontal: 16 }]}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {greeting}
            </Text>
            <Text style={[styles.appTitle, { color: colors.foreground }]}>StockClarify</Text>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={[styles.iconButton, { backgroundColor: colors.secondary }]}
              onPress={() => router.push("/(tabs)/alerts")}
              accessibilityLabel="View alerts"
            >
              <Feather name="bell" size={18} color={unreadAlertCount > 0 ? colors.primary : colors.mutedForeground} />
              {unreadAlertCount > 0 && (
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{unreadAlertCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Stat cards — tappable filter controls */}
        <View style={[styles.statsRow, { marginTop: 20, paddingHorizontal: 16, marginBottom: 12 }]}>
          {([
            { key: "all" as Filter, label: "Total", count: allWatched.length, valueColor: colors.foreground },
            { key: "gainers" as Filter, label: "Gainers", count: gainers.length, valueColor: colors.positive },
            { key: "losers" as Filter, label: "Losers", count: losers.length, valueColor: colors.negative },
          ]).map((card) => {
            const active = filter === card.key;
            return (
              <TouchableOpacity
                key={card.key}
                style={[
                  styles.statCard,
                  {
                    backgroundColor: active ? `${colors.primary}10` : colors.card,
                    borderColor: active ? colors.primary : colors.border,
                  },
                ]}
                activeOpacity={0.7}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFilter(card.key);
                }}
              >
                <Text style={[styles.statValue, { color: card.valueColor }]}>{card.count}</Text>
                <Text style={[styles.statLabel, { color: active ? colors.primary : colors.mutedForeground }]}>
                  {card.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Control row: folder switcher (left) + %/$ toggle (right) */}
        <View style={[styles.controlRow, { paddingHorizontal: 16, marginBottom: 12 }]}>
          <View style={[styles.segmentedControl, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
            <TouchableOpacity
              style={[
                styles.segment,
                { backgroundColor: isDefaultFolder ? colors.primary : "transparent" },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setActiveFolderId(DEFAULT_FOLDER_ID);
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: isDefaultFolder ? colors.primaryForeground : colors.mutedForeground },
                ]}
              >
                Watchlist
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.segment,
                { backgroundColor: !isDefaultFolder ? colors.primary : "transparent" },
              ]}
              activeOpacity={0.7}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPickerVisible(true);
              }}
            >
              <Text
                style={[
                  styles.segmentText,
                  { color: !isDefaultFolder ? colors.primaryForeground : colors.mutedForeground, maxWidth: 120 },
                ]}
                numberOfLines={1}
              >
                {!isDefaultFolder && activeFolder ? activeFolder.name : "Portfolio"}
              </Text>
              <Feather
                name="chevron-down"
                size={12}
                color={!isDefaultFolder ? colors.primaryForeground : colors.mutedForeground}
              />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.changeToggle, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            onPress={toggleChangeMode}
          >
            <Text style={[styles.changeToggleText, { color: showPercent ? colors.primary : colors.mutedForeground }]}>%</Text>
            <View style={[styles.changeToggleDivider, { backgroundColor: colors.border }]} />
            <Text style={[styles.changeToggleText, { color: !showPercent ? colors.primary : colors.mutedForeground }]}>$</Text>
          </TouchableOpacity>
        </View>

        {/* Toolbar row 1: section title + action buttons */}
        {editMode ? (
          <View style={[styles.toolbarRow, { paddingHorizontal: 16, marginBottom: 10 }]}>
            {!isDefaultFolder ? (
              <TouchableOpacity
                style={[styles.deleteButton, { backgroundColor: colors.negative + "18", borderColor: colors.negative + "44" }]}
                onPress={handleDeleteFolder}
              >
                <Feather name="trash-2" size={13} color={colors.negative} />
                <Text style={[styles.deleteButtonText, { color: colors.negative }]}>Delete Portfolio</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <TouchableOpacity
              style={[styles.doneButton, { backgroundColor: colors.primary }]}
              onPress={handleDoneEdit}
            >
              <Text style={[styles.doneButtonText, { color: colors.primaryForeground }]}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={[styles.toolbarRow, { paddingHorizontal: 16, marginBottom: 10 }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
              {activeFolder?.name ?? "Watchlist"}
            </Text>
            <View style={styles.toolbarRight}>
              {(allWatched.length > 0 || !isDefaultFolder) && (
                <TouchableOpacity
                  style={styles.editButtonGhost}
                  onPress={handleEnterEdit}
                >
                  <Text style={[styles.editButtonGhostText, { color: colors.mutedForeground }]}>Edit</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.addButton, { backgroundColor: colors.primary }]}
                onPress={() => setAddSheetVisible(true)}
              >
                <Text style={[styles.addButtonText, { color: colors.primaryForeground }]}>Add Stock</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

      </View>

      {displayed.length === 0 ? (
        <ScrollView
          style={styles.fill}
          contentContainerStyle={{ paddingBottom: bottomPadding, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {allWatched.length === 0 ? (
            <View style={[styles.empty, { borderColor: colors.border }]}>
              <View style={[styles.emptyIconRing, { backgroundColor: colors.primary + "18", borderColor: colors.primary + "40" }]}>
                <Feather name="trending-up" size={34} color={colors.primary} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Your Watchlist is empty</Text>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
                Search for any stock, ETF, or fund from world markets and add it here to start tracking it.
              </Text>
              <TouchableOpacity
                style={[styles.emptyButton, { backgroundColor: colors.primary }]}
                onPress={() => router.push("/(tabs)/search")}
              >
                <Feather name="search" size={15} color={colors.primaryForeground} style={{ marginRight: 6 }} />
                <Text style={[styles.emptyButtonText, { color: colors.primaryForeground }]}>Search for a stock</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.emptyButtonOutline, { borderColor: colors.border }]}
                onPress={() => setAddSheetVisible(true)}
              >
                <Text style={[styles.emptyButtonOutlineText, { color: colors.mutedForeground }]}>Browse & add stocks</Text>
              </TouchableOpacity>
            </View>
          ) : editMode ? (
            <View style={[styles.emptyFilter, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>All stocks removed. Tap Done to confirm.</Text>
            </View>
          ) : (
            <View style={[styles.emptyFilter, { borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No {filter} right now.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <DraggableFlatList
          data={displayed}
          keyExtractor={(item) => item.ticker}
          renderItem={({ item, drag: dragFn, isActive: active }: RenderItemParams<Stock>) => (
            <StockCard
              stock={item}
              chartData={miniCharts[item.ticker]}
              showPercent={showPercent}
              editMode={editMode}
              onRemove={() => handlePendingRemove(item.ticker)}
              drag={dragEnabled ? () => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                dragFn();
              } : undefined}
              isActive={active}
            />
          )}
          onDragEnd={({ data }) => {
            const newTickers = data.map((s) => s.ticker);
            reorderFolder(activeFolderId, newTickers);
          }}
          containerStyle={styles.fill}
          contentContainerStyle={{ paddingBottom: bottomPadding, paddingHorizontal: 16 }}
          showsVerticalScrollIndicator={false}
          activationDistance={dragEnabled ? 0 : 99999}
        />
      )}

      <FolderAddSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        folderId={activeFolderId}
        folderName={activeFolder?.name ?? "My Watchlist"}
      />

      <DeleteFolderModal
        state={deleteModal}
        onCancel={handleModalCancel}
        onDeleteFolderOnly={handleModalDeleteFolderOnly}
        onDeleteFolderAndStocks={handleModalDeleteFolderAndStocks}
        colors={colors}
      />
      {/* Portfolio picker bottom sheet */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={closePortfolioPicker}
      >
        <View style={pickerStyles.overlay}>
          <TouchableOpacity
            style={pickerStyles.backdrop}
            activeOpacity={1}
            onPress={closePortfolioPicker}
          />
          <View style={[pickerStyles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[pickerStyles.handle, { backgroundColor: colors.border }]} />
            <View style={pickerStyles.header}>
              <Text style={[pickerStyles.title, { color: colors.foreground }]}>Portfolios</Text>
              {canCreateFolder && !creatingPortfolio && (
                <TouchableOpacity
                  style={[pickerStyles.newBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setNewPortfolioName("");
                    setCreatingPortfolio(true);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={14} color={colors.primaryForeground} />
                  <Text style={[pickerStyles.newBtnText, { color: colors.primaryForeground }]}>New</Text>
                </TouchableOpacity>
              )}
            </View>
            {creatingPortfolio && (
              <View style={pickerStyles.createRow}>
                <TextInput
                  style={[pickerStyles.createInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
                  placeholder="Portfolio name"
                  placeholderTextColor={colors.mutedForeground}
                  value={newPortfolioName}
                  onChangeText={setNewPortfolioName}
                  autoFocus
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleCreatePortfolio}
                />
                <TouchableOpacity
                  style={[pickerStyles.createBtn, { backgroundColor: newPortfolioName.trim() ? colors.primary : colors.secondary }]}
                  onPress={handleCreatePortfolio}
                  disabled={!newPortfolioName.trim()}
                  activeOpacity={0.7}
                >
                  <Text style={[pickerStyles.createBtnText, { color: newPortfolioName.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                    Create
                  </Text>
                </TouchableOpacity>
              </View>
            )}
            {portfolios.length === 0 && !creatingPortfolio && (
              <View style={pickerStyles.empty}>
                <Text style={[pickerStyles.emptyText, { color: colors.mutedForeground }]}>No portfolios yet</Text>
              </View>
            )}
            {portfolios.length > 0 && (
              <ScrollView style={pickerStyles.list} showsVerticalScrollIndicator={false}>
                {portfolios.map((folder) => {
                  const isSelected = folder.id === activeFolderId;
                  return (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        pickerStyles.row,
                        {
                          backgroundColor: isSelected ? `${colors.primary}12` : "transparent",
                          borderColor: isSelected ? `${colors.primary}30` : colors.border,
                        },
                      ]}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setActiveFolderId(folder.id);
                        closePortfolioPicker();
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={pickerStyles.rowLeft}>
                        <Text
                          style={[pickerStyles.rowName, { color: isSelected ? colors.primary : colors.foreground }]}
                          numberOfLines={1}
                        >
                          {folder.name}
                        </Text>
                        <Text style={[pickerStyles.rowCount, { color: colors.mutedForeground }]}>
                          {folder.tickers.length} {folder.tickers.length === 1 ? "stock" : "stocks"}
                        </Text>
                      </View>
                      {isSelected && <Feather name="check" size={16} color={colors.primary} />}
                      <TouchableOpacity
                        onPress={() => handlePickerDelete(folder)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        style={pickerStyles.trashBtn}
                        accessibilityLabel="Delete portfolio"
                      >
                        <Feather name="trash-2" size={16} color={colors.mutedForeground} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
      <TabHintPopup
        tabKey="home"
        hint="This is your Home tab — your personal watchlist. Add stocks you care about to track their live prices and daily changes at a glance."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  appTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", position: "relative" },
  badge: { position: "absolute", top: 5, right: 5, width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  toolbarRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  toolbarRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  addButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, gap: 5 },
  addButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  editButton: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  editButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  editButtonGhost: { paddingHorizontal: 8, paddingVertical: 8 },
  editButtonGhostText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  doneButton: { paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  doneButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  deleteButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, gap: 5 },
  deleteButtonText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", alignItems: "center" },
  filterChips: { flexDirection: "row", gap: 8 },
  filterRowRight: { flexDirection: "row", alignItems: "center", gap: 12 },
  filterRowSeparator: { width: 1, height: 20 },
  changeToggle: { flexDirection: "row", alignItems: "center", borderRadius: 8, borderWidth: 1, overflow: "hidden" },
  changeToggleText: { fontSize: 12, fontFamily: "Inter_700Bold", paddingHorizontal: 10, paddingVertical: 6 },
  changeToggleDivider: { width: 1, height: "100%" },
  filterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, gap: 6 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterCount: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, minWidth: 18, alignItems: "center" },
  filterCountText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 24 },
  emptyFilter: { alignItems: "center", paddingVertical: 32, borderWidth: 1, borderStyle: "dashed", borderRadius: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyIconRing: { width: 72, height: 72, borderRadius: 36, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  emptyButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  emptyButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  emptyButtonOutline: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  emptyButtonOutlineText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  controlRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  segmentedControl: { flexDirection: "row", borderRadius: 10, borderWidth: 1, overflow: "hidden" },
  segment: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, gap: 4 },
  segmentText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});

const pickerStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, paddingBottom: 34, maxHeight: "50%" },
  handle: { width: 36, height: 4, borderRadius: 2, alignSelf: "center", marginTop: 10, marginBottom: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  newBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, gap: 4 },
  newBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  createRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 12 },
  createInput: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, fontFamily: "Inter_400Regular" },
  createBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10 },
  createBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  list: { paddingHorizontal: 16, paddingBottom: 8 },
  empty: { alignItems: "center", paddingVertical: 32 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  rowLeft: { flex: 1, gap: 2 },
  rowName: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  rowCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  trashBtn: { padding: 6, marginLeft: 8 },
});
