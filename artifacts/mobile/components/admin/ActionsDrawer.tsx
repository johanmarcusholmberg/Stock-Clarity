import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { SubscriptionSource } from "@/lib/adminApi";

export type AdminAction = "grant" | "cancel" | "refund";

interface Props {
  source: SubscriptionSource;
  onAction: (action: AdminAction) => void;
}

interface ActionSpec {
  key: AdminAction;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  tintKey: "primary" | "destructive" | "warning";
  disabledReason: string | null;
}

/**
 * Decides which actions are available for a given resolved source.
 * Disabled buttons render the reason inline below so the admin knows why.
 * The backend enforces the same rules — this gate is cosmetic only.
 */
function specsFor(source: SubscriptionSource): ActionSpec[] {
  const noSubReason =
    source === "none"
      ? "User has no subscription — nothing to cancel or refund."
      : "User has no Stripe/IAP subscription — nothing to cancel or refund.";

  const grant: ActionSpec = {
    key: "grant",
    label: "Grant tier",
    icon: "gift",
    tintKey: "primary",
    disabledReason: null,
  };

  if (source === "stripe") {
    return [
      grant,
      { key: "cancel", label: "Cancel Stripe subscription", icon: "x-circle", tintKey: "destructive", disabledReason: null },
      { key: "refund", label: "Refund latest Stripe charge", icon: "refresh-ccw", tintKey: "warning", disabledReason: null },
    ];
  }

  if (source === "apple_iap") {
    return [
      grant,
      { key: "cancel", label: "Send cancellation instructions", icon: "x-circle", tintKey: "destructive", disabledReason: null },
      { key: "refund", label: "Record Apple refund request", icon: "refresh-ccw", tintKey: "warning", disabledReason: null },
    ];
  }

  if (source === "google_play") {
    return [
      grant,
      { key: "cancel", label: "Cancel Google Play subscription", icon: "x-circle", tintKey: "destructive", disabledReason: null },
      { key: "refund", label: "Record Google Play refund", icon: "refresh-ccw", tintKey: "warning", disabledReason: null },
    ];
  }

  // 'manual' or 'none' — grant is always available, cancel/refund disabled.
  return [
    grant,
    { key: "cancel", label: "Cancel subscription", icon: "x-circle", tintKey: "destructive", disabledReason: noSubReason },
    { key: "refund", label: "Refund charge", icon: "refresh-ccw", tintKey: "warning", disabledReason: noSubReason },
  ];
}

export function ActionsDrawer({ source, onAction }: Props) {
  const colors = useColors();
  const specs = specsFor(source);

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
      gap: 8,
    },
    row: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 10,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    rowBody: { flex: 1 },
    rowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
    rowReason: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      marginTop: 2,
    },
    sectionTitle: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 4,
    },
  });

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Actions</Text>
      {specs.map((spec) => {
        const tint =
          spec.tintKey === "destructive"
            ? colors.destructive
            : spec.tintKey === "warning"
              ? colors.warning
              : colors.primary;
        const disabled = spec.disabledReason !== null;
        return (
          <TouchableOpacity
            key={spec.key}
            onPress={() => !disabled && onAction(spec.key)}
            disabled={disabled}
            style={[
              s.row,
              {
                backgroundColor: disabled ? colors.secondary : tint + "14",
                opacity: disabled ? 0.55 : 1,
              },
            ]}
          >
            <Feather name={spec.icon} size={18} color={disabled ? colors.mutedForeground : tint} />
            <View style={s.rowBody}>
              <Text style={[s.rowLabel, { color: disabled ? colors.mutedForeground : tint }]}>{spec.label}</Text>
              {disabled ? <Text style={s.rowReason}>{spec.disabledReason}</Text> : null}
            </View>
            {!disabled ? (
              <Feather name="chevron-right" size={16} color={tint} />
            ) : null}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
