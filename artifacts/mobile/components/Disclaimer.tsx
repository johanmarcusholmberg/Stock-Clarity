import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { AI_DISCLAIMER_TEXT, DATA_DISCLAIMER_TEXT } from "./disclaimerStrings";

// Single source of truth for the legal/regulatory micro-copy that has to
// appear on every AI-generated insight and every screen that shows market
// data. The strings live in `disclaimerStrings.ts` (no React deps) so the
// unit test can pin them without pulling in React Native.

export { AI_DISCLAIMER_TEXT, DATA_DISCLAIMER_TEXT };

interface Props {
  /** Optional left/right padding to align with the parent's content gutters. */
  paddingHorizontal?: number;
  /** Vertical spacing above the disclaimer. */
  marginTop?: number;
  /** Vertical spacing below the disclaimer. */
  marginBottom?: number;
}

/** Footer line for any UI that surfaces AI-generated content. */
export function AIDisclaimer({ paddingHorizontal = 0, marginTop = 6, marginBottom = 0 }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { paddingHorizontal, marginTop, marginBottom }]}>
      <Text style={[styles.text, { color: colors.mutedForeground }]}>{AI_DISCLAIMER_TEXT}</Text>
    </View>
  );
}

/** Footer line for any screen that shows market data sourced from Yahoo. */
export function DataDisclaimer({ paddingHorizontal = 16, marginTop = 18, marginBottom = 24 }: Props) {
  const colors = useColors();
  return (
    <View style={[styles.wrap, { paddingHorizontal, marginTop, marginBottom }]}>
      <Text style={[styles.text, { color: colors.mutedForeground, textAlign: "center" }]}>
        {DATA_DISCLAIMER_TEXT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {},
  text: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
  },
});
