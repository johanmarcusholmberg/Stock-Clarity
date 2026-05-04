// Web Digest screen — shows the same daily/weekly briefs but in a 2-column
// grid on desktop, with ticker group dividers and typography-driven tabs.

import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Path, Polyline, Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useDigest } from "@/context/DigestContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { type StockEvent } from "@/services/stockApi";
import ExpandableEventCard from "@/components/ExpandableEventCard";
import { PaywallSheet } from "@/components/PaywallSheet";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { FilterIcon } from "@/components/icons/StockIcons";
import { todayHumanWeb } from "@/components/web/webFormat";

type Tab = "daily" | "weekly";

function TypoTab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {() => (
        <View style={{ paddingVertical: 6, paddingHorizontal: 4, borderBottomWidth: 2, borderBottomColor: active ? colors.primary : "transparent" }}>
          <Text
            style={{
              color: active ? colors.text : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: active ? "600" : "400",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

function GhostButton({
  label,
  onPress,
  Icon,
  badge,
}: {
  label: string;
  onPress: () => void;
  Icon?: (p: { size?: number; color?: string }) => React.ReactElement;
  badge?: number;
}) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 12,
            paddingVertical: 7,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: hovered ? colors.primary : colors.border,
            backgroundColor: hovered ? colors.muted : "transparent",
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          {Icon ? <Icon size={14} color={hovered ? colors.primary : colors.text} /> : null}
          <Text
            style={{
              color: hovered ? colors.primary : colors.text,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            {label}
          </Text>
          {badge && badge > 0 ? (
            <View
              style={{
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 999,
                backgroundColor: colors.primary,
                marginLeft: 2,
              }}
            >
              <Text
                style={{
                  color: colors.primaryForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 10,
                  fontWeight: "700",
                }}
              >
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
      )}
    </WebHoverable>
  );
}

function EmptyDigestArt({ color }: { color: string }) {
  // Document outline with a small price line emerging from the top of the page.
  return (
    <Svg width={160} height={140} viewBox="0 0 160 140">
      <Rect x={36} y={28} width={88} height={104} rx={6} ry={6} fill="none" stroke={color} strokeWidth={1.5} />
      <Path d="M48 60 H112" stroke={color} strokeWidth={1.2} opacity={0.55} />
      <Path d="M48 76 H100" stroke={color} strokeWidth={1.2} opacity={0.55} />
      <Path d="M48 92 H108" stroke={color} strokeWidth={1.2} opacity={0.55} />
      <Path d="M48 108 H88" stroke={color} strokeWidth={1.2} opacity={0.55} />
      <Polyline
        points="44,40 60,30 76,38 96,18 116,28"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </Svg>
  );
}

interface TickerGroup {
  ticker: string;
  events: StockEvent[];
}

function groupByTicker(events: StockEvent[]): TickerGroup[] {
  const map = new Map<string, StockEvent[]>();
  for (const e of events) {
    if (!map.has(e.ticker)) map.set(e.ticker, []);
    map.get(e.ticker)!.push(e);
  }
  return Array.from(map.entries()).map(([ticker, list]) => ({ ticker, events: list }));
}

function GroupHeader({ ticker, count, name }: { ticker: string; count: number; name?: string }) {
  const colors = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 24,
        marginBottom: 12,
      }}
    >
      <View
        style={{
          paddingHorizontal: 8,
          paddingVertical: 3,
          borderRadius: 6,
          backgroundColor: colors.muted,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontData,
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.4,
          }}
        >
          {ticker}
        </Text>
      </View>
      {name ? (
        <Text
          style={{
            color: colors.mutedForeground,
            fontFamily: WebTokens.fontBody,
            fontSize: 13,
          }}
          numberOfLines={1}
        >
          {name}
        </Text>
      ) : null}
      <Text
        style={{
          color: colors.mutedForeground,
          fontFamily: WebTokens.fontBody,
          fontSize: 12,
        }}
      >
        {count} {count === 1 ? "event" : "events"}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.border, marginLeft: 4 }} />
    </View>
  );
}

export default function WebDigestScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const { stocks } = useWatchlist();
  const { tier } = useSubscription();
  const { dailyEntries, dailyLoading, weeklyEntries, weeklyLoading } = useDigest();
  const [tab, setTab] = useState<Tab>("daily");
  const [paywall, setPaywall] = useState<{ visible: boolean; reason: "ai_limit" | "stock_daily_limit" }>(
    { visible: false, reason: "ai_limit" },
  );

  const entries = tab === "daily" ? dailyEntries : weeklyEntries;
  const loading = tab === "daily" ? dailyLoading : weeklyLoading;
  const groups = useMemo(() => groupByTicker(entries), [entries]);

  const cols = width >= 1100 ? 2 : 1;
  const today = useMemo(() => todayHumanWeb(), []);

  return (
    <View style={{ flex: 1 }}>
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <View>
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontDisplay,
              fontSize: 28,
              letterSpacing: -0.4,
            }}
          >
            Digest
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              marginTop: 4,
            }}
          >
            {today}
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 18, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", gap: 18 }}>
            <TypoTab label="Daily" active={tab === "daily"} onPress={() => setTab("daily")} />
            <TypoTab label="Weekly" active={tab === "weekly"} onPress={() => setTab("weekly")} />
          </View>
          <GhostButton label="Filter" onPress={() => {}} Icon={FilterIcon} />
        </View>
      </View>

      {loading ? (
        <View style={{ paddingVertical: 60, alignItems: "center", gap: 12 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 13 }}>
            {tab === "daily" ? "Fetching today's headlines…" : "Fetching this week's highlights…"}
          </Text>
        </View>
      ) : groups.length === 0 ? (
        <View
          style={{
            alignItems: "center",
            paddingVertical: 56,
            paddingHorizontal: 24,
            gap: 12,
            borderWidth: 1,
            borderStyle: "dashed",
            borderColor: colors.border,
            borderRadius: 18,
            backgroundColor: colors.card,
          }}
        >
          <EmptyDigestArt color={colors.mutedForeground} />
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontDisplay,
              fontSize: 22,
              marginTop: 8,
            }}
          >
            Nothing to digest yet
          </Text>
          <Text
            style={{
              color: colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 14,
              maxWidth: 420,
              textAlign: "center",
              lineHeight: 21,
            }}
          >
            Add stocks to your watchlist to see daily summaries and weekly highlights here.
          </Text>
        </View>
      ) : (
        <View>
          {groups.map((g) => (
            <View key={g.ticker}>
              <GroupHeader ticker={g.ticker} count={g.events.length} name={stocks[g.ticker]?.name} />
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {g.events.map((event) => (
                  <View
                    key={event.id}
                    style={
                      {
                        width: cols === 1 ? "100%" : `calc(50% - 6px)`,
                      } as any
                    }
                  >
                    <ExpandableEventCard
                      event={event}
                      showTicker={false}
                      stockName={stocks[event.ticker]?.name ?? event.ticker}
                      onNeedUpgrade={(reason) => setPaywall({ visible: true, reason })}
                    />
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      )}

      <PaywallSheet
        visible={paywall.visible}
        onClose={() => setPaywall({ visible: false, reason: paywall.reason })}
        triggerReason={paywall.reason}
        currentTier={tier}
      />
    </View>
  );
}
