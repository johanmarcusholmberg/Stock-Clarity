import * as Haptics from "expo-haptics";
import React from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { CloseIcon, ExportIcon } from "@/components/icons/StockIcons";
import { StockIconRenderer } from "@/components/icons/StockIconRenderer";

export type ExportFormat =
  | "xlsx"
  | "csv-comma"
  | "csv-semicolon"
  | "csv-tab"
  | "pdf";

interface ExportSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Name of the portfolio being exported, for display only. */
  portfolioName: string;
  /** Called with the chosen format. The parent triggers the actual download. */
  onPick: (format: ExportFormat) => void;
}

interface FormatOption {
  id: ExportFormat;
  label: string;
  sub: string;
  icon: string;
  recommended?: boolean;
}

const OPTIONS: FormatOption[] = [
  {
    id: "xlsx",
    label: "Excel workbook (.xlsx)",
    sub: "Formatted spreadsheet with Holdings + Summary tabs, totals, and color-coded gains/losses.",
    icon: "grid",
    recommended: true,
  },
  {
    id: "csv-comma",
    label: "CSV — comma separated",
    sub: "Universal format. Use with Google Sheets, Numbers, or Excel in regions where comma is the list separator (US, UK).",
    icon: "file-text",
  },
  {
    id: "csv-semicolon",
    label: "CSV — semicolon separated",
    sub: "For Excel in regions where comma is the decimal separator (Sweden, Germany, France, most of continental Europe).",
    icon: "file-text",
  },
  {
    id: "csv-tab",
    label: "TSV — tab separated",
    sub: "Paste-friendly. Works everywhere, ideal for copying into other tools.",
    icon: "file-text",
  },
  {
    id: "pdf",
    label: "Printable PDF",
    sub: "Opens a clean, printable HTML page. Use your browser's Save as PDF.",
    icon: "printer",
  },
];

/**
 * Bottom-sheet picker for choosing an export format. Replaces the previous
 * pair of "CSV" / "Print" buttons with a clearer list of options that
 * accommodates international Excel locales (semicolon CSV) and adds a real
 * multi-sheet xlsx workbook.
 */
export function ExportSheet({
  visible,
  onClose,
  portfolioName,
  onPick,
}: ExportSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const handlePick = (id: ExportFormat) => {
    Haptics.selectionAsync();
    onPick(id);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 16) + 8,
            },
          ]}
          onPress={() => {}}
        >
          <View style={styles.handle}>
            <View
              style={[styles.handleBar, { backgroundColor: colors.border }]}
            />
          </View>

          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.foreground }]}>
              Export portfolio
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <CloseIcon size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Choose how you'd like to download{" "}
            <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>
              {portfolioName}
            </Text>
            .
          </Text>

          <ScrollView
            style={{ maxHeight: 480 }}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: 6 }}
            showsVerticalScrollIndicator={false}
          >
            {OPTIONS.map((opt) => (
              <Row
                key={opt.id}
                option={opt}
                onPress={() => handlePick(opt.id)}
                colors={colors}
              />
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Row({
  option,
  onPress,
  colors,
}: {
  option: FormatOption;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityLabel={option.label}
      accessibilityRole="button"
      style={[
        styles.row,
        { backgroundColor: colors.secondary, borderColor: colors.border },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: colors.card }]}>
        <StockIconRenderer name={option.icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Text
            style={{
              color: colors.foreground,
              fontSize: 15,
              fontFamily: "Inter_600SemiBold",
            }}
          >
            {option.label}
          </Text>
          {option.recommended ? (
            <View
              style={{
                backgroundColor: colors.primary,
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 4,
              }}
            >
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontSize: 9,
                  fontFamily: "Inter_700Bold",
                  letterSpacing: 0.5,
                }}
              >
                RECOMMENDED
              </Text>
            </View>
          ) : null}
        </View>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            marginTop: 4,
            lineHeight: 17,
          }}
        >
          {option.sub}
        </Text>
      </View>
      <ExportIcon size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  sheet: {
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: Platform.OS === "web" ? 0 : 1,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  handle: { alignItems: "center", paddingVertical: 8 },
  handleBar: { width: 40, height: 4, borderRadius: 2 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    marginBottom: 10,
    lineHeight: 18,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
});
