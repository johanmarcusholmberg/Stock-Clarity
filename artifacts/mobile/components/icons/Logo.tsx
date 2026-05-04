// ─── PLACEHOLDER LOGOTYPE ────────────────────────────────────────────────────
// Replace the SVG mark and wordmark below with the final brand assets
// once they are ready. This component is the single import used everywhere:
//   - WebShell sidebar (desktop)
//   - Top navbar (mobile web)
//   - Slide-in drawer (mobile web)
//   - Future: landing/marketing page
// To swap in a real image asset, replace the Svg block with:
//   <Image source={require('@/assets/images/logo.png')} style={{ width, height }} />
// ─────────────────────────────────────────────────────────────────────────────

import React from "react";
import { Text, View } from "react-native";
import Svg, { Polyline, Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";
import { WebTokens } from "@/components/web/WebTokens";

interface LogoProps {
  size?: number;
  showWordmark?: boolean;
  color?: string;
}

export function Logo({ size = 32, showWordmark = true, color }: LogoProps) {
  const colors = useColors();
  const wordmarkText = color ?? colors.text;
  const markFill = colors.card;
  const stroke = colors.primary;

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
      <Svg width={size} height={size} viewBox="0 0 32 32">
        <Rect
          x={1}
          y={1}
          width={30}
          height={30}
          rx={7}
          ry={7}
          fill={markFill}
          stroke={stroke}
          strokeWidth={1.5}
        />
        <Polyline
          points="6,22 13,16 19,19 26,9"
          fill="none"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
      {showWordmark ? (
        <Text
          accessibilityRole="header"
          style={{
            fontFamily: WebTokens.fontDisplay,
            fontSize: Math.round(size * 0.6),
            letterSpacing: -0.5,
            includeFontPadding: false,
          }}
        >
          <Text style={{ color: wordmarkText }}>Stock</Text>
          <Text style={{ color: colors.primary }}>Clarity</Text>
        </Text>
      ) : null}
    </View>
  );
}

export default Logo;
