import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { CheckIcon, ExpandIcon, EyeIcon, FolderIcon } from "@/components/icons/StockIcons";

type Colors = ReturnType<typeof useColors>;

const DEFAULT_FOLDER_ID = "default";

interface PortfolioPickerProps {
  /** Optional style overrides for the chip wrapper. */
  chipStyle?: object;
}

/**
 * Tappable chip that displays the active portfolio name and opens a bottom
 * sheet for switching. Wired to the global activeFolderId from WatchlistContext
 * — toggling on any tab updates every other consumer.
 */
export function PortfolioPicker({ chipStyle }: PortfolioPickerProps) {
  const colors = useColors();
  const { folders, activeFolderId, setActiveFolderId } = useWatchlist();
  const [sheetVisible, setSheetVisible] = useState(false);
  const isDefaultFolder = activeFolderId === DEFAULT_FOLDER_ID;
  const activeFolder = folders.find((f) => f.id === activeFolderId);

  if (!activeFolder) return null;

  return (
    <>
      <TouchableOpacity
        style={[
          styles.chip,
          { backgroundColor: `${colors.primary}18`, borderColor: `${colors.primary}44` },
          chipStyle,
        ]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setSheetVisible(true);
        }}
        activeOpacity={0.7}
        accessibilityLabel={`Switch portfolio. Current: ${activeFolder.name}`}
      >
        {isDefaultFolder
          ? <EyeIcon size={12} color={colors.primary} strokeWidth={2} />
          : <FolderIcon size={12} color={colors.primary} strokeWidth={2} />}
        <Text style={[styles.chipText, { color: colors.primary }]} numberOfLines={1}>
          {activeFolder.name}
        </Text>
        <ExpandIcon size={12} color={colors.primary} strokeWidth={2} />
      </TouchableOpacity>

      <PortfolioSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        folders={folders}
        activeFolderId={activeFolderId}
        onSelect={(id) => {
          setActiveFolderId(id);
          setSheetVisible(false);
        }}
        colors={colors}
      />
    </>
  );
}

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
      <View style={styles.overlay}>
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />
        <View style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>Switch portfolio</Text>
          </View>
          <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
            {folders.map((folder) => {
              const selected = folder.id === activeFolderId;
              const isDefault = folder.id === DEFAULT_FOLDER_ID;
              return (
                <TouchableOpacity
                  key={folder.id}
                  style={[
                    styles.row,
                    {
                      backgroundColor: selected ? `${colors.primary}15` : "transparent",
                      borderColor: selected ? `${colors.primary}44` : colors.border,
                    },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    onSelect(folder.id);
                  }}
                  activeOpacity={0.7}
                >
                  {isDefault
                    ? <EyeIcon size={14} color={selected ? colors.primary : colors.mutedForeground} />
                    : <FolderIcon size={14} color={selected ? colors.primary : colors.mutedForeground} />}
                  <View style={styles.rowText}>
                    <Text
                      style={[styles.rowName, { color: selected ? colors.primary : colors.foreground }]}
                      numberOfLines={1}
                    >
                      {folder.name}
                    </Text>
                    <Text style={[styles.rowCount, { color: colors.mutedForeground }]}>
                      {folder.tickers.length} {folder.tickers.length === 1 ? "stock" : "stocks"}
                    </Text>
                  </View>
                  {selected && <CheckIcon size={16} color={colors.primary} />}
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

const styles = StyleSheet.create({
  chip: {
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
  chipText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    flexShrink: 1,
  },
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.55)" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: "70%",
    minHeight: 260,
  },
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
