import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Alert, useWatchlist } from "@/context/WatchlistContext";

interface Props {
  alert: Alert;
}

const ALERT_ICONS: Record<Alert["type"], string> = {
  price_spike: "zap",
  volume_surge: "bar-chart",
  gap_up: "arrow-up-circle",
  gap_down: "arrow-down-circle",
  breakout: "trending-up",
};

export default function AlertCard({ alert }: Props) {
  const colors = useColors();
  const { markAlertRead } = useWatchlist();

  const isGapDown = alert.type === "gap_down";
  const isPositiveMove = alert.type === "gap_up" || alert.type === "breakout" || alert.type === "price_spike";

  const accentColor = isGapDown ? colors.negative : isPositiveMove ? colors.positive : colors.warning;

  const handlePress = () => {
    markAlertRead(alert.id);
    router.push({ pathname: "/stock/[ticker]", params: { ticker: alert.ticker } });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: alert.read ? 0.65 : 1,
        },
      ]}
      onPress={handlePress}
    >
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${accentColor}22` }]}>
          <Feather name={ALERT_ICONS[alert.type] as any} size={18} color={accentColor} />
        </View>
        <View style={styles.headerText}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, { color: colors.foreground }]}>{alert.title}</Text>
            {!alert.read && <View style={[styles.unreadDot, { backgroundColor: colors.primary }]} />}
          </View>
          <View style={styles.metaRow}>
            <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.tickerText, { color: colors.primary }]}>{alert.ticker}</Text>
            </View>
            <Text style={[styles.magnitude, { color: accentColor }]}>{alert.magnitude}</Text>
          </View>
        </View>
      </View>
      <Text style={[styles.explanation, { color: colors.secondaryForeground }]}>
        {alert.explanation}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  unreadDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  tickerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 5,
  },
  tickerText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  magnitude: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
  },
  explanation: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
