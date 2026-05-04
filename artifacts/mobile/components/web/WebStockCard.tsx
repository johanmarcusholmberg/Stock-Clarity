// Watchlist grid card for the web home screen. Built independently of the
// native StockCard so the visual language can diverge — the native row is
// horizontal, this is a 4-row stacked layout with a left accent bar that
// signals direction without a colored badge.

import React from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useColors } from "@/hooks/useColors";
import MiniChart from "@/components/MiniChart";
import { Stock } from "@/context/WatchlistContext";
import { WebTokens } from "@/components/web/WebTokens";
import { WebHoverable } from "@/components/web/WebHoverable";
import { formatChangePctWeb, formatPriceWeb, formatTimeAgoWeb } from "@/components/web/webFormat";

interface WebStockCardProps {
  stock: Stock;
  chartData?: number[];
  /** When provided, used for the "Updated Xs ago" timestamp — ms since epoch. */
  updatedAt?: number;
}

const FLAG_BY_EXCHANGE: Record<string, string> = {
  NASDAQ: "🇺🇸",
  NYSE: "🇺🇸",
  ARCA: "🇺🇸",
  AMEX: "🇺🇸",
  STO: "🇸🇪",
  HEL: "🇫🇮",
  CPH: "🇩🇰",
  OSL: "🇳🇴",
  LSE: "🇬🇧",
  XETRA: "🇩🇪",
  EPA: "🇫🇷",
  TSX: "🇨🇦",
};

export function WebStockCard({ stock, chartData, updatedAt }: WebStockCardProps) {
  const colors = useColors();
  const isPositive = stock.change >= 0;
  const accent = isPositive ? colors.positive : colors.negative;
  const flag = stock.exchange ? FLAG_BY_EXCHANGE[stock.exchange] ?? "" : "";

  return (
    <WebHoverable
      onPress={() =>
        router.push({ pathname: "/stock/[ticker]", params: { ticker: stock.ticker } })
      }
      style={({ hovered }) => ({
        // @ts-ignore — web-only style props
        cursor: "pointer",
        // @ts-ignore
        transition: WebTokens.transition.base,
        // @ts-ignore
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        // @ts-ignore
        boxShadow: hovered ? WebTokens.shadow.md : WebTokens.shadow.sm,
      })}
    >
      {({ hovered }) => (
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: hovered ? `${colors.primary}80` : colors.border,
            borderRadius: 14,
            overflow: "hidden",
            // @ts-ignore
            transition: WebTokens.transition.base,
          }}
        >
          {/* Left accent bar — the primary direction signal */}
          <View
            style={{
              width: 4,
              backgroundColor: accent,
            }}
          />

          <View style={{ flex: 1, padding: 16 }}>
            {/* Row 1: ticker + name */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Text
                  style={{
                    color: colors.text,
                    fontFamily: WebTokens.fontData,
                    fontWeight: "700",
                    fontSize: 15,
                    letterSpacing: 0.4,
                  }}
                  numberOfLines={1}
                >
                  {stock.ticker}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flex: 1, justifyContent: "flex-end" }}>
                {flag ? (
                  <Text style={{ fontSize: 13 }} accessibilityElementsHidden>
                    {flag}
                  </Text>
                ) : null}
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.mutedForeground,
                    fontFamily: WebTokens.fontBody,
                    fontSize: 12,
                    flexShrink: 1,
                  }}
                >
                  {stock.name}
                </Text>
              </View>
            </View>

            {/* Row 2: price + change pill */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "baseline",
                justifyContent: "space-between",
                marginBottom: 10,
              }}
            >
              <Text
                style={{
                  color: colors.text,
                  fontFamily: WebTokens.fontData,
                  fontWeight: "700",
                  fontSize: 22,
                  letterSpacing: -0.2,
                }}
              >
                {formatPriceWeb(stock.price)}
              </Text>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 999,
                  backgroundColor: `${accent}26`,
                }}
              >
                <Text
                  style={{
                    color: accent,
                    fontFamily: WebTokens.fontData,
                    fontWeight: "500",
                    fontSize: 12,
                  }}
                >
                  {formatChangePctWeb(stock.changePercent)}
                </Text>
              </View>
            </View>

            {/* Row 3: full-width mini chart */}
            <View style={{ marginBottom: 10 }}>
              <MiniChart data={chartData} color={accent} width={280} height={48} />
            </View>

            {/* Row 4: currency + updated */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 11,
                  letterSpacing: 0.4,
                }}
              >
                {stock.currency || "USD"}
              </Text>
              <Text
                style={{
                  color: colors.mutedForeground,
                  fontFamily: WebTokens.fontBody,
                  fontSize: 11,
                }}
              >
                {updatedAt ? `Updated ${formatTimeAgoWeb(updatedAt)}` : "Live"}
              </Text>
            </View>
          </View>
        </View>
      )}
    </WebHoverable>
  );
}
