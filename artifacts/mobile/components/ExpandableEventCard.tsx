import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import type { StockEvent } from "@/services/stockApi";

/** Helper: returns true when the string looks like a valid HTTP(S) URL. */
function isValidUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface Props {
  event: StockEvent;
  /** Show ticker badge + stock name above the title (used by Digest page). */
  showTicker?: boolean;
  stockName?: string;
  canExpand?: boolean;
  summaryCount?: number;
  summaryLimit?: number;
  onNeedUpgrade?: () => void;
  onExpand?: () => void;
}

export default function ExpandableEventCard({
  event,
  showTicker = false,
  stockName,
  canExpand = true,
  summaryCount = 0,
  summaryLimit = 9999,
  onNeedUpgrade,
  onExpand,
}: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  const hasAI = !!(event.what || event.why || event.unusual);
  const date = new Date(event.timestamp).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const sentColor =
    event.sentiment === "positive"
      ? colors.positive
      : event.sentiment === "negative"
      ? colors.negative
      : colors.mutedForeground;

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!expanded && hasAI) {
      if (!canExpand) {
        onNeedUpgrade?.();
        return;
      }
      onExpand?.();
    }
    setExpanded((v) => !v);
  };

  const validUrl = isValidUrl(event.url);

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* Optional ticker badge row (Digest context) */}
      {showTicker && (
        <View style={s.tickerRow}>
          <View style={[s.tickerBadge, { backgroundColor: sentColor + "20" }]}>
            <Text style={[s.tickerText, { color: sentColor }]}>{event.ticker}</Text>
          </View>
          {stockName ? (
            <Text style={[s.stockNameText, { color: colors.mutedForeground }]}>{stockName}</Text>
          ) : null}
        </View>
      )}

      <View style={s.header}>
        <View style={[s.sentDot, { backgroundColor: sentColor }]} />
        <View style={s.headerText}>
          <Text style={[s.title, { color: colors.foreground }]} numberOfLines={expanded ? undefined : 2}>
            {event.title}
          </Text>
          <Text style={[s.meta, { color: colors.mutedForeground }]}>
            {event.publisher ? `${event.publisher} · ` : ""}
            {date}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 4 }}>
          {hasAI && !canExpand && !expanded && (
            <View style={[s.lockBadge, { backgroundColor: colors.warning + "22" }]}>
              <Feather name="lock" size={10} color={colors.warning} />
              <Text style={[s.lockText, { color: colors.warning }]}>PRO</Text>
            </View>
          )}
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </View>

      {/* Short summary preview (collapsed state) — a 2-line teaser of the AI
          'what happened' text so readers can gauge the story without expanding. */}
      {!expanded && event.what ? (
        <Text
          style={[s.summary, { color: colors.mutedForeground }]}
          numberOfLines={2}
        >
          {event.what}
        </Text>
      ) : null}

      {/* AI usage hint when not expanded */}
      {!expanded && hasAI && canExpand && summaryLimit < 9999 && (
        <Text style={[s.hint, { color: colors.mutedForeground }]}>
          Tap for AI analysis · {Math.max(0, summaryLimit - summaryCount)} summary
          {summaryLimit - summaryCount !== 1 ? "s" : ""} left for this stock
        </Text>
      )}

      {expanded && (
        <View style={s.body}>
          <View style={[s.divider, { backgroundColor: colors.border }]} />
          {event.what ? (
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: colors.primary }]}>WHAT HAPPENED</Text>
              <Text style={[s.sectionText, { color: colors.foreground }]}>{event.what}</Text>
            </View>
          ) : null}
          {event.why ? (
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: "#F59E0B" }]}>WHY IT MATTERS</Text>
              <Text style={[s.sectionText, { color: colors.foreground }]}>{event.why}</Text>
            </View>
          ) : null}
          {event.unusual ? (
            <View style={s.section}>
              <Text style={[s.sectionLabel, { color: colors.mutedForeground }]}>UNUSUAL</Text>
              <Text style={[s.sectionText, { color: colors.foreground }]}>{event.unusual}</Text>
            </View>
          ) : null}
          {validUrl ? (
            <TouchableOpacity
              style={[s.readMore, { borderColor: colors.border }]}
              onPress={() => Linking.openURL(event.url)}
            >
              <Feather name="external-link" size={12} color={colors.primary} />
              <Text style={[s.readMoreText, { color: colors.primary }]}>Read full article</Text>
            </TouchableOpacity>
          ) : (
            <View style={[s.readMore, { borderColor: colors.border }]}>
              <Feather name="alert-circle" size={12} color={colors.mutedForeground} />
              <Text style={[s.readMoreText, { color: colors.mutedForeground }]}>Article unavailable</Text>
            </View>
          )}
          {/* View stock CTA (only in digest context) */}
          {showTicker && (
            <TouchableOpacity
              style={[s.viewStockBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                router.push({ pathname: "/stock/[ticker]", params: { ticker: event.ticker } });
              }}
              activeOpacity={0.85}
            >
              <Text style={[s.viewStockText, { color: colors.primaryForeground }]}>
                View {event.ticker} Stock
              </Text>
              <Feather name="arrow-right" size={14} color={colors.primaryForeground} />
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, marginBottom: 8, overflow: "hidden" },
  tickerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12 },
  tickerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  tickerText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  stockNameText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  header: { flexDirection: "row", alignItems: "flex-start", padding: 14, gap: 10 },
  sentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  headerText: { flex: 1 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20, marginBottom: 4 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lockBadge: { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5 },
  lockText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  summary: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19, paddingHorizontal: 14, paddingBottom: 12, marginTop: -6 },
  hint: { fontSize: 11, fontFamily: "Inter_400Regular", paddingHorizontal: 14, paddingBottom: 10, marginTop: -4 },
  body: { paddingHorizontal: 14, paddingBottom: 14 },
  divider: { height: 1, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  sectionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  readMore: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, borderTopWidth: 1, marginTop: 4 },
  readMoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  viewStockBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7, paddingVertical: 12, borderRadius: 11, marginTop: 8 },
  viewStockText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
