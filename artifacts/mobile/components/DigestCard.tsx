import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { DigestEntry } from "@/context/WatchlistContext";

interface Props {
  entry: DigestEntry;
}

export default function DigestCard({ entry }: Props) {
  const colors = useColors();

  const sentimentColor =
    entry.sentiment === "positive"
      ? colors.positive
      : entry.sentiment === "negative"
      ? colors.negative
      : colors.warning;

  const sentimentIcon =
    entry.sentiment === "positive"
      ? "trending-up"
      : entry.sentiment === "negative"
      ? "trending-down"
      : "minus";

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: sentimentColor }]}
      onPress={() => router.push({ pathname: "/stock/[ticker]", params: { ticker: entry.ticker } })}
    >
      <View style={styles.top}>
        <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
          <Text style={[styles.tickerText, { color: colors.primary }]}>{entry.ticker}</Text>
        </View>
        <Feather name={sentimentIcon as any} size={14} color={sentimentColor} />
      </View>
      <Text style={[styles.summary, { color: colors.foreground }]} numberOfLines={3}>
        {entry.summary}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 3,
    marginBottom: 8,
    gap: 8,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  tickerBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 5,
  },
  tickerText: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  summary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
