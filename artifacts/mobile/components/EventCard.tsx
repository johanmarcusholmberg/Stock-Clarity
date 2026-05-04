import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { StockEvent } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { AIDisclaimer } from "@/components/Disclaimer";
import { CollapseIcon, ExpandIcon, LockIcon } from "@/components/icons/StockIcons";
import { StockIconRenderer } from "@/components/icons/StockIconRenderer";

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
  const [showPaywall, setShowPaywall] = useState(false);
  const { tier, canUseAIForStock, recordAIUsageForStock, summariesPerStockLimit } = useSubscription();

  const hasAISummary = !!(event.what || event.why || event.unusual);
  const canUseAI = canUseAIForStock(event.ticker);

  const sentimentColor =
    event.sentiment === "positive"
      ? colors.positive
      : event.sentiment === "negative"
      ? colors.negative
      : colors.warning;

  const handlePress = () => {
    if (!expanded && hasAISummary && !canUseAI) {
      setShowPaywall(true);
      return;
    }
    if (!expanded && hasAISummary) {
      recordAIUsageForStock(event.ticker);
    }
    setExpanded((v) => !v);
  };

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={handlePress}
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={[styles.typeBadge, { backgroundColor: `${sentimentColor}22` }]}>
              <StockIconRenderer name={EVENT_TYPE_ICONS[event.type]} size={11} color={sentimentColor} strokeWidth={2} />
              <Text style={[styles.typeText, { color: sentimentColor }]}>{EVENT_TYPE_LABELS[event.type]}</Text>
            </View>
            <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
              <Text style={[styles.tickerText, { color: colors.primary }]}>{event.ticker}</Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {hasAISummary && !canUseAI && tier === "free" && !expanded && (
              <View style={[styles.lockBadge, { backgroundColor: colors.warning + "22" }]}>
                <LockIcon size={10} color={colors.warning} strokeWidth={2} />
                <Text style={[styles.lockText, { color: colors.warning }]}>PRO</Text>
              </View>
            )}
            {expanded
              ? <CollapseIcon size={16} color={colors.mutedForeground} />
              : <ExpandIcon size={16} color={colors.mutedForeground} />}
          </View>
        </View>

        <Text style={[styles.title, { color: colors.foreground }]}>{event.title}</Text>

        {expanded && (
          <View style={styles.details}>
            <SectionBlock label="What happened" text={event.what} colors={colors} />
            <SectionBlock label="Why it may matter" text={event.why} colors={colors} />
            <SectionBlock label="How unusual is this" text={event.unusual} colors={colors} />
            <AIDisclaimer marginTop={4} />
          </View>
        )}

        {!expanded && hasAISummary && canUseAI && (
          <Text style={[styles.tapHint, { color: colors.mutedForeground }]}>
            Tap for AI analysis · {tier === "premium" ? "Unlimited" : `${summariesPerStockLimit} per stock`}
          </Text>
        )}
      </TouchableOpacity>

      <PaywallSheet
        visible={showPaywall}
        onClose={() => setShowPaywall(false)}
        triggerReason="ai_limit"
        currentTier={tier}
      />
    </>
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
  if (!text) return null;
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
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  lockText: {
    fontSize: 9,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 20,
  },
  tapHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 6,
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
