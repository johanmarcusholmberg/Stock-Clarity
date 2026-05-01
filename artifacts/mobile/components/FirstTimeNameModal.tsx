import React, { useState, useEffect, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

interface Props {
  onComplete: (name: string) => void;
}

export function FirstTimeNameModal({ onComplete }: Props) {
  const colors = useColors();
  const { userId } = useAuth();
  const { user } = useUser();
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [checked, setChecked] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (!userId || checked) return;
    // If user already has a firstName, skip
    if (user?.firstName) {
      setChecked(true);
      return;
    }
    const key = `@stockclarify_name_prompted_${userId}`;
    AsyncStorage.getItem(key).then((val) => {
      setChecked(true);
      if (!val) {
        setVisible(true);
        setTimeout(() => inputRef.current?.focus(), 300);
      }
    });
  }, [userId, user?.firstName]);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || !userId) return;
    setSaving(true);
    try {
      // Update Clerk profile
      await user?.update({ firstName: trimmed });
      // Save to backend
      await fetch(`${API_BASE}/watchlist/${userId}/name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: trimmed }),
      });
      // Mark as prompted
      await AsyncStorage.setItem(`@stockclarify_name_prompted_${userId}`, "1");
      setVisible(false);
      onComplete(trimmed);
    } catch {
      // Still close
      await AsyncStorage.setItem(`@stockclarify_name_prompted_${userId}`, "1");
      setVisible(false);
      onComplete(trimmed);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    if (userId) {
      await AsyncStorage.setItem(`@stockclarify_name_prompted_${userId}`, "1");
    }
    setVisible(false);
    onComplete("");
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={s.overlay}
      >
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[s.iconCircle, { backgroundColor: colors.primary + "22" }]}>
            <Text style={{ fontSize: 32 }}>👋</Text>
          </View>
          <Text style={[s.title, { color: colors.foreground }]}>Welcome to StockClarify!</Text>
          <Text style={[s.sub, { color: colors.mutedForeground }]}>
            What should we call you? This appears in your greeting and throughout the app.
          </Text>
          <TextInput
            ref={inputRef}
            style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.secondary }]}
            placeholder="Your first name"
            placeholderTextColor={colors.mutedForeground}
            value={name}
            onChangeText={setName}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleSave}
            maxLength={40}
          />
          <TouchableOpacity
            style={[s.btn, { backgroundColor: name.trim() ? colors.primary : colors.secondary }]}
            onPress={handleSave}
            disabled={!name.trim() || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <Text style={[s.btnText, { color: name.trim() ? colors.primaryForeground : colors.mutedForeground }]}>
                Let's go
              </Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity onPress={handleSkip} style={s.skip}>
            <Text style={[s.skipText, { color: colors.mutedForeground }]}>Skip for now</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    borderRadius: 24,
    borderWidth: 1,
    padding: 28,
    alignItems: "center",
    gap: 12,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  title: { fontSize: 22, fontFamily: "Inter_700Bold", textAlign: "center" },
  sub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  input: {
    width: "100%",
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
  },
  btn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 4,
  },
  btnText: { fontSize: 16, fontFamily: "Inter_700Bold" },
  skip: { paddingVertical: 8 },
  skipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
