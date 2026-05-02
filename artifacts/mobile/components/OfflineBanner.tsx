import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useOnline } from "@/lib/network";

/**
 * Always-mounted banner that slides in from the top while the device is
 * offline. We keep it mounted (vs conditional render) so the slide-out
 * animation has time to complete before the view is removed.
 *
 * The banner sits BELOW any toasts (toasts use zIndex 9999, this uses 998)
 * so an offline-triggered toast like "Couldn't refresh" still wins focus.
 */
export function OfflineBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const online = useOnline();

  const translateY = useRef(new Animated.Value(-80)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: online ? -80 : 0,
        duration: 240,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: online ? 0 : 1,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [online, translateY, opacity]);

  const topOffset = Platform.OS === "web" ? 0 : insets.top;

  return (
    <Animated.View
      pointerEvents={online ? "none" : "auto"}
      style={[
        styles.wrapper,
        {
          paddingTop: topOffset,
          backgroundColor: colors.warning,
          opacity,
          transform: [{ translateY }],
        },
      ]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <Feather name="wifi-off" size={14} color="#FFFFFF" />
      <Text style={styles.text}>You're offline — showing saved data</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    zIndex: 998,
    elevation: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingBottom: 8,
    paddingHorizontal: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
  },
  text: {
    color: "#FFFFFF",
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
