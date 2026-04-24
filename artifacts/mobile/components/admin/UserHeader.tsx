import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { OverviewResponse, sourceLabel } from "@/lib/adminApi";

interface Props {
  overview: OverviewResponse;
}

export function UserHeader({ overview }: Props) {
  const colors = useColors();
  const { user, effectiveTier, resolvedSource, stripeSubscription } = overview;

  const tierColor =
    effectiveTier.tier === "premium"
      ? colors.warning
      : effectiveTier.tier === "pro"
        ? colors.primary
        : colors.mutedForeground;

  const createdAt = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—";
  const periodEnd =
    stripeSubscription?.current_period_end
      ? new Date(stripeSubscription.current_period_end * 1000).toLocaleDateString()
      : null;

  const s = StyleSheet.create({
    card: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      gap: 12,
    },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    email: { color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold", flex: 1 },
    tierBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 10,
      backgroundColor: tierColor + "22",
    },
    tierText: { color: tierColor, fontSize: 12, fontFamily: "Inter_700Bold" },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.secondary,
    },
    chipText: { color: colors.foreground, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    kv: { gap: 2 },
    k: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      textTransform: "uppercase",
      letterSpacing: 0.6,
    },
    v: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" },
    grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
    gridItem: { minWidth: 140, flex: 1 },
  });

  return (
    <View style={s.card}>
      <View style={s.row}>
        <Text style={s.email} numberOfLines={1}>
          {user.email}
        </Text>
        <View style={s.tierBadge}>
          <Text style={s.tierText}>{effectiveTier.tier.toUpperCase()}</Text>
        </View>
      </View>

      <View style={[s.row, { flexWrap: "wrap" }]}>
        <View style={s.chip}>
          <Feather name="credit-card" size={12} color={colors.mutedForeground} />
          <Text style={s.chipText}>{sourceLabel(resolvedSource.source)}</Text>
        </View>
        <View style={s.chip}>
          <Feather name="git-branch" size={12} color={colors.mutedForeground} />
          <Text style={s.chipText}>Effective via {effectiveTier.source}</Text>
        </View>
      </View>

      <View style={s.grid}>
        <View style={[s.kv, s.gridItem]}>
          <Text style={s.k}>User ID</Text>
          <Text style={s.v} numberOfLines={1}>
            {user.clerkUserId}
          </Text>
        </View>
        <View style={[s.kv, s.gridItem]}>
          <Text style={s.k}>Joined</Text>
          <Text style={s.v}>{createdAt}</Text>
        </View>
        {resolvedSource.stripeCustomerId ? (
          <View style={[s.kv, s.gridItem]}>
            <Text style={s.k}>Stripe customer</Text>
            <Text style={s.v} numberOfLines={1}>
              {resolvedSource.stripeCustomerId}
            </Text>
          </View>
        ) : null}
        {stripeSubscription ? (
          <View style={[s.kv, s.gridItem]}>
            <Text style={s.k}>Stripe sub</Text>
            <Text style={s.v}>
              {stripeSubscription.status}
              {stripeSubscription.cancel_at_period_end ? " · cancels at period end" : ""}
              {periodEnd ? ` · period ends ${periodEnd}` : ""}
            </Text>
          </View>
        ) : null}
        {resolvedSource.iapSource ? (
          <View style={[s.kv, s.gridItem]}>
            <Text style={s.k}>IAP</Text>
            <Text style={s.v}>
              {resolvedSource.iapSource}
              {resolvedSource.iapOriginalTransactionId ? ` · ${resolvedSource.iapOriginalTransactionId}` : ""}
            </Text>
          </View>
        ) : null}
        {effectiveTier.expiresAt ? (
          <View style={[s.kv, s.gridItem]}>
            <Text style={s.k}>Grant expiry</Text>
            <Text style={s.v}>{new Date(effectiveTier.expiresAt).toLocaleDateString()}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
