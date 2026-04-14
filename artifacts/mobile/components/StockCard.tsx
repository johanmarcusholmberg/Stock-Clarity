import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Stock } from "@/context/WatchlistContext";
import MiniChart from "./MiniChart";
import TickerBadge from "./TickerBadge";

interface Props {
  stock: Stock;
  showPercent?: boolean;
  editMode?: boolean;
  onRemove?: () => void;
  drag?: () => void;
  isActive?: boolean;
}

export default function StockCard({ stock, showPercent = true, editMode = false, onRemove, drag, isActive = false }: Props) {
  const colors = useColors();
  const isPositive = stock.change >= 0;
  const changeColor = isPositive ? colors.positive : colors.negative;

  const formatPrice = (price: number) => {
    if (price >= 10000) return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    if (price >= 1000) return price.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const formatChange = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000) return abs.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    return abs.toFixed(2);
  };

  const shortTicker = stock.ticker.includes(".") ? stock.ticker.split(".")[0] : stock.ticker;

  const changeLabel = showPercent
    ? `${isPositive ? "+" : ""}${stock.changePercent.toFixed(2)}%`
    : `${isPositive ? "+" : "\u2212"}${formatChange(stock.change)}`;

  return (
    <View
      style={[
        { position: "relative", marginBottom: 8 },
        isActive && styles.activeWrapper,
      ]}
    >
      <TouchableOpacity
        activeOpacity={editMode ? 1 : 0.75}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: isActive ? colors.primary : colors.border,
            opacity: editMode ? 0.85 : 1,
          },
          isActive && styles.activeCard,
        ]}
        onPress={() => !editMode && router.push({ pathname: "/stock/[ticker]", params: { ticker: stock.ticker } })}
        onLongPress={drag}
        delayLongPress={200}
        disabled={isActive}
      >
        {/* Left: badge + identity */}
        <View style={styles.left}>
          <TickerBadge ticker={shortTicker} />
          <View style={styles.identity}>
            <Text style={[styles.tickerLabel, { color: colors.foreground }]} numberOfLines={1}>
              {shortTicker}
            </Text>
            <Text style={[styles.companyName, { color: colors.mutedForeground }]} numberOfLines={1}>
              {stock.name}
            </Text>
          </View>
        </View>

        {/* Center: sparkline */}
        {!editMode && (
          <View style={styles.chartContainer}>
            <MiniChart data={stock.priceHistory} color={changeColor} width={56} height={28} />
          </View>
        )}

        {/* Right: price + change */}
        <View style={styles.right}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            {stock.currency === "GBp" ? "p" : ""}{formatPrice(stock.price)}
          </Text>
          <Text style={[styles.change, { color: changeColor }]}>
            {changeLabel}
          </Text>
        </View>
      </TouchableOpacity>

      {editMode && (
        <TouchableOpacity
          style={[styles.removeBtn, { backgroundColor: colors.negative }]}
          onPress={onRemove}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Feather name="x" size={13} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  /* Left section: badge + identity block */
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  },
  identity: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  tickerLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.2,
  },
  companyName: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  /* Center: sparkline chart */
  chartContainer: {
    width: 56,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  /* Right section: price + change */
  right: {
    alignItems: "flex-end",
    minWidth: 74,
  },
  price: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
    marginBottom: 2,
  },
  change: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    fontVariant: ["tabular-nums"],
  },
  /* Active drag state */
  activeWrapper: {
    zIndex: 999,
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.18,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
      default: {},
    }),
  },
  activeCard: {
    transform: [{ scale: 1.03 }],
  },
  /* Edit mode remove button */
  removeBtn: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
