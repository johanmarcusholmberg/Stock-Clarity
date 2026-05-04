// Render-prop wrapper that exposes hover state on web.
// On native, hovered is always false and the listeners are no-ops, so any
// existing screen that wraps content with WebHoverable degrades gracefully.

import React, { useState } from "react";
import { Platform, Pressable, PressableProps, ViewStyle } from "react-native";

interface WebHoverableProps extends Omit<PressableProps, "children" | "style"> {
  children: (state: { hovered: boolean }) => React.ReactNode;
  style?: ViewStyle | ((state: { hovered: boolean }) => ViewStyle);
}

export function WebHoverable({ children, style, ...rest }: WebHoverableProps) {
  const [hovered, setHovered] = useState(false);
  const isWeb = Platform.OS === "web";
  const flatStyle = typeof style === "function" ? style({ hovered }) : style;

  return (
    <Pressable
      {...rest}
      onHoverIn={isWeb ? () => setHovered(true) : undefined}
      onHoverOut={isWeb ? () => setHovered(false) : undefined}
      style={flatStyle}
    >
      {children({ hovered: isWeb ? hovered : false })}
    </Pressable>
  );
}
