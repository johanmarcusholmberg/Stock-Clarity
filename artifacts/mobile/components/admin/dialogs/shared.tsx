import React, { ReactNode } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface DialogShellProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: keyof typeof Feather.glyphMap;
  iconTint?: string;
  children: ReactNode;
  footer: ReactNode;
  /** Disables backdrop-tap-to-close while a mutation is in flight. */
  dismissable?: boolean;
}

/**
 * Shared modal wrapper for every admin-subscription dialog. Renders a
 * bottom-centered card with an X dismiss button, scrollable body, and
 * sticky footer. Non-destructive and destructive dialogs differ only in
 * icon tint and footer button colour, both controlled by the caller.
 */
export function DialogShell({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  iconTint,
  children,
  footer,
  dismissable = true,
}: DialogShellProps) {
  const colors = useColors();
  const s = StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.72)",
      justifyContent: "center",
      alignItems: "center",
      padding: 16,
    },
    card: {
      width: "100%",
      maxWidth: 420,
      maxHeight: "90%",
      borderRadius: 20,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      gap: 12,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    },
    titleWrap: { flex: 1 },
    title: { color: colors.foreground, fontSize: 16, fontFamily: "Inter_700Bold" },
    subtitle: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
    closeBtn: { padding: 6 },
    body: { padding: 20, gap: 14 },
    footer: {
      flexDirection: "row",
      gap: 8,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      backgroundColor: colors.card,
    },
  });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissable ? onClose : undefined}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={s.overlay}>
        <View style={s.card}>
          <View style={s.header}>
            {icon ? (
              <View style={[s.iconWrap, { backgroundColor: (iconTint ?? colors.primary) + "22" }]}>
                <Feather name={icon} size={18} color={iconTint ?? colors.primary} />
              </View>
            ) : null}
            <View style={s.titleWrap}>
              <Text style={s.title}>{title}</Text>
              {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
            </View>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} disabled={!dismissable} hitSlop={8}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
          <View style={s.footer}>{footer}</View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Shared form primitives ──────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "destructive" | "secondary";
  flex?: boolean;
}

export function DialogButton({ label, onPress, disabled, loading, variant = "primary", flex }: ButtonProps) {
  const colors = useColors();
  const bg =
    variant === "destructive"
      ? colors.destructive
      : variant === "secondary"
        ? colors.secondary
        : colors.primary;
  const fg =
    variant === "destructive"
      ? colors.destructiveForeground
      : variant === "secondary"
        ? colors.foreground
        : colors.primaryForeground;
  const opacity = disabled || loading ? 0.45 : 1;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      style={{
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        backgroundColor: bg,
        alignItems: "center",
        justifyContent: "center",
        flex: flex ? 1 : undefined,
        opacity,
      }}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <Text style={{ color: fg, fontSize: 14, fontFamily: "Inter_700Bold" }}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

interface ErrorBannerProps {
  message: string | null;
  code?: string | null;
  retryAfterSec?: number;
}

export function ErrorBanner({ message, code, retryAfterSec }: ErrorBannerProps) {
  const colors = useColors();
  if (!message) return null;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: colors.destructive + "18",
        borderWidth: 1,
        borderColor: colors.destructive + "55",
      }}
    >
      <Feather name="alert-triangle" size={14} color={colors.destructive} style={{ marginTop: 2 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: colors.destructive, fontSize: 13, fontFamily: "Inter_500Medium" }}>{message}</Text>
        {code ? (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, opacity: 0.8 }}>
            Stripe code: {code}
          </Text>
        ) : null}
        {retryAfterSec ? (
          <Text style={{ color: colors.destructive, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2, opacity: 0.8 }}>
            Retry after {retryAfterSec}s
          </Text>
        ) : null}
      </View>
    </View>
  );
}

interface InfoBannerProps {
  message: string;
  tone?: "info" | "warning" | "success";
}

export function InfoBanner({ message, tone = "info" }: InfoBannerProps) {
  const colors = useColors();
  const tint =
    tone === "warning" ? colors.warning : tone === "success" ? colors.positive : colors.primary;
  return (
    <View
      style={{
        flexDirection: "row",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: tint + "18",
        borderWidth: 1,
        borderColor: tint + "55",
      }}
    >
      <Feather
        name={tone === "warning" ? "alert-triangle" : tone === "success" ? "check-circle" : "info"}
        size={14}
        color={tint}
        style={{ marginTop: 2 }}
      />
      <Text style={{ color: tint, fontSize: 13, fontFamily: "Inter_500Medium", flex: 1, lineHeight: 18 }}>
        {message}
      </Text>
    </View>
  );
}

interface LabeledInputProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function LabeledField({ label, hint, children }: LabeledInputProps) {
  const colors = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.6 }}>
        {label}
      </Text>
      {children}
      {hint ? (
        <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>{hint}</Text>
      ) : null}
    </View>
  );
}

/** Standard bordered text-input style for dialog fields. */
export function useDialogInputStyle() {
  const colors = useColors();
  return {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    fontFamily: "Inter_400Regular" as const,
    color: colors.foreground,
    backgroundColor: colors.secondary,
  };
}
