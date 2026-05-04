// Web home / watchlist screen — replaces the native single-column list with
// a header, folder strip, and 1–3 column responsive grid of WebStockCards.

import React, { useMemo, useState } from "react";
import { router } from "expo-router";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Polyline, Text as SvgText, Line, Circle } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import { useMiniCharts } from "@/hooks/useMiniCharts";
import { anyMarketOpenWithBuffer } from "@/utils/marketHours";
import { WebTokens } from "@/components/web/WebTokens";
import { WebStockCard } from "@/components/web/WebStockCard";
import { WebHoverable } from "@/components/web/WebHoverable";
import { AddIcon, SearchIcon } from "@/components/icons/StockIcons";
import { todayHumanWeb } from "@/components/web/webFormat";
import { FolderAddSheet } from "@/components/FolderAddSheet";

type Filter = "all" | "gainers" | "losers";

const DEFAULT_FOLDER_ID = "default";

function getGreeting(name: string): string {
  const n = name ? `, ${name}` : "";
  const hour = new Date().getHours();
  if (hour < 12) return `Good morning${n}`;
  if (hour < 17) return `Good afternoon${n}`;
  return `Good evening${n}`;
}

interface FolderTabProps {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}

function FolderTab({ label, count, active, onPress }: FolderTabProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 8,
            borderRadius: 999,
            backgroundColor: active ? colors.primary : hovered ? colors.muted : colors.card,
            borderWidth: 1,
            borderColor: active ? colors.primary : colors.border,
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <Text
            style={{
              color: active ? colors.primaryForeground : hovered ? colors.text : colors.mutedForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "500",
            }}
          >
            {label} ({count})
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

interface FilterPillProps {
  label: string;
  active: boolean;
  onPress: () => void;
}

function FilterPill({ label, active, onPress }: FilterPillProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 7,
            borderRadius: 999,
            backgroundColor: active ? colors.primary : "transparent",
            borderWidth: 1,
            borderColor: active ? colors.primary : hovered ? `${colors.primary}80` : colors.border,
            // @ts-ignore
            transition: WebTokens.transition.fast,
          }}
        >
          <Text
            style={{
              color: active ? colors.primaryForeground : colors.text,
              fontFamily: WebTokens.fontBody,
              fontSize: 12,
              fontWeight: "500",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  Icon?: (p: { size?: number; color?: string }) => React.ReactElement;
}

function PrimaryButton({ label, onPress, Icon }: PrimaryButtonProps) {
  const colors = useColors();
  return (
    <WebHoverable onPress={onPress}>
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            paddingHorizontal: 16,
            paddingVertical: 9,
            borderRadius: 10,
            backgroundColor: colors.primary,
            // @ts-ignore
            transition: WebTokens.transition.fast,
            // @ts-ignore
            transform: hovered ? "translateY(-1px)" : "translateY(0)",
          }}
        >
          {Icon ? <Icon size={16} color={colors.primaryForeground} /> : null}
          <Text
            style={{
              color: colors.primaryForeground,
              fontFamily: WebTokens.fontBody,
              fontSize: 13,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>
        </View>
      )}
    </WebHoverable>
  );
}

function EmptyWatchlistArt({ color }: { color: string }) {
  // Hand-crafted empty-state: a price line that ends in a question-mark
  // hooked Y-axis label.
  return (
    <Svg width={180} height={120} viewBox="0 0 180 120">
      <Line x1={20} y1={20} x2={20} y2={100} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={20} y1={100} x2={170} y2={100} stroke={color} strokeWidth={1.4} strokeLinecap="round" />
      <Polyline
        points="28,80 50,72 70,86 92,60 116,68 138,40 162,52"
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <SvgText x={6} y={55} fill={color} fontSize="14" fontFamily="serif">?</SvgText>
      <Circle cx={162} cy={52} r={2.5} fill={color} />
    </Svg>
  );
}

export default function WebHomeScreen() {
  const colors = useColors();
  const { width } = useWindowDimensions();
  const {
    watchlist,
    stocks,
    folders,
    activeFolderId,
    setActiveFolderId,
    displayName,
  } = useWatchlist();
  const [filter, setFilter] = useState<Filter>("all");
  const [addSheetVisible, setAddSheetVisible] = useState(false);

  const greeting = useMemo(() => getGreeting(displayName), [displayName]);
  const today = useMemo(() => todayHumanWeb(), []);

  const allWatched = watchlist.map((t) => stocks[t]).filter(Boolean);
  const watchlistExchanges = useMemo(
    () => allWatched.map((s) => s.exchange ?? "").filter(Boolean),
    [allWatched],
  );
  const watchlistAnyOpen = useMemo(
    () => anyMarketOpenWithBuffer(watchlistExchanges, 5),
    [watchlistExchanges],
  );
  const { charts: miniCharts } = useMiniCharts(watchlist, { autoRefresh: watchlistAnyOpen });

  const gainers = allWatched.filter((s) => s.changePercent >= 0);
  const losers = allWatched.filter((s) => s.changePercent < 0);
  const displayed = filter === "gainers" ? gainers : filter === "losers" ? losers : allWatched;

  const activeFolder = folders.find((f) => f.id === activeFolderId);
  const folderName = activeFolder?.name ?? "My Watchlist";

  // Responsive grid columns
  const cols = width >= 1380 ? 3 : width >= 1100 ? 3 : width >= 900 ? 2 : 1;
  const gap = 16;

  return (
    <View style={{ flex: 1 }}>
      {/* Page header */}
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
              fontSize: 24,
              letterSpacing: -0.2,
            }}
          >
            {greeting}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <FilterPill label="All" active={filter === "all"} onPress={() => setFilter("all")} />
            <FilterPill label="Gainers" active={filter === "gainers"} onPress={() => setFilter("gainers")} />
            <FilterPill label="Losers" active={filter === "losers"} onPress={() => setFilter("losers")} />
          </View>
          <PrimaryButton label="Add Stock" Icon={AddIcon} onPress={() => setAddSheetVisible(true)} />
        </View>
      </View>

      {/* Folder strip */}
      {folders.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 8, paddingBottom: 4 }}
          style={{ marginBottom: 20 }}
        >
          {folders.map((f) => (
            <FolderTab
              key={f.id}
              label={f.name}
              count={f.tickers.length}
              active={f.id === activeFolderId}
              onPress={() => setActiveFolderId(f.id)}
            />
          ))}
        </ScrollView>
      ) : null}

      {/* Section header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 16,
        }}
      >
        <Text
          style={{
            color: colors.text,
            fontFamily: WebTokens.fontDisplay,
            fontSize: 18,
          }}
        >
          {folderName}
        </Text>
        <Text style={{ color: colors.mutedForeground, fontFamily: WebTokens.fontBody, fontSize: 12 }}>
          {displayed.length} {displayed.length === 1 ? "stock" : "stocks"}
        </Text>
      </View>

      {/* Stock grid */}
      {displayed.length === 0 ? (
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
          <EmptyWatchlistArt color={colors.mutedForeground} />
          <Text
            style={{
              color: colors.text,
              fontFamily: WebTokens.fontDisplay,
              fontSize: 22,
              marginTop: 10,
            }}
          >
            Your watchlist is empty
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
            Search for any stock, ETF, or fund from world markets and add it here to start tracking
            it.
          </Text>
          <View style={{ marginTop: 8 }}>
            <PrimaryButton
              label="Search Stocks"
              Icon={SearchIcon}
              onPress={() => router.push("/(tabs)/search" as any)}
            />
          </View>
        </View>
      ) : (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            // @ts-ignore — web uses CSS gap
            gap,
          }}
        >
          {displayed.map((stock) => (
            <View
              key={stock.ticker}
              style={
                {
                  // calc() keeps the column math simple; not a valid RN type so cast to any.
                  width: cols === 1 ? "100%" : `calc((100% - ${gap * (cols - 1)}px) / ${cols})`,
                } as any
              }
            >
              <WebStockCard stock={stock} chartData={miniCharts[stock.ticker]} />
            </View>
          ))}
        </View>
      )}

      <FolderAddSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        folderId={activeFolderId}
        folderName={folderName}
      />
    </View>
  );
}
