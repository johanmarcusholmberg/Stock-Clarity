import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";
import { MessageSquareIcon } from "@/components/icons/StockIcons";
import { GrantRow } from "@/lib/adminApi";

interface Props {
  grants: GrantRow[];
  onExtend: (grant: GrantRow) => void;
  onRevoke: (grant: GrantRow) => void;
}

export function GrantsList({ grants, onExtend, onRevoke }: Props) {
  const colors = useColors();
  const now = Date.now();

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
    },
    sectionTitle: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      paddingHorizontal: 4,
      paddingBottom: 8,
    },
    empty: {
      color: colors.mutedForeground,
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      paddingVertical: 12,
    },
    row: {
      paddingHorizontal: 4,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    head: { flexDirection: "row", alignItems: "center", gap: 8 },
    tierBadge: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 8,
    },
    tierText: { fontSize: 11, fontFamily: "Inter_700Bold" },
    expiresText: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1 },
    warnText: { color: colors.warning, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    meta: { color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" },
    actions: { flexDirection: "row", gap: 6 },
    actionBtn: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      borderRadius: 8,
      borderWidth: 1,
      alignItems: "center",
    },
  });

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Active grants ({grants.length})</Text>
      {grants.length === 0 ? (
        <Text style={s.empty}>No active grants for this user.</Text>
      ) : (
        grants.map((g) => {
          const expires = new Date(g.expires_at);
          const msLeft = expires.getTime() - now;
          const daysLeft = Math.max(0, Math.ceil(msLeft / (24 * 60 * 60 * 1000)));
          const warning = daysLeft <= 3;
          const tint = g.tier === "premium" ? colors.warning : colors.primary;
          return (
            <View key={g.id} style={s.row}>
              <View style={s.head}>
                <View style={[s.tierBadge, { backgroundColor: tint + "22" }]}>
                  <Text style={[s.tierText, { color: tint }]}>{g.tier.toUpperCase()}</Text>
                </View>
                <Text style={s.expiresText} numberOfLines={1}>
                  Expires {expires.toLocaleDateString()}
                </Text>
                <Text style={warning ? s.warnText : s.meta}>
                  {daysLeft}d left
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                <View style={{ marginTop: 2 }}>
                  <MessageSquareIcon size={11} color={colors.mutedForeground} strokeWidth={2} />
                </View>
                <Text style={[s.meta, { flex: 1 }]} numberOfLines={2}>{g.reason}</Text>
              </View>
              <Text style={s.meta}>
                Granted by {g.granted_by_admin} · {new Date(g.created_at).toLocaleDateString()}
              </Text>
              <View style={s.actions}>
                <TouchableOpacity
                  onPress={() => onExtend(g)}
                  style={[s.actionBtn, { borderColor: colors.primary, backgroundColor: colors.primary + "14" }]}
                >
                  <Text style={{ color: colors.primary, fontSize: 12, fontFamily: "Inter_700Bold" }}>Extend</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onRevoke(g)}
                  style={[s.actionBtn, { borderColor: colors.destructive, backgroundColor: colors.destructive + "14" }]}
                >
                  <Text style={{ color: colors.destructive, fontSize: 12, fontFamily: "Inter_700Bold" }}>Revoke</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}
