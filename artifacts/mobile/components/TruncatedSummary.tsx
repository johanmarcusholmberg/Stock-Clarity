import React from "react";
import { StyleProp, Text, TextStyle, View } from "react-native";

interface Props {
  text: string;
  lines?: number;
  fontSize?: number;
  lineHeight?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

// Shared 2-line summary truncation used by ExpandableEventCard and DigestCard.
// numberOfLines handles the common case on every platform; the View wrapper's
// maxHeight is a safety net for edge cases (dynamic font scaling, RN-web
// line-clamp quirks) so the card can never overflow into the footer below.
export default function TruncatedSummary({
  text,
  lines = 2,
  fontSize = 13,
  lineHeight = 19,
  color,
  style,
}: Props) {
  return (
    <View style={{ maxHeight: lineHeight * lines, overflow: "hidden" }}>
      <Text
        numberOfLines={lines}
        ellipsizeMode="tail"
        style={[
          { fontSize, lineHeight, fontFamily: "Inter_400Regular" },
          color ? { color } : null,
          style,
        ]}
      >
        {text}
      </Text>
    </View>
  );
}
