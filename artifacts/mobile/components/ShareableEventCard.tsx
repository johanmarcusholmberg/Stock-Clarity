import React, { forwardRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { StockEvent } from "@/services/stockApi";

// Branded image template captured by react-native-view-shot. This
// component is rendered offscreen at a fixed width (1080px-equivalent)
// and converted to a PNG, so styles here are intentionally explicit
// (no theme tokens, no dynamic sizing) — the rendered image must look
// the same on every device and in any theme.
//
// Layout target: 1080×1920 portrait, centered card. Background uses
// the StockClarify deep-navy brand colour for instant recognition in
// share feeds.

const BRAND_BG = "#0A1628";
const BRAND_PRIMARY = "#3B82F6";
const BRAND_ACCENT = "#F59E0B";
const TEXT = "#F8FAFC";
const MUTED = "#94A3B8";
const CARD_BG = "#0F1F38";
const CARD_BORDER = "#1E3252";

interface Props {
  event: StockEvent;
  stockName?: string;
}

const ShareableEventCard = forwardRef<View, Props>(({ event, stockName }, ref) => {
  const sentColor =
    event.sentiment === "positive" ? "#10B981" : event.sentiment === "negative" ? "#EF4444" : MUTED;

  return (
    <View ref={ref} collapsable={false} style={s.canvas}>
      <View style={s.brandRow}>
        <View style={s.logoMark}>
          <Text style={s.logoMarkText}>SC</Text>
        </View>
        <Text style={s.brandName}>StockClarify</Text>
      </View>

      <View style={s.tickerRow}>
        <View style={[s.tickerBadge, { backgroundColor: sentColor + "26" }]}>
          <Text style={[s.tickerText, { color: sentColor }]}>{event.ticker}</Text>
        </View>
        {stockName ? <Text style={s.stockName}>{stockName}</Text> : null}
      </View>

      <Text style={s.title} numberOfLines={4}>
        {event.title}
      </Text>

      <View style={s.divider} />

      {event.what ? (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: BRAND_PRIMARY }]}>WHAT HAPPENED</Text>
          <Text style={s.sectionText} numberOfLines={6}>{event.what}</Text>
        </View>
      ) : null}

      {event.why ? (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: BRAND_ACCENT }]}>WHY IT MATTERS</Text>
          <Text style={s.sectionText} numberOfLines={6}>{event.why}</Text>
        </View>
      ) : null}

      {event.unusual ? (
        <View style={s.section}>
          <Text style={[s.sectionLabel, { color: MUTED }]}>UNUSUAL</Text>
          <Text style={s.sectionText} numberOfLines={4}>{event.unusual}</Text>
        </View>
      ) : null}

      <View style={s.footer}>
        <Text style={s.footerText}>AI-summarised by StockClarify</Text>
      </View>
    </View>
  );
});

ShareableEventCard.displayName = "ShareableEventCard";

export default ShareableEventCard;

// Width chosen to render at 2x → 2160px on capture, which is well above the
// 1200px floor most social platforms use for sharp inline previews.
export const SHAREABLE_WIDTH = 540;

const s = StyleSheet.create({
  canvas: {
    width: SHAREABLE_WIDTH,
    backgroundColor: BRAND_BG,
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 28,
  },
  brandRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 28,
  },
  logoMark: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: BRAND_PRIMARY,
    alignItems: "center",
    justifyContent: "center",
  },
  logoMarkText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  brandName: {
    color: TEXT,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.2,
  },
  tickerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  tickerBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  tickerText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  stockName: {
    color: MUTED,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  title: {
    color: TEXT,
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    lineHeight: 28,
    marginBottom: 20,
  },
  divider: {
    height: 1,
    backgroundColor: CARD_BORDER,
    marginBottom: 20,
  },
  section: {
    backgroundColor: CARD_BG,
    borderColor: CARD_BORDER,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 6,
  },
  sectionText: {
    color: TEXT,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  footer: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: CARD_BORDER,
    alignItems: "center",
  },
  footerText: {
    color: MUTED,
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
  },
});
