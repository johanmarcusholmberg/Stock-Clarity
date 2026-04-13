import React, { useState } from "react";
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
  } = useWatchlist();

  const [showPaywall, setShowPaywall] = useState(false);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [renameModalVisible, setRenameModalVisible] = useState(false);
  const [contextMenuFolder, setContextMenuFolder] = useState<WatchlistFolder | null>(null);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renameFolderName, setRenameFolderName] = useState("");

  const handlePlusPress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!canCreateFolder) {
      setShowPaywall(true);
      return;
    }
    setNewFolderName("");
    setCreateModalVisible(true);
  };

  const handleCreateFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const folder = createFolder(name);
    if (folder) {
      setActiveFolderId(folder.id);
    }
    setCreateModalVisible(false);
    setNewFolderName("");
  };

  const handleTabPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setActiveFolderId(id);
  };

  const handleTabLongPress = (folder: WatchlistFolder) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setContextMenuFolder(folder);
    setContextMenuVisible(true);
  };

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

  const handleDeletePress = () => {
    if (!contextMenuFolder) return;
    setContextMenuVisible(false);
    const folderName = contextMenuFolder.name;
    const folderId = contextMenuFolder.id;
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${folderName}"? Stocks in this folder will be removed from it.`)) {
        deleteFolder(folderId);
        setContextMenuFolder(null);
      }
    } else {
      Alert.alert(
        `Delete "${folderName}"?`,
        "Stocks in this folder will be removed from it.",
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

      <Modal
        visible={createModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreateModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCreateModalVisible(false)}
        >
          <View
            style={[styles.modalSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
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
              onSubmitEditing={handleCreateFolder}
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
                onPress={handleCreateFolder}
                disabled={!newFolderName.trim()}
              >
                <Text
                  style={[
                    styles.modalBtnText,
                    { color: newFolderName.trim() ? colors.primaryForeground : colors.mutedForeground },
                  ]}
                >
                  Create
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

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
            {folders.length > 1 && (
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
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
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
