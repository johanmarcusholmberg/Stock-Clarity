import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  ticker: string;
}

export default function TickerBadge({ ticker }: Props) {
  const colors = useColors();

  return (
    <View style={[styles.badge, { backgroundColor: colors.secondary }]}>
      <Text
        style={[styles.ticker, { color: colors.primary }]}
        numberOfLines={1}
      >
        {ticker}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    width: 48,
    height: 48,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  ticker: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.3,
    textAlign: "center",
  },
});
