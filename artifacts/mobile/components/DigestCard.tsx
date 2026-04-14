import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Animated } from "react-native";
import { useColors } from "@/hooks/useColors";
import { DigestEntry } from "@/context/WatchlistContext";

interface Props {
  entry: DigestEntry;
}

const SENTIMENT_ICON: Record<DigestEntry["sentiment"], string> = {
  positive: "trending-up",
  negative: "trending-down",
  neutral: "minus",
};

const SENTIMENT_LABEL: Record<DigestEntry["sentiment"], string> = {
  positive: "Positive",
  negative: "Negative",
  neutral: "Neutral",
};

export default function DigestCard({ entry }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const sentimentColor =
    entry.sentiment === "positive"
      ? colors.positive
      : entry.sentiment === "negative"
      ? colors.negative
      : colors.warning;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setExpanded((v) => !v);
  };

  const handleViewStock = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({ pathname: "/stock/[ticker]", params: { ticker: entry.ticker } });
  };

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, borderLeftColor: sentimentColor }]}
      onPress={handlePress}
    >
      {/* Header row */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <View style={[styles.tickerBadge, { backgroundColor: sentimentColor + "20" }]}>
            <Text style={[styles.tickerText, { color: sentimentColor }]}>{entry.ticker}</Text>
          </View>
          <Text style={[styles.stockName, { color: colors.mutedForeground }]}>{entry.stockName}</Text>
        </View>
        <View style={styles.headerRight}>
          <Feather name={SENTIMENT_ICON[entry.sentiment] as any} size={13} color={sentimentColor} />
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.mutedForeground} />
        </View>
      </View>

      {/* Summary — always visible */}
      <Text style={[styles.summary, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
        {entry.summary}
      </Text>

      {/* Expanded details */}
      {expanded && (
        <View style={styles.details}>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <DetailBlock
            icon="info"
            label="WHAT HAPPENED"
            text={entry.what}
            iconColor={colors.primary}
            colors={colors}
          />
          <DetailBlock
            icon="alert-circle"
            label="WHY IT MATTERS"
            text={entry.why}
            iconColor={colors.warning}
            colors={colors}
          />
          <DetailBlock
            icon="zap"
            label="WHAT'S UNUSUAL"
            text={entry.unusual}
            iconColor={colors.positive}
            colors={colors}
          />

          {/* View stock CTA */}
          <TouchableOpacity
            style={[styles.viewStockButton, { backgroundColor: colors.primary }]}
            onPress={handleViewStock}
            activeOpacity={0.85}
          >
            <Text style={[styles.viewStockText, { color: colors.primaryForeground }]}>
              View {entry.ticker} Stock
            </Text>
            <Feather name="arrow-right" size={14} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function DetailBlock({
  icon,
  label,
  text,
  iconColor,
  colors,
}: {
  icon: string;
  label: string;
  text: string;
  iconColor: string;
  colors: any;
}) {
  return (
    <View style={styles.detailBlock}>
      <View style={styles.detailLabelRow}>
        <Feather name={icon as any} size={11} color={iconColor} />
        <Text style={[styles.detailLabel, { color: iconColor }]}>{label}</Text>
      </View>
      <Text style={[styles.detailText, { color: colors.foreground }]}>{text}</Text>
    </View>
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
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
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
  stockName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  summary: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  details: {
    gap: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginBottom: 2,
  },
  detailBlock: {
    gap: 5,
  },
  detailLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  detailLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
  },
  detailText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  viewStockButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 11,
    marginTop: 4,
  },
  viewStockText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
