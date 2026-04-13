import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { Stock } from "@/context/WatchlistContext";
import MiniChart from "./MiniChart";

interface Props {
  stock: Stock;
  showPercent?: boolean;
  editMode?: boolean;
  onRemove?: () => void;
}

export default function StockCard({ stock, showPercent = true, editMode = false, onRemove }: Props) {
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
    if (abs >= 10) return abs.toFixed(2);
    return abs.toFixed(2);
  };

  const shortTicker = stock.ticker.includes(".") ? stock.ticker.split(".")[0] : stock.ticker;

  const changeLabel = showPercent
    ? `${isPositive ? "+" : ""}${stock.changePercent.toFixed(2)}%`
    : `${isPositive ? "+" : "−"}${formatChange(stock.change)}`;

  return (
    <View style={{ position: "relative", marginBottom: 8 }}>
      <TouchableOpacity
        activeOpacity={editMode ? 1 : 0.75}
        style={[
          styles.card,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            marginBottom: 0,
            opacity: editMode ? 0.85 : 1,
          },
        ]}
        onPress={() => !editMode && router.push({ pathname: "/stock/[ticker]", params: { ticker: stock.ticker } })}
      >
        <View style={styles.left}>
          <View style={[styles.tickerBadge, { backgroundColor: colors.secondary }]}>
            <Text style={[styles.tickerText, { color: colors.primary }]}>{shortTicker}</Text>
            <Text style={styles.flagText}>{stock.exchangeFlag}</Text>
          </View>
          <View style={styles.nameRow}>
            <Text style={[styles.stockName, { color: colors.foreground }]} numberOfLines={1}>
              {stock.name}
            </Text>
            <Text style={[styles.sector, { color: colors.mutedForeground }]}>{stock.sector}</Text>
          </View>
        </View>

        {!editMode && (
          <View style={styles.center}>
            <MiniChart data={stock.priceHistory} color={changeColor} width={60} height={28} />
          </View>
        )}

        <View style={styles.right}>
          <Text style={[styles.price, { color: colors.foreground }]}>
            {stock.currency === "GBp" ? "p" : ""}{formatPrice(stock.price)}
          </Text>
          <View style={[styles.changeBadge, { backgroundColor: isPositive ? `${colors.positive}22` : `${colors.negative}22` }]}>
            <Feather name={isPositive ? "trending-up" : "trending-down"} size={10} color={changeColor} />
            <Text style={[styles.changeText, { color: changeColor }]}>
              {changeLabel}
            </Text>
          </View>
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
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, gap: 12,
  },
  left: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  tickerBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, minWidth: 52, alignItems: "center", gap: 2 },
  tickerText: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.5 },
  flagText: { fontSize: 10 },
  nameRow: { flex: 1, minWidth: 0 },
  stockName: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 1 },
  sector: { fontSize: 11, fontFamily: "Inter_400Regular" },
  center: { width: 60, alignItems: "center" },
  right: { alignItems: "flex-end", minWidth: 72 },
  price: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 4 },
  changeBadge: { flexDirection: "row", alignItems: "center", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, gap: 3 },
  changeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
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
