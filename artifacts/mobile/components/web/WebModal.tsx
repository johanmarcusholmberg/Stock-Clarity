// Centered overlay modal for the web. Native callers keep using their
// existing bottom-sheet components; this wrapper is only chosen when
// Platform.OS === 'web'.

import React, { useEffect } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useColors } from "@/hooks/useColors";
import { CloseIcon } from "@/components/icons/StockIcons";
import { WebTokens } from "@/components/web/WebTokens";

interface WebModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: number;
}

export function WebModal({ visible, onClose, title, children, maxWidth = 520 }: WebModalProps) {
  // Escape key closes the modal — keep parity with the Esc shortcut from
  // useWebKeyboard. Listener is local so closing one modal doesn't bubble
  // to other open ones.
  useEffect(() => {
    if (!visible) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [visible, onClose]);

  const colors = useColors();
  if (!visible) return null;

  return (
    <View
      // @ts-ignore — fixed positioning is web-only
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        // @ts-ignore — animation handled via CSS keyframe approximation
        animation: "stockclarity-modal-fade 180ms ease",
      }}
    >
      <Pressable
        onPress={onClose}
        accessibilityLabel="Close modal"
        // @ts-ignore — fill the parent
        style={{
          position: "absolute",
          inset: 0,
          backgroundColor: "rgba(10, 22, 40, 0.6)",
        }}
      />
      <View
        style={{
          width: "100%",
          maxWidth,
          backgroundColor: colors.card,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 0,
          // @ts-ignore — web-only
          boxShadow: WebTokens.shadow.lg,
          maxHeight: "85%",
          overflow: "hidden",
          // @ts-ignore
          transform: "scale(1)",
        }}
      >
        {(title || true) && (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: 24,
              paddingTop: 22,
              paddingBottom: 12,
            }}
          >
            <Text
              style={{
                color: colors.text,
                fontFamily: WebTokens.fontDisplay,
                fontSize: 20,
                flex: 1,
              }}
            >
              {title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityLabel="Close"
              // @ts-ignore
              style={{ padding: 6, borderRadius: 8, cursor: "pointer" }}
            >
              <CloseIcon size={20} color={colors.mutedForeground} />
            </Pressable>
          </View>
        )}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24, paddingTop: 4 }}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
}
