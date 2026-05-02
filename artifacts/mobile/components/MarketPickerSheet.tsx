import { Feather } from "@expo/vector-icons";
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
import { useBenchmark } from "@/context/BenchmarkContext";
import {
  BENCHMARKS,
  benchmarkInfo,
  type Benchmark,
} from "@/hooks/useBenchmarkSeries";

interface MarketPickerSheetProps {
  visible: boolean;
  onClose: () => void;
  /** The auto-detected benchmark, used to label the "Auto" row. */
  autoFallback: Benchmark;
}

/**
 * Bottom-sheet picker that lets the user choose which benchmark index their
 * portfolio is compared against on the Insights screen. The current choice
 * (including the special "Auto" option) is persisted in BenchmarkContext.
 */
export function MarketPickerSheet({
  visible,
  onClose,
  autoFallback,
}: MarketPickerSheetProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { selection, setSelection } = useBenchmark();

  const handlePick = (next: Benchmark | "auto") => {
    Haptics.selectionAsync();
    setSelection(next);
    onClose();
  };

  const autoInfo = benchmarkInfo(autoFallback);

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
              Compare to
            </Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
            >
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>

          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Pick the index your portfolio is benchmarked against.
          </Text>

          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingTop: 6, paddingBottom: 6 }}
            showsVerticalScrollIndicator={false}
          >
            <Row
              label="Auto"
              sub={`Picks the best fit for your portfolio (now: ${autoInfo.label})`}
              selected={selection === "auto"}
              onPress={() => handlePick("auto")}
              colors={colors}
              icon="zap"
            />

            <View
              style={[
                styles.divider,
                { backgroundColor: colors.border, marginVertical: 6 },
              ]}
            />

            {BENCHMARKS.map((b) => (
              <Row
                key={b.id}
                label={b.label}
                sub={b.region}
                selected={selection === b.id}
                onPress={() => handlePick(b.id)}
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
  label,
  sub,
  selected,
  onPress,
  colors,
  icon,
}: {
  label: string;
  sub: string;
  selected: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
  icon?: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[
        styles.row,
        {
          backgroundColor: selected ? colors.secondary : "transparent",
          borderColor: selected ? colors.primary : "transparent",
        },
      ]}
    >
      {icon ? (
        <View
          style={[styles.iconWrap, { backgroundColor: colors.secondary }]}
        >
          <Feather name={icon} size={16} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          style={{
            color: colors.foreground,
            fontSize: 15,
            fontFamily: "Inter_600SemiBold",
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            color: colors.mutedForeground,
            fontSize: 12,
            fontFamily: "Inter_400Regular",
            marginTop: 2,
          }}
        >
          {sub}
        </Text>
      </View>
      {selected ? (
        <Feather name="check" size={20} color={colors.primary} />
      ) : null}
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
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  divider: { height: StyleSheet.hairlineWidth },
});
