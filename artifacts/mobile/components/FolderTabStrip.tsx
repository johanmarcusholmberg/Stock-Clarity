import React, { useState, useMemo } from "react";
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useWatchlist, WatchlistFolder } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";

const DEFAULT_FOLDER_ID = "default";

/**
 * Scalable navigation replacing the old horizontal chip strip.
 *
 * Layout: [★ Watchlist] [▾ Portfolios / PortfolioName] [+]
 *
 * "Portfolios" chip opens a bottom sheet selector. When a portfolio is active,
 * the chip shows that portfolio's name so the selection is always visible.
 * Rename/delete actions live inside the sheet via per-row overflow menus.
 */
export function FolderTabStrip() {
  const colors = useColors();
  const {
    folders,
    activeFolderId,
    setActiveFolderId,
    createFolder,
    renameFolder,
    deleteFolder,
    canCreateFolder,
    addToFolder,
    stocks,
  } = useWatchlist();
  const { tier } = useSubscription();

  const [showPaywall, setShowPaywall] = useState(false);

  // Portfolio selector sheet
  const [sheetVisible, setSheetVisible] = useState(false);
  const [expandedFolderId, setExpandedFolderId] = useState<string | null>(null);

  // Create folder flow (2-step: name → optional stock picker)
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  // Rename flow
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");
  const [renamingFolder, setRenamingFolder] = useState<WatchlistFolder | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<WatchlistFolder | null>(null);

  const isDefaultActive = activeFolderId === DEFAULT_FOLDER_ID;
  const activePortfolio = folders.find(
    (f) => f.id === activeFolderId && f.id !== DEFAULT_FOLDER_ID
  );
  const portfolios = folders.filter((f) => f.id !== DEFAULT_FOLDER_ID);

  const myWatchlistTickers = useMemo(
    () => folders.find((f) => f.id === DEFAULT_FOLDER_ID)?.tickers ?? [],
    [folders]
  );

  // ── Navigation chip handlers ─────────────────────────────────

  const handleWatchlistPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolderId(DEFAULT_FOLDER_ID);
  };

  const handlePortfolioChipPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedFolderId(null);
    setSheetVisible(true);
  };

  const handlePlusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!canCreateFolder) {
      setShowPaywall(true);
      return;
    }
    setNewFolderName("");
    setSelectedTickers(new Set());
    setPendingFolderId(null);
    setCreateStep(1);
    setCreateModalVisible(true);
  };

  // ── Sheet actions ────────────────────────────────────────────

  const handleSelectPortfolio = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolderId(id);
    setSheetVisible(false);
  };

  const toggleOverflow = (folderId: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpandedFolderId((prev) => (prev === folderId ? null : folderId));
  };

  const handleStartRename = (folder: WatchlistFolder) => {
    setRenamingFolder(folder);
    setRenameFolderName(folder.name);
    setExpandedFolderId(null);
    setSheetVisible(false);
    setTimeout(() => setRenameModalVisible(true), 250);
  };

  const handleStartDelete = (folder: WatchlistFolder) => {
    setExpandedFolderId(null);
    setSheetVisible(false);
    setTimeout(() => setDeleteTarget(folder), 250);
  };

  // ── Create flow ──────────────────────────────────────────────

  const handleCreateStep1 = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = createFolder(name);
    if (!folder) return;
    setActiveFolderId(folder.id);
    setPendingFolderId(folder.id);
    if (myWatchlistTickers.length > 0) {
      setSelectedTickers(new Set());
      setCreateStep(2);
    } else {
      setCreateModalVisible(false);
      setNewFolderName("");
    }
  };

  const handleCreateStep2Done = () => {
    if (pendingFolderId && selectedTickers.size > 0) {
      selectedTickers.forEach((ticker) => {
        addToFolder(ticker, pendingFolderId);
      });
    }
    setCreateModalVisible(false);
    setNewFolderName("");
    setSelectedTickers(new Set());
    setPendingFolderId(null);
    setCreateStep(1);
  };

  const toggleTicker = (ticker: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSelectedTickers((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  };

  // ── Rename flow ──────────────────────────────────────────────

  const handleRenameConfirm = () => {
    const name = renameFolderName.trim();
    if (!name || !renamingFolder) return;
    renameFolder(renamingFolder.id, name);
    setRenameModalVisible(false);
    setRenamingFolder(null);
  };

  // ── Delete flow ──────────────────────────────────────────────

  const handleDeleteConfirm = (removeStocks: boolean) => {
    if (!deleteTarget) return;
    deleteFolder(deleteTarget.id, removeStocks);
    setDeleteTarget(null);
  };

  return (
    <>
      {/* ── Navigation bar: Watchlist | Portfolios | + ── */}
      <View style={styles.container}>
        <View style={styles.navRow}>
          {/* Watchlist chip */}
          <TouchableOpacity
            style={[
              styles.navChip,
              {
                backgroundColor: isDefaultActive ? colors.primary : colors.secondary,
                borderColor: isDefaultActive ? colors.primary : colors.border,
              },
            ]}
            onPress={handleWatchlistPress}
            activeOpacity={0.7}
          >
            <Feather
              name="star"
              size={14}
              color={isDefaultActive ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.navChipText,
                { color: isDefaultActive ? colors.primaryForeground : colors.foreground },
              ]}
            >
              Watchlist
            </Text>
          </TouchableOpacity>

          {/* Portfolios chip — shows active portfolio name when one is selected */}
          <TouchableOpacity
            style={[
              styles.navChip,
              styles.navChipPortfolio,
              {
                backgroundColor: !isDefaultActive ? colors.primary : colors.secondary,
                borderColor: !isDefaultActive ? colors.primary : colors.border,
              },
            ]}
            onPress={handlePortfolioChipPress}
            activeOpacity={0.7}
          >
            <Feather
              name="layers"
              size={14}
              color={!isDefaultActive ? colors.primaryForeground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.navChipText,
                { color: !isDefaultActive ? colors.primaryForeground : colors.foreground },
              ]}
              numberOfLines={1}
            >
              {activePortfolio ? activePortfolio.name : "Portfolios"}
            </Text>
            <Feather
              name="chevron-down"
              size={14}
              color={!isDefaultActive ? colors.primaryForeground : colors.mutedForeground}
            />
          </TouchableOpacity>

          {/* Add button */}
          <TouchableOpacity
            style={[
              styles.addBtn,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
            onPress={handlePlusPress}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Portfolio Selector Sheet ── */}
      <Modal
        visible={sheetVisible}
        transparent
        animationType="slide"
        presentationStyle="overFullScreen"
        onRequestClose={() => setSheetVisible(false)}
      >
        <View style={sheetStyles.overlay}>
          <TouchableOpacity
            style={sheetStyles.backdrop}
            activeOpacity={1}
            onPress={() => setSheetVisible(false)}
          />
          <View
            style={[
              sheetStyles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={[sheetStyles.handle, { backgroundColor: colors.border }]} />

            {/* Header */}
            <View style={sheetStyles.header}>
              <Text style={[sheetStyles.title, { color: colors.foreground }]}>
                Portfolios
              </Text>
              {canCreateFolder && (
                <TouchableOpacity
                  style={[sheetStyles.newBtn, { backgroundColor: colors.primary }]}
                  onPress={() => {
                    setSheetVisible(false);
                    setTimeout(handlePlusPress, 250);
                  }}
                  activeOpacity={0.7}
                >
                  <Feather name="plus" size={14} color={colors.primaryForeground} />
                  <Text style={[sheetStyles.newBtnText, { color: colors.primaryForeground }]}>
                    New
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Portfolio list */}
            <ScrollView
              style={sheetStyles.list}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={sheetStyles.listContent}
            >
              {portfolios.length === 0 ? (
                <View style={sheetStyles.empty}>
                  <Feather name="layers" size={28} color={colors.mutedForeground} />
                  <Text style={[sheetStyles.emptyText, { color: colors.mutedForeground }]}>
                    No portfolios yet
                  </Text>
                  <Text style={[sheetStyles.emptyHint, { color: colors.mutedForeground }]}>
                    Tap + to create your first portfolio
                  </Text>
                </View>
              ) : (
                portfolios.map((folder) => {
                  const isSelected = folder.id === activeFolderId;
                  const isExpanded = expandedFolderId === folder.id;
                  return (
                    <View key={folder.id}>
                      <TouchableOpacity
                        style={[
                          sheetStyles.row,
                          {
                            backgroundColor: isSelected ? `${colors.primary}12` : "transparent",
                            borderColor: isSelected ? `${colors.primary}30` : colors.border,
                          },
                        ]}
                        onPress={() => handleSelectPortfolio(folder.id)}
                        activeOpacity={0.7}
                      >
                        <View style={sheetStyles.rowLeft}>
                          <Text
                            style={[
                              sheetStyles.rowName,
                              { color: isSelected ? colors.primary : colors.foreground },
                            ]}
                            numberOfLines={1}
                          >
                            {folder.name}
                          </Text>
                          <Text style={[sheetStyles.rowCount, { color: colors.mutedForeground }]}>
                            {folder.tickers.length}{" "}
                            {folder.tickers.length === 1 ? "stock" : "stocks"}
                          </Text>
                        </View>
                        <View style={sheetStyles.rowRight}>
                          {isSelected && (
                            <Feather name="check" size={16} color={colors.primary} />
                          )}
                          <TouchableOpacity
                            style={sheetStyles.overflowBtn}
                            onPress={() => toggleOverflow(folder.id)}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <Feather
                              name="more-horizontal"
                              size={18}
                              color={colors.mutedForeground}
                            />
                          </TouchableOpacity>
                        </View>
                      </TouchableOpacity>

                      {/* Inline action row revealed by overflow button */}
                      {isExpanded && (
                        <View style={[sheetStyles.actions, { borderColor: colors.border }]}>
                          <TouchableOpacity
                            style={[sheetStyles.actionBtn, { backgroundColor: colors.secondary }]}
                            onPress={() => handleStartRename(folder)}
                            activeOpacity={0.7}
                          >
                            <Feather name="edit-2" size={13} color={colors.foreground} />
                            <Text style={[sheetStyles.actionText, { color: colors.foreground }]}>
                              Rename
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[
                              sheetStyles.actionBtn,
                              { backgroundColor: `${colors.negative}12` },
                            ]}
                            onPress={() => handleStartDelete(folder)}
                            activeOpacity={0.7}
                          >
                            <Feather name="trash-2" size={13} color={colors.negative} />
                            <Text style={[sheetStyles.actionText, { color: colors.negative }]}>
                              Delete
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── Create Portfolio Modal ── */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={modalStyles.overlay}
          activeOpacity={1}
          onPress={() => {
            if (createStep === 1) setCreateModalVisible(false);
          }}
        >
          <View
            style={[
              modalStyles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onStartShouldSetResponder={() => true}
          >
            {createStep === 1 ? (
              <>
                <Text style={[modalStyles.title, { color: colors.foreground }]}>
                  New Portfolio
                </Text>
                <TextInput
                  style={[
                    modalStyles.input,
                    {
                      color: colors.foreground,
                      borderColor: colors.border,
                      backgroundColor: colors.secondary,
                    },
                  ]}
                  placeholder="Portfolio name (e.g. Tech Picks)"
                  placeholderTextColor={colors.mutedForeground}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  autoFocus
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateStep1}
                />
                <View style={modalStyles.buttons}>
                  <TouchableOpacity
                    style={[
                      modalStyles.btn,
                      { backgroundColor: colors.secondary, borderColor: colors.border },
                    ]}
                    onPress={() => setCreateModalVisible(false)}
                  >
                    <Text style={[modalStyles.btnText, { color: colors.mutedForeground }]}>
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      modalStyles.btn,
                      modalStyles.btnPrimary,
                      {
                        backgroundColor: newFolderName.trim()
                          ? colors.primary
                          : colors.secondary,
                      },
                    ]}
                    onPress={handleCreateStep1}
                    disabled={!newFolderName.trim()}
                  >
                    <Text
                      style={[
                        modalStyles.btnText,
                        {
                          color: newFolderName.trim()
                            ? colors.primaryForeground
                            : colors.mutedForeground,
                        },
                      ]}
                    >
                      {myWatchlistTickers.length > 0 ? "Next" : "Create"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={modalStyles.titleRow}>
                  <Text style={[modalStyles.title, { color: colors.foreground }]}>
                    Add Stocks
                  </Text>
                  <Text style={[modalStyles.subtitle, { color: colors.mutedForeground }]}>
                    Tap to add from My Watchlist
                  </Text>
                </View>
                <ScrollView style={modalStyles.stockList} showsVerticalScrollIndicator={false}>
                  {myWatchlistTickers.map((ticker) => {
                    const stock = stocks[ticker];
                    const selected = selectedTickers.has(ticker);
                    return (
                      <TouchableOpacity
                        key={ticker}
                        style={[
                          modalStyles.stockRow,
                          {
                            backgroundColor: selected ? `${colors.primary}15` : "transparent",
                            borderColor: selected ? `${colors.primary}44` : colors.border,
                          },
                        ]}
                        onPress={() => toggleTicker(ticker)}
                        activeOpacity={0.7}
                      >
                        <View style={modalStyles.stockInfo}>
                          <Text style={[modalStyles.stockTicker, { color: colors.foreground }]}>
                            {ticker}
                          </Text>
                          {stock?.name ? (
                            <Text
                              style={[modalStyles.stockName, { color: colors.mutedForeground }]}
                              numberOfLines={1}
                            >
                              {stock.name}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            modalStyles.checkbox,
                            {
                              backgroundColor: selected ? colors.primary : "transparent",
                              borderColor: selected ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          {selected && (
                            <Feather name="check" size={12} color={colors.primaryForeground} />
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={modalStyles.buttons}>
                  <TouchableOpacity
                    style={[
                      modalStyles.btn,
                      { backgroundColor: colors.secondary, borderColor: colors.border },
                    ]}
                    onPress={handleCreateStep2Done}
                  >
                    <Text style={[modalStyles.btnText, { color: colors.mutedForeground }]}>
                      Skip
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      modalStyles.btn,
                      modalStyles.btnPrimary,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={handleCreateStep2Done}
                  >
                    <Text style={[modalStyles.btnText, { color: colors.primaryForeground }]}>
                      {selectedTickers.size > 0 ? `Add ${selectedTickers.size}` : "Done"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Rename Portfolio Modal ── */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <TouchableOpacity
          style={modalStyles.overlay}
          activeOpacity={1}
          onPress={() => setRenameModalVisible(false)}
        >
          <View
            style={[
              modalStyles.sheet,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[modalStyles.title, { color: colors.foreground }]}>
              Rename Portfolio
            </Text>
            <TextInput
              style={[
                modalStyles.input,
                {
                  color: colors.foreground,
                  borderColor: colors.border,
                  backgroundColor: colors.secondary,
                },
              ]}
              placeholder="New portfolio name"
              placeholderTextColor={colors.mutedForeground}
              value={renameFolderName}
              onChangeText={setRenameFolderName}
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <View style={modalStyles.buttons}>
              <TouchableOpacity
                style={[
                  modalStyles.btn,
                  { backgroundColor: colors.secondary, borderColor: colors.border },
                ]}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={[modalStyles.btnText, { color: colors.mutedForeground }]}>
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  modalStyles.btn,
                  modalStyles.btnPrimary,
                  {
                    backgroundColor: renameFolderName.trim()
                      ? colors.primary
                      : colors.secondary,
                  },
                ]}
                onPress={handleRenameConfirm}
                disabled={!renameFolderName.trim()}
              >
                <Text
                  style={[
                    modalStyles.btnText,
                    {
                      color: renameFolderName.trim()
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  Rename
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Delete Portfolio Confirmation ── */}
      <Modal
        visible={deleteTarget !== null}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setDeleteTarget(null)}
      >
        <View style={deleteStyles.overlay}>
          <View
            style={[
              deleteStyles.dialog,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={[deleteStyles.title, { color: colors.foreground }]}>
              Delete "{deleteTarget?.name}"?
            </Text>
            <Text style={[deleteStyles.message, { color: colors.mutedForeground }]}>
              {(deleteTarget?.tickers.length ?? 0) > 0
                ? "Choose what happens to the stocks in this portfolio:"
                : "This portfolio is empty. It will be permanently deleted."}
            </Text>

            <View style={[deleteStyles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={deleteStyles.option}
              onPress={() => handleDeleteConfirm(false)}
              activeOpacity={0.7}
            >
              <Feather name="folder-minus" size={16} color={colors.foreground} />
              <View style={deleteStyles.optionText}>
                <Text style={[deleteStyles.optionTitle, { color: colors.foreground }]}>
                  Delete portfolio only
                </Text>
                <Text style={[deleteStyles.optionDesc, { color: colors.mutedForeground }]}>
                  {(deleteTarget?.tickers.length ?? 0) > 0
                    ? "Stocks stay in My Watchlist and any other portfolios."
                    : "The portfolio is removed. No stock data is affected."}
                </Text>
              </View>
            </TouchableOpacity>

            {(deleteTarget?.tickers.length ?? 0) > 0 && (
              <>
                <View style={[deleteStyles.divider, { backgroundColor: colors.border }]} />
                <TouchableOpacity
                  style={deleteStyles.option}
                  onPress={() => handleDeleteConfirm(true)}
                  activeOpacity={0.7}
                >
                  <Feather name="trash-2" size={16} color={colors.negative} />
                  <View style={deleteStyles.optionText}>
                    <Text style={[deleteStyles.optionTitle, { color: colors.negative }]}>
                      Delete portfolio and remove stocks
                    </Text>
                    <Text style={[deleteStyles.optionDesc, { color: colors.mutedForeground }]}>
                      Stocks are fully unfollowed from every portfolio.
                    </Text>
                  </View>
                </TouchableOpacity>
              </>
            )}

            <View style={[deleteStyles.divider, { backgroundColor: colors.border }]} />

            <TouchableOpacity
              style={[deleteStyles.cancelBtn, { backgroundColor: colors.secondary }]}
              onPress={() => setDeleteTarget(null)}
              activeOpacity={0.7}
            >
              <Text style={[deleteStyles.cancelText, { color: colors.foreground }]}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason="folder_limit"
        currentTier={tier}
      />
    </>
  );
}

// ── Navigation bar styles ────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  navChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
  },
  navChipPortfolio: {
    flex: 1,
    maxWidth: 200,
  },
  navChipText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  addBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});

// ── Portfolio selector sheet styles ──────────────────────────────
const sheetStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingBottom: 34,
    maxHeight: "70%",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  newBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  list: {
    paddingHorizontal: 16,
  },
  listContent: {
    paddingBottom: 8,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 6,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowLeft: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  rowCount: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  rowRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  overflowBtn: {
    padding: 4,
  },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
    marginTop: -4,
    paddingHorizontal: 4,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 10,
    gap: 6,
  },
  actionText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});

// ── Create / Rename modal styles ─────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    maxHeight: "80%",
  },
  titleRow: {
    gap: 2,
  },
  title: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  stockList: {
    maxHeight: 280,
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  stockInfo: {
    flex: 1,
    gap: 2,
  },
  stockTicker: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  stockName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  buttons: {
    flexDirection: "row",
    gap: 10,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  btnPrimary: {
    borderWidth: 0,
  },
  btnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});

// ── Delete confirmation styles ───────────────────────────────────
const deleteStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    borderRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 6,
  },
  message: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    paddingHorizontal: 20,
    paddingBottom: 16,
    lineHeight: 19,
  },
  divider: { height: 1 },
  option: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionText: { flex: 1, gap: 3 },
  optionTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  optionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  cancelBtn: {
    margin: 12,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
