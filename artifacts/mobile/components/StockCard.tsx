import { router } from "expo-router";
import { CloseIcon } from "@/components/icons/StockIcons";
import React from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Stock } from "@/context/WatchlistContext";
import MiniChart from "./MiniChart";

interface Props {
  stock: Stock;
  /** Real 1Y chart data from useMiniCharts (separate from quote data on stock object). */
  chartData?: number[];
  /**
   * Toggle between % and $ display for the change label.
   * The underlying stock.change and stock.changePercent always reflect 1D change
   * (sourced from refreshQuotes), not the mini-chart's 1Y range.
   */
  showPercent?: boolean;
  editMode?: boolean;
  onRemove?: () => void;
  drag?: () => void;
  isActive?: boolean;
}

// Compares only props that affect visual output.  Callback references (drag,
// onRemove) change every render inside DraggableFlatList's renderItem — ignoring
// them lets React skip re-rendering rows whose visible data hasn't changed.
// This prevents cascading redraws when individual mini-chart queries resolve.
function arePropsEqual(prev: Props, next: Props): boolean {
  return (
    prev.stock.ticker === next.stock.ticker &&
    prev.stock.price === next.stock.price &&
    prev.stock.change === next.stock.change &&
    prev.stock.changePercent === next.stock.changePercent &&
    prev.stock.name === next.stock.name &&
    prev.stock.currency === next.stock.currency &&
    prev.chartData === next.chartData &&
    prev.showPercent === next.showPercent &&
    prev.editMode === next.editMode &&
    prev.isActive === next.isActive
  );
}

function StockCardInner({ stock, chartData, showPercent = true, editMode = false, onRemove, drag, isActive = false }: Props) {
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
        {/* Left: ticker + company name */}
        <View style={styles.left}>
          <Text style={[styles.tickerLabel, { color: colors.foreground }]} numberOfLines={1}>
            {shortTicker}
          </Text>
          <Text style={[styles.companyName, { color: colors.mutedForeground }]} numberOfLines={1}>
            {stock.name}
          </Text>
        </View>

        {/* Center: sparkline — uses 1Y chart data; color is based on 1D change */}
        {!editMode && (
          <View style={styles.chartContainer}>
            <MiniChart data={chartData} color={changeColor} width={56} height={28} />
          </View>
        )}

        {/* Right: price + currency + change */}
        <View style={styles.right}>
          <View style={styles.priceRow}>
            <Text style={[styles.price, { color: colors.foreground }]}>
              {formatPrice(stock.price)}
            </Text>
            <Text style={[styles.currencyLabel, { color: colors.mutedForeground }]}>
              {stock.currency}
            </Text>
          </View>
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
          accessibilityLabel="Remove stock"
        >
          <CloseIcon size={13} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}

const StockCard = React.memo(StockCardInner, arePropsEqual);
export default StockCard;

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
  /* Left section: ticker + company name */
  left: {
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
  priceRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 4,
  },
  price: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    fontVariant: ["tabular-nums"],
    marginBottom: 2,
  },
  currencyLabel: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
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
    top: -8,
    right: -8,
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
});
