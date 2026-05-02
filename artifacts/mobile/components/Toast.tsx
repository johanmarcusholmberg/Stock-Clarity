import { Feather } from "@expo/vector-icons";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useColors } from "@/hooks/useColors";

/**
 * Lightweight in-house toast.
 *
 * Why not a library:
 *   - One more native dep means one more thing to break in EAS builds.
 *   - The visual we want (top banner, themed, auto-dismiss, single slot)
 *     is ~80 lines and doesn't earn the dep cost.
 *
 * API:
 *   const { show } = useToast();
 *   show("Couldn't refresh — check your connection");
 *   show("Saved", { variant: "success" });
 *   show("Update failed", { variant: "error", duration: 5000 });
 *
 * Single-slot policy: a new toast replaces the current one. This matches
 * iOS HIG / Material guidance — stacking toasts confuses users and forces
 * them to wait through banners they don't care about.
 */

type ToastVariant = "info" | "success" | "error" | "warning";

interface ToastOptions {
  variant?: ToastVariant;
  /** Milliseconds. Defaults: 2500 success/info, 4000 error/warning. */
  duration?: number;
}

interface ToastContextValue {
  show: (message: string, options?: ToastOptions) => void;
  hide: () => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Defensive: in non-app contexts (tests, isolated previews) we still
    // want consumers to no-op rather than crash.
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.warn("useToast() called outside <ToastProvider>");
    }
    return { show: () => {}, hide: () => {} };
  }
  return ctx;
}

interface ToastState {
  id: number;
  message: string;
  variant: ToastVariant;
  duration: number;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-12)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idCounter = useRef(0);

  const hide = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: -12,
        duration: 180,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start(({ finished }) => {
      if (finished) setToast(null);
    });
  }, [opacity, translateY]);

  const show = useCallback(
    (message: string, options?: ToastOptions) => {
      const variant = options?.variant ?? "info";
      const duration =
        options?.duration ?? (variant === "error" || variant === "warning" ? 4000 : 2500);
      const id = ++idCounter.current;

      setToast({ id, message, variant, duration });

      if (hideTimer.current) clearTimeout(hideTimer.current);
      opacity.setValue(0);
      translateY.setValue(-12);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start();

      hideTimer.current = setTimeout(hide, duration);
    },
    [opacity, translateY, hide],
  );

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  const value = useMemo(() => ({ show, hide }), [show, hide]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <ToastView
          toast={toast}
          opacity={opacity}
          translateY={translateY}
        />
      )}
    </ToastContext.Provider>
  );
}

function ToastView({
  toast,
  opacity,
  translateY,
}: {
  toast: ToastState;
  opacity: Animated.Value;
  translateY: Animated.Value;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const palette = (() => {
    switch (toast.variant) {
      case "success":
        return { bg: colors.positive, fg: "#FFFFFF", icon: "check-circle" as const };
      case "error":
        return { bg: colors.negative, fg: "#FFFFFF", icon: "alert-circle" as const };
      case "warning":
        return { bg: colors.warning, fg: "#FFFFFF", icon: "alert-triangle" as const };
      case "info":
      default:
        return { bg: colors.foreground, fg: colors.background, icon: "info" as const };
    }
  })();

  const topOffset = (Platform.OS === "web" ? 16 : insets.top) + 12;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        {
          top: topOffset,
          opacity,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: palette.bg,
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
      >
        <Feather name={palette.icon} size={18} color={palette.fg} />
        <Text style={[styles.text, { color: palette.fg }]} numberOfLines={2}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 9999,
    elevation: 9999,
    alignItems: "center",
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    maxWidth: 480,
    width: "100%",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 6,
  },
  text: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 19,
  },
});
