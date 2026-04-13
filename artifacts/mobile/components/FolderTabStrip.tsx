import React, { useState, useMemo } from "react";
import {
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useWatchlist, WatchlistFolder } from "@/context/WatchlistContext";
import { PaywallSheet } from "@/components/PaywallSheet";

const DEFAULT_FOLDER_ID = "default";

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

  const [showPaywall, setShowPaywall] = useState(false);

  // Create folder modal state
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [createStep, setCreateStep] = useState<1 | 2>(1);
  const [newFolderName, setNewFolderName] = useState("");
  const [pendingFolderId, setPendingFolderId] = useState<string | null>(null);
  const [selectedTickers, setSelectedTickers] = useState<Set<string>>(new Set());

  // Rename modal state
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [renameFolderName, setRenameFolderName] = useState("");

  // Context menu state
  const [contextMenuFolder, setContextMenuFolder] = useState<WatchlistFolder | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);

  // Tickers in "My Watchlist" (default folder) for the stock picker
  const myWatchlistTickers = useMemo(() => {
    return folders.find((f) => f.id === DEFAULT_FOLDER_ID)?.tickers ?? [];
  }, [folders]);

  // ── Create folder ──────────────────────────────────────────────

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

  const handleCreateStep1 = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = createFolder(name);
    if (!folder) return;
    setActiveFolderId(folder.id);
    setPendingFolderId(folder.id);
    // If there are stocks in My Watchlist, go to step 2
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

  // ── Tab interaction ────────────────────────────────────────────

  const handleTabPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolderId(id);
  };

  const handleTabLongPress = (folder: WatchlistFolder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextMenuFolder(folder);
    setContextMenuVisible(true);
  };

  // ── Rename ─────────────────────────────────────────────────────

  const handleRenamePress = () => {
    if (!contextMenuFolder) return;
    setContextMenuVisible(false);
    setRenameFolderName(contextMenuFolder.name);
    setRenameModalVisible(true);
  };

  const handleRenameConfirm = () => {
    const name = renameFolderName.trim();
    if (!name || !contextMenuFolder) return;
    renameFolder(contextMenuFolder.id, name);
    setRenameModalVisible(false);
    setContextMenuFolder(null);
  };

  // ── Delete ─────────────────────────────────────────────────────

  const handleDeletePress = () => {
    if (!contextMenuFolder) return;
    setContextMenuVisible(false);
    const folderName = contextMenuFolder.name;
    const folderId = contextMenuFolder.id;
    const message = "Stocks will be moved to My Watchlist";
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${folderName}"?\n${message}`)) {
        deleteFolder(folderId);
        setContextMenuFolder(null);
      }
    } else {
      Alert.alert(
        `Delete "${folderName}"?`,
        message,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: () => {
              deleteFolder(folderId);
              setContextMenuFolder(null);
            },
          },
        ]
      );
    }
  };

  const canDelete = contextMenuFolder?.id !== DEFAULT_FOLDER_ID;

  return (
    <>
      <View style={styles.container}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          style={styles.scrollView}
        >
          {folders.map((folder) => {
            const isActive = folder.id === activeFolderId;
            return (
              <TouchableOpacity
                key={folder.id}
                style={[
                  styles.tab,
                  {
                    backgroundColor: isActive ? colors.primary : colors.secondary,
                    borderColor: isActive ? colors.primary : colors.border,
                  },
                ]}
                onPress={() => handleTabPress(folder.id)}
                onLongPress={() => handleTabLongPress(folder)}
                delayLongPress={500}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.tabText,
                    { color: isActive ? colors.primaryForeground : colors.foreground },
                  ]}
                  numberOfLines={1}
                >
                  {folder.name}
                </Text>
                {folder.tickers.length > 0 && (
                  <View
                    style={[
                      styles.countBadge,
                      {
                        backgroundColor: isActive
                          ? `${colors.primaryForeground}33`
                          : `${colors.primary}22`,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.countText,
                        { color: isActive ? colors.primaryForeground : colors.primary },
                      ]}
                    >
                      {folder.tickers.length}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}

          <TouchableOpacity
            style={[
              styles.addTab,
              { backgroundColor: colors.secondary, borderColor: colors.border },
            ]}
            onPress={handlePlusPress}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── Create Folder Modal ── */}
      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => {
            if (createStep === 1) setCreateModalVisible(false);
          }}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            {createStep === 1 ? (
              <>
                <Text style={[styles.modalTitle, { color: colors.foreground }]}>New Folder</Text>
                <TextInput
                  style={[
                    styles.input,
                    { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary },
                  ]}
                  placeholder="Folder name (e.g. Tech Picks)"
                  placeholderTextColor={colors.mutedForeground}
                  value={newFolderName}
                  onChangeText={setNewFolderName}
                  autoFocus
                  maxLength={30}
                  returnKeyType="done"
                  onSubmitEditing={handleCreateStep1}
                />
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                    onPress={() => setCreateModalVisible(false)}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalBtn,
                      styles.modalBtnPrimary,
                      { backgroundColor: newFolderName.trim() ? colors.primary : colors.secondary },
                    ]}
                    onPress={handleCreateStep1}
                    disabled={!newFolderName.trim()}
                  >
                    <Text
                      style={[
                        styles.modalBtnText,
                        { color: newFolderName.trim() ? colors.primaryForeground : colors.mutedForeground },
                      ]}
                    >
                      {myWatchlistTickers.length > 0 ? "Next" : "Create"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <>
                <View style={styles.modalTitleRow}>
                  <Text style={[styles.modalTitle, { color: colors.foreground }]}>Add Stocks</Text>
                  <Text style={[styles.modalSubtitle, { color: colors.mutedForeground }]}>
                    Tap to add from My Watchlist
                  </Text>
                </View>
                <ScrollView style={styles.stockPickerList} showsVerticalScrollIndicator={false}>
                  {myWatchlistTickers.map((ticker) => {
                    const stock = stocks[ticker];
                    const selected = selectedTickers.has(ticker);
                    return (
                      <TouchableOpacity
                        key={ticker}
                        style={[
                          styles.stockPickerRow,
                          {
                            backgroundColor: selected ? `${colors.primary}15` : "transparent",
                            borderColor: selected ? `${colors.primary}44` : colors.border,
                          },
                        ]}
                        onPress={() => toggleTicker(ticker)}
                        activeOpacity={0.7}
                      >
                        <View style={styles.stockPickerInfo}>
                          <Text style={[styles.stockPickerTicker, { color: colors.foreground }]}>{ticker}</Text>
                          {stock?.name ? (
                            <Text style={[styles.stockPickerName, { color: colors.mutedForeground }]} numberOfLines={1}>
                              {stock.name}
                            </Text>
                          ) : null}
                        </View>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: selected ? colors.primary : "transparent",
                              borderColor: selected ? colors.primary : colors.border,
                            },
                          ]}
                        >
                          {selected && <Feather name="check" size={12} color={colors.primaryForeground} />}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                    onPress={handleCreateStep2Done}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Skip</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, styles.modalBtnPrimary, { backgroundColor: colors.primary }]}
                    onPress={handleCreateStep2Done}
                  >
                    <Text style={[styles.modalBtnText, { color: colors.primaryForeground }]}>
                      {selectedTickers.size > 0 ? `Add ${selectedTickers.size}` : "Done"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Rename Folder Modal ── */}
      <Modal
        visible={renameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRenameModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setRenameModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>Rename Folder</Text>
            <TextInput
              style={[
                styles.input,
                { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary },
              ]}
              placeholder="New folder name"
              placeholderTextColor={colors.mutedForeground}
              value={renameFolderName}
              onChangeText={setRenameFolderName}
              autoFocus
              maxLength={30}
              returnKeyType="done"
              onSubmitEditing={handleRenameConfirm}
            />
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={() => setRenameModalVisible(false)}
              >
                <Text style={[styles.modalBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.modalBtn,
                  styles.modalBtnPrimary,
                  { backgroundColor: renameFolderName.trim() ? colors.primary : colors.secondary },
                ]}
                onPress={handleRenameConfirm}
                disabled={!renameFolderName.trim()}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: renameFolderName.trim() ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  Rename
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Context Menu ── */}
      <Modal
        visible={contextMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setContextMenuVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setContextMenuVisible(false)}
        >
          <View
            style={[styles.contextMenu, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[styles.contextMenuTitle, { color: colors.mutedForeground }]} numberOfLines={1}>
              {contextMenuFolder?.name}
            </Text>
            <TouchableOpacity style={styles.contextMenuItem} onPress={handleRenamePress}>
              <Feather name="edit-2" size={16} color={colors.foreground} />
              <Text style={[styles.contextMenuItemText, { color: colors.foreground }]}>Rename</Text>
            </TouchableOpacity>
            {canDelete && (
              <>
                <View style={[styles.contextMenuDivider, { backgroundColor: colors.border }]} />
                <TouchableOpacity style={styles.contextMenuItem} onPress={handleDeletePress}>
                  <Feather name="trash-2" size={16} color={colors.negative} />
                  <Text style={[styles.contextMenuItemText, { color: colors.negative }]}>Delete</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason="folder_limit"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 12,
  },
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    gap: 6,
    maxWidth: 160,
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  countBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 8,
    minWidth: 18,
    alignItems: "center",
  },
  countText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
  },
  addTab: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalSheet: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 20,
    borderWidth: 1,
    padding: 24,
    gap: 16,
    maxHeight: "80%",
  },
  modalTitleRow: {
    gap: 2,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  modalSubtitle: {
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
  stockPickerList: {
    maxHeight: 280,
  },
  stockPickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    gap: 12,
  },
  stockPickerInfo: {
    flex: 1,
    gap: 2,
  },
  stockPickerTicker: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  stockPickerName: {
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
  modalButtons: {
    flexDirection: "row",
    gap: 10,
  },
  modalBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  modalBtnPrimary: {
    borderWidth: 0,
  },
  modalBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  contextMenu: {
    width: 220,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
    paddingVertical: 4,
  },
  contextMenuTitle: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    paddingHorizontal: 16,
    paddingVertical: 10,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  contextMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
  contextMenuItemText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  contextMenuDivider: {
    height: 1,
    marginHorizontal: 16,
  },
});
