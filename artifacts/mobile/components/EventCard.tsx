import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { StockEvent } from "@/context/WatchlistContext";

interface Props {
  event: StockEvent;
}

const EVENT_TYPE_LABELS: Record<StockEvent["type"], string> = {
  earnings: "Earnings",
  analyst: "Analyst",
  price_move: "Price Move",
  news: "News",
  announcement: "Announcement",
};

const EVENT_TYPE_ICONS: Record<StockEvent["type"], string> = {
  earnings: "bar-chart-2",
  analyst: "star",
  price_move: "activity",
  news: "file-text",
  announcement: "bell",
};

export default function EventCard({ event }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const sentimentColor =
    event.sentiment === "positive"
      ? colors.positive
      : event.sentiment === "negative"
      ? colors.negative
      : colors.warning;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => setExpanded((v) => !v)}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.typeBadge, { backgroundColor: `${sentimentColor}22` }]}>
            <Feather name={EVENT_TYPE_ICONS[event.type] as any} size={11} color={sentimentColor} />
            <Text style={[styles.typeText, { color: sentimentColor }]}>{EVENT_TYPE_LABELS[event.type]}</Text>
          </View>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerText, { color: colors.primary }]}>{event.ticker}</Text>
          </View>
        </View>
        <Feather
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.mutedForeground}
        />
      </View>

      <Text style={[styles.title, { color: colors.foreground }]}>{event.title}</Text>

      {expanded && (
        <View style={styles.details}>
          <SectionBlock label="What happened" text={event.what} colors={colors} />
          <SectionBlock label="Why it may matter" text={event.why} colors={colors} />
          <SectionBlock label="How unusual is this" text={event.unusual} colors={colors} />
        </View>
      )}
    </TouchableOpacity>
  );
}

function SectionBlock({
  label,
  text,
  colors,
}: {
  label: string;
  text: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionLabel, { color: colors.primary }]}>{label}</Text>
      <Text style={[styles.sectionText, { color: colors.secondaryForeground }]}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  headerLeft: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  typeBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
    gap: 4,
  },
  typeText: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
  },
  tickerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 5,
  },
  tickerText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  details: {
    marginTop: 12,
    gap: 10,
  },
  section: {
    gap: 3,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  sectionText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
});
