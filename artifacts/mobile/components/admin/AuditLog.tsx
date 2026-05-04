import React from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { StockIconRenderer } from "@/components/icons/StockIconRenderer";
import { useColors } from "@/hooks/useColors";
import { AuditRow } from "@/lib/adminApi";

interface Props {
  rows: AuditRow[];
  total: number;
  loading: boolean;
  onLoadMore: () => void;
}

const ACTION_ICON: Record<string, string> = {
  grant: "gift",
  extend: "clock",
  revoke: "x-octagon",
  cancel: "x-circle",
  refund: "refresh-ccw",
  tier_flip: "shuffle",
};

export function AuditLog({ rows, total, loading, onLoadMore }: Props) {
  const colors = useColors();

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
      flexDirection: "row",
      gap: 10,
      paddingHorizontal: 4,
      paddingVertical: 10,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    iconWrap: {
      width: 30,
      height: 30,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { flex: 1, gap: 2 },
    head: { flexDirection: "row", alignItems: "center", gap: 6 },
    action: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_600SemiBold", textTransform: "capitalize" },
    source: { color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" },
    time: { color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" },
    meta: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 16 },
    loadMore: {
      paddingVertical: 10,
      alignItems: "center",
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    loadMoreText: { color: colors.primary, fontSize: 13, fontFamily: "Inter_600SemiBold" },
  });

  const summarise = (row: AuditRow): string | null => {
    const prev = row.previous_state ?? {};
    const next = row.new_state ?? {};
    const prevTier = typeof (prev as any).tier === "string" ? (prev as any).tier : null;
    const nextTier = typeof (next as any).tier === "string" ? (next as any).tier : null;
    if (prevTier && nextTier && prevTier !== nextTier) {
      return `${prevTier.toUpperCase()} → ${nextTier.toUpperCase()}`;
    }
    if (row.reason) return row.reason;
    return null;
  };

  return (
    <View style={s.card}>
      <Text style={s.sectionTitle}>Audit log ({total})</Text>
      {rows.length === 0 && !loading ? (
        <Text style={s.empty}>No admin actions on this user yet.</Text>
      ) : null}
      {rows.map((row) => {
        const iconName = ACTION_ICON[row.action] ?? "activity";
        const tint =
          row.action === "revoke" || row.action === "cancel"
            ? colors.destructive
            : row.action === "refund"
              ? colors.warning
              : colors.primary;
        return (
          <View key={String(row.id)} style={s.row}>
            <View style={[s.iconWrap, { backgroundColor: tint + "22" }]}>
              <StockIconRenderer name={iconName} size={14} color={tint} />
            </View>
            <View style={s.body}>
              <View style={s.head}>
                <Text style={s.action}>{row.action.replace(/_/g, " ")}</Text>
                <Text style={s.source}>· {row.source}</Text>
                <View style={{ flex: 1 }} />
                <Text style={s.time}>{new Date(row.created_at).toLocaleString()}</Text>
              </View>
              <Text style={s.meta}>by {row.admin_email}</Text>
              {summarise(row) ? <Text style={s.meta}>{summarise(row)}</Text> : null}
            </View>
          </View>
        );
      })}
      {rows.length < total ? (
        <TouchableOpacity style={s.loadMore} onPress={onLoadMore} disabled={loading}>
          {loading ? (
            <ActivityIndicator color={colors.primary} size="small" />
          ) : (
            <Text style={s.loadMoreText}>Load more ({total - rows.length} remaining)</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </View>
  );
}
