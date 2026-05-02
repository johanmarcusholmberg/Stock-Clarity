import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
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
import { useSubscription } from "@/context/SubscriptionContext";
import { computeEventBadge } from "@/utils/eventBadge";
import type { StockEvent } from "@/services/stockApi";
import TruncatedSummary from "./TruncatedSummary";
import ShareableEventCard from "./ShareableEventCard";
import { shareViewAsImage } from "@/utils/shareCard";
import { useToast } from "./Toast";

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

export type UpgradeReason = "stock_daily_limit" | "ai_limit";

interface Props {
  event: StockEvent;
  /** Show ticker badge + stock name above the title (used by Digest page). */
  showTicker?: boolean;
  stockName?: string;
  /**
   * External gate unrelated to AI quota — e.g. the Stock page's "3 stocks/day"
   * limit.  If false, tapping shows the paywall with `stock_daily_limit`.
   */
  canExpand?: boolean;
  /**
   * Called when the tap cannot proceed.  `stock_daily_limit` from the
   * external gate, `ai_limit` when the shared AI quota is exhausted.
   */
  onNeedUpgrade?: (reason: UpgradeReason) => void;
}

export default function ExpandableEventCard({
  event,
  showTicker = false,
  stockName,
  canExpand = true,
  onNeedUpgrade,
}: Props) {
  const colors = useColors();
  const { show: showToast } = useToast();
  const {
    tier,
    aiSummariesRemaining,
    aiSummariesUsedToday,
    aiSummariesLimit,
    hasExpandedEvent,
    recordEventExpansion,
  } = useSubscription();
  const [expanded, setExpanded] = useState(false);
  const [sharing, setSharing] = useState(false);
  // Offscreen ref used for view-shot capture. Mounted only when the card is
  // expanded — keeps the React tree slim for the (common) collapsed state.
  const shareRef = useRef<View>(null);
  const hasAI = !!(event.what || event.why || event.unusual);
  const alreadyExpanded = hasExpandedEvent(event.id);
  const isUnlimited = aiSummariesLimit === Infinity;
  const remainingDisplay = isUnlimited ? null : aiSummariesRemaining;
  const badge = computeEventBadge({
    tier,
    aiLimit: aiSummariesLimit,
    aiUsed: aiSummariesUsedToday,
    hasAI,
    expanded,
    alreadyExpanded,
    canExpand,
  });
  // Dim the card upfront when AI is unreachable so users see the state before
  // tapping. Doesn't apply to cached items or unlimited tiers.
  const isGatedUpfront =
    badge.kind === "used_up" ||
    (badge.kind === "upgrade" && !expanded && !alreadyExpanded);
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
        onNeedUpgrade?.("stock_daily_limit");
        return;
      }
      // Cached items are always free to reopen, regardless of quota state.
      if (!alreadyExpanded) {
        const result = recordEventExpansion(event.id);
        if (result.outOfQuota) {
          onNeedUpgrade?.("ai_limit");
          return;
        }
      }
    }
    LayoutAnimation.configureNext(EXPAND_ANIM);
    setExpanded((v) => !v);
  };

  const validUrl = isValidUrl(event.url);

  const handleShare = async () => {
    if (sharing) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSharing(true);
    try {
      const result = await shareViewAsImage(
        shareRef,
        `${event.ticker}: ${event.title}\n\nSummarised by StockClarify`,
      );
      // Surface non-cancellation failures so users aren't left guessing why
      // nothing happened. We treat anything containing "cancel" as the user's
      // own decision and stay silent.
      if (!result.shared && result.reason && !/cancel/i.test(result.reason)) {
        showToast("Couldn't prepare share image — please try again", { variant: "error" });
      }
    } finally {
      setSharing(false);
    }
  };

  // Footer: hidden for unlimited tier; otherwise shows one of three states.
  const showFooter = !expanded && hasAI && !isUnlimited;
  const footerState: "cached" | "available" | "used_up" = alreadyExpanded
    ? "cached"
    : (remainingDisplay ?? 0) > 0
    ? "available"
    : "used_up";

  return (
    <TouchableOpacity
      style={[
        s.card,
        { backgroundColor: colors.card, borderColor: colors.border },
        // Dim the card a touch when AI content is unreachable — sets the
        // expectation before the user taps. Paywall still opens if they do.
        isGatedUpfront && { opacity: 0.72 },
      ]}
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
          {badge.kind === "upgrade" && (
            <View style={[s.lockBadge, { backgroundColor: colors.warning + "22" }]}>
              <Feather name="lock" size={10} color={colors.warning} />
              <Text style={[s.lockText, { color: colors.warning }]}>{badge.label}</Text>
            </View>
          )}
          {badge.kind === "used_up" && (
            <View style={[s.lockBadge, { backgroundColor: colors.warning + "22" }]}>
              <Feather name="zap-off" size={10} color={colors.warning} />
              <Text style={[s.lockText, { color: colors.warning }]}>{badge.label}</Text>
            </View>
          )}
          {badge.kind === "quota_low" && (
            <View style={[s.lockBadge, { backgroundColor: colors.primary + "18" }]}>
              <Feather name="zap" size={10} color={colors.primary} />
              <Text style={[s.lockText, { color: colors.primary }]}>{badge.label}</Text>
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
          <View style={s.actionRow}>
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
            {hasAI && (
              <TouchableOpacity
                style={[s.shareBtn, { borderColor: colors.border }]}
                onPress={handleShare}
                disabled={sharing}
                activeOpacity={0.7}
                accessibilityLabel="Share this insight"
              >
                <Feather
                  name={sharing ? "loader" : "share-2"}
                  size={12}
                  color={colors.primary}
                />
                <Text style={[s.shareBtnText, { color: colors.primary }]}>
                  {sharing ? "Preparing…" : "Share"}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Offscreen render target for view-shot. Positioned far off-screen
              so it never affects layout but is still painted and capturable.
              `pointerEvents=none` keeps it inert; `collapsable=false` (set
              inside ShareableEventCard) ensures Android renders a real view. */}
          <View pointerEvents="none" style={s.offscreen} accessibilityElementsHidden>
            <ShareableEventCard ref={shareRef} event={event} stockName={stockName} />
          </View>
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

      {/* ── Footer: one of three states ── */}
      {showFooter && (
        <View style={[s.footer, { borderTopColor: colors.border }]}>
          {footerState === "cached" ? (
            <Text style={[s.footerText, { color: colors.positive }]} numberOfLines={1}>
              Generated · tap to view
            </Text>
          ) : footerState === "available" ? (
            <Text style={[s.footerText, { color: colors.mutedForeground }]} numberOfLines={1}>
              Tap for AI analysis · {remainingDisplay} summary
              {remainingDisplay !== 1 ? "s" : ""} left today
            </Text>
          ) : (
            <Text style={[s.footerText, { color: colors.warning }]} numberOfLines={1}>
              Daily AI summaries used up — resets tomorrow
            </Text>
          )}
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
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: "transparent",
    marginTop: 4,
    gap: 12,
  },
  readMore: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    flexShrink: 1,
  },
  readMoreText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  shareBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  offscreen: {
    position: "absolute",
    left: -10000,
    top: 0,
    opacity: 0,
  },
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
