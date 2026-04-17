import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState } from "react";
import {
  LayoutAnimation,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import type { StockEvent } from "@/services/stockApi";
import TruncatedSummary from "./TruncatedSummary";

// LayoutAnimation needs one-time opt-in on Android.
if (
  Platform.OS === "android" &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// ~220ms ease-out expansion — fast enough to feel responsive, slow enough to
// make the height change legible so neighbouring cards don't appear to jump.
const EXPAND_ANIM = LayoutAnimation.create(
  220,
  LayoutAnimation.Types.easeOut,
  LayoutAnimation.Properties.opacity,
);

const SUMMARY_LINES = 3;

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
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setExpanded((v) => !v);
  };

  const validUrl = isValidUrl(event.url);
  const summariesLeft = Math.max(0, summaryLimit - summaryCount);
  const showFooter = !expanded && hasAI && canExpand && summaryLimit < 9999;

  return (
    <TouchableOpacity
      style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={handlePress}
      activeOpacity={0.8}
    >
      {/* ── Optional ticker badge row (Digest context) ── */}
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

      {/* ── Header: sentiment dot · title/meta · chevron ── */}
      <View style={s.header}>
        <View style={[s.sentDot, { backgroundColor: sentColor }]} />
        <View style={s.headerText}>
          <Text
            style={[s.title, { color: colors.foreground }]}
            numberOfLines={expanded ? undefined : 2}
          >
            {event.title}
          </Text>
          <Text style={[s.meta, { color: colors.mutedForeground }]}>
            {event.publisher ? `${event.publisher} · ` : ""}
            {date}
          </Text>
        </View>
        <View style={s.headerRight}>
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

      {/* ── Body: 3-line clamped summary (collapsed) or full AI sections (expanded) ── */}
      {!expanded && event.what ? (
        <View style={s.body}>
          <TruncatedSummary
            text={event.what}
            lines={SUMMARY_LINES}
            color={colors.mutedForeground}
          />
        </View>
      ) : null}

      {expanded && (
        <View style={s.bodyExpanded}>
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

      {/* ── Footer: CTA + counter on its own row with a subtle top border.
             Separate row means the 3-line summary above can never overlap
             with this text. ── */}
      {showFooter && (
        <View style={[s.footer, { borderTopColor: colors.border }]}>
          <Text style={[s.footerText, { color: colors.mutedForeground }]} numberOfLines={1}>
            Tap for AI analysis · {summariesLeft} summary
            {summariesLeft !== 1 ? "s" : ""} left for this stock
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
    // Explicit column flow so the header/body/footer stack vertically with
    // no risk of overlap from absolute positioning.
    flexDirection: "column",
  },
  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  tickerBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 5 },
  tickerText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  stockNameText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 10,
    gap: 10,
  },
  sentDot: { width: 8, height: 8, borderRadius: 4, marginTop: 5, flexShrink: 0 },
  headerText: { flex: 1 },
  headerRight: { alignItems: "flex-end", gap: 4 },
  title: { fontSize: 14, fontFamily: "Inter_600SemiBold", lineHeight: 20, marginBottom: 4 },
  meta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  lockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 5,
  },
  lockText: { fontSize: 9, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  bodyExpanded: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  footer: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  divider: { height: 1, marginBottom: 12 },
  section: { marginBottom: 12 },
  sectionLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, marginBottom: 4 },
  sectionText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    borderTopWidth: 1,
    marginTop: 4,
  },
  readMoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  viewStockBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingVertical: 12,
    borderRadius: 11,
    marginTop: 8,
  },
  viewStockText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
