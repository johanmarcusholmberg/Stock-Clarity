import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, StyleSheet, Text } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";
import { useOnline } from "@/lib/network";

const SLIDE_OUT_MS = 240;

/**
 * Banner that slides in from the top while the device is offline.
 *
 * Mounting strategy: when offline we render the banner immediately and
 * animate it in. When we go back online we animate it out, then unmount
 * the inner content after the slide-out completes. This keeps the slide
 * animations smooth AND ensures the "You're offline" text is fully gone
 * from the DOM (and screen-reader tree) once the transition is done.
 *
 * The banner sits BELOW any toasts (toasts use zIndex 9999, this uses
 * 998) so an offline-triggered toast still wins focus.
 */
export function OfflineBanner() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const online = useOnline();

  // `rendered` controls whether the inner View is in the tree at all.
  // It becomes true the instant we go offline, and stays true through
  // the slide-out animation when we come back online, then flips to
  // false so the alert text is no longer in the DOM.
  const [rendered, setRendered] = useState(!online);

  const translateY = useRef(new Animated.Value(online ? -80 : 0)).current;
  const opacity = useRef(new Animated.Value(online ? 0 : 1)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }

    if (!online) {
      // Going offline: ensure mounted, then animate in.
      setRendered(true);
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    // Going online: animate out, then unmount.
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: -80,
        duration: SLIDE_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: SLIDE_OUT_MS,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    hideTimer.current = setTimeout(() => {
      setRendered(false);
      hideTimer.current = null;
    }, SLIDE_OUT_MS + 20);

    return () => {
      if (hideTimer.current) {
        clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
  }, [online, translateY, opacity]);

  if (!rendered) return null;

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
