import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useColors } from "@/hooks/useColors";
import { useNotify } from "@/context/NotifyContext";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Choice = "both" | "earnings_only" | "off";

const OPTIONS: { value: Choice; title: string; description: string; icon: keyof typeof Feather.glyphMap }[] = [
  {
    value: "both",
    title: "News + earnings",
    description: "Push when high-impact news hits a stock you watch, plus earnings reminders.",
    icon: "bell",
  },
  {
    value: "earnings_only",
    title: "Earnings only",
    description: "Quieter — only earnings reminders for stocks on your watchlist.",
    icon: "calendar",
  },
  {
    value: "off",
    title: "Off",
    description: "No news or earnings pushes. You can turn this on later from Account.",
    icon: "bell-off",
  },
];

export default function NotifyOptInSheet({ visible, onClose }: Props) {
  const colors = useColors();
  const { upsert, markFirstTimeShown } = useNotify();
  const [choice, setChoice] = useState<Choice>("both");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setSaving(true);
    try {
      // Always write user-default rows for both kinds. "Off" is represented
      // by status=muted so we never re-prompt. The evaluator skips muted
      // user-default rows entirely.
      const newsStatus = choice === "both" ? "active" : "muted";
      const earningsStatus = choice === "off" ? "muted" : "active";
      const [n, e] = await Promise.all([
        upsert({ kind: "news", symbol: null, status: newsStatus }),
        upsert({ kind: "earnings", symbol: null, status: earningsStatus }),
      ]);
      if ("error" in n) {
        setError(n.error);
        return;
      }
      if ("error" in e) {
        setError(e.error);
        return;
      }
      await markFirstTimeShown();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.sheet, { backgroundColor: colors.card }]}>
          <View style={[styles.handle, { backgroundColor: colors.border }]} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.foreground }]}>Stay in the loop</Text>
              <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
                Choose how often we ping you about news and earnings on your watchlist. You can
                fine-tune any of this later in Account → Notifications.
              </Text>
            </View>
          </View>

          <View style={{ gap: 10 }}>
            {OPTIONS.map((opt) => {
              const active = choice === opt.value;
              return (
                <TouchableOpacity
                  key={opt.value}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setChoice(opt.value);
                  }}
                  style={[
                    styles.option,
                    {
                      borderColor: active ? colors.primary : colors.border,
                      backgroundColor: active ? colors.primary + "12" : colors.secondary,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.optionIcon,
                      { backgroundColor: active ? colors.primary + "22" : colors.background },
                    ]}
                  >
                    <Feather
                      name={opt.icon}
                      size={18}
                      color={active ? colors.primary : colors.mutedForeground}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={[styles.optionTitle, { color: colors.foreground }]}>
                      {opt.title}
                    </Text>
                    <Text style={[styles.optionDesc, { color: colors.mutedForeground }]}>
                      {opt.description}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.radio,
                      {
                        borderColor: active ? colors.primary : colors.border,
                        backgroundColor: active ? colors.primary : "transparent",
                      },
                    ]}
                  >
                    {active && <Feather name="check" size={11} color={colors.primaryForeground} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {error && <Text style={[styles.error, { color: colors.negative }]}>{error}</Text>}

          <Pressable
            onPress={handleConfirm}
            disabled={saving}
            style={({ pressed }) => [
              styles.confirmBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.85 : 1 },
            ]}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[styles.confirmBtnText, { color: colors.primaryForeground }]}>
                Confirm
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === "ios" ? 34 : 20,
    paddingTop: 10,
  },
  handle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 14 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 6, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  optionIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  optionTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  optionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  radio: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 1.5,
    alignItems: "center", justifyContent: "center",
  },
  error: { fontSize: 13, fontFamily: "Inter_500Medium", marginTop: 12 },
  confirmBtn: {
    marginTop: 18,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  confirmBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
});
