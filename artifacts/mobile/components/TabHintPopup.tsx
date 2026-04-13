import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const HINT_KEY_PREFIX = "@stockclarify_hint_seen_";
const ALL_TAB_KEYS = ["digest", "search", "home", "insights", "account"];

function hintKey(userId: string, tabKey: string) {
  return `${HINT_KEY_PREFIX}${userId}_${tabKey}`;
}

async function isHintSeen(userId: string, tabKey: string): Promise<boolean> {
  const val = await AsyncStorage.getItem(hintKey(userId, tabKey));
  return val === "1";
}

async function markHintSeen(userId: string, tabKey: string): Promise<void> {
  await AsyncStorage.setItem(hintKey(userId, tabKey), "1");
}

async function markAllHintsSeen(userId: string): Promise<void> {
  await Promise.all(ALL_TAB_KEYS.map((k) => AsyncStorage.setItem(hintKey(userId, k), "1")));
}

async function isFirstHintEver(userId: string): Promise<boolean> {
  const results = await Promise.all(
    ALL_TAB_KEYS.map((k) => AsyncStorage.getItem(hintKey(userId, k)))
  );
  return results.every((v) => v !== "1");
}

interface Props {
  tabKey: string;
  hint: string;
}

export function TabHintPopup({ tabKey, hint }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();

  const [visible, setVisible] = useState(false);
  const [showSkipAll, setShowSkipAll] = useState(false);
  const checkedUserRef = useRef<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;

  useEffect(() => {
    if (!userId || checkedUserRef.current === userId) return;
    checkedUserRef.current = userId;

    (async () => {
      const seen = await isHintSeen(userId, tabKey);
      if (seen) return;

      const isFirst = await isFirstHintEver(userId);

      setShowSkipAll(isFirst);
      setVisible(true);

      slideAnim.setValue(24);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 280, useNativeDriver: true }),
      ]).start();
    })();
  }, [userId, tabKey]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 20, duration: 200, useNativeDriver: true }),
    ]).start(() => setVisible(false));
  };

  const handleGotIt = async () => {
    if (!userId) return;
    await markHintSeen(userId, tabKey);
    dismiss();
  };

  const handleSkipAll = async () => {
    if (!userId) return;
    await markAllHintsSeen(userId);
    dismiss();
  };

  if (!visible) return null;

  const bottomOffset = Platform.OS === "web"
    ? 84 + 16
    : insets.bottom + 62 + 16;

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { bottom: bottomOffset, opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.hintText, { color: colors.foreground }]}>{hint}</Text>
        <View style={styles.actions}>
          {showSkipAll && (
            <TouchableOpacity style={[styles.skipBtn, { borderColor: colors.border }]} onPress={handleSkipAll}>
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>Skip all hints</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={[styles.gotItBtn, { backgroundColor: colors.primary }]} onPress={handleGotIt}>
            <Text style={[styles.gotItText, { color: colors.primaryForeground }]}>Got it</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 900,
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 18,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 6,
  },
  hintText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
    marginBottom: 14,
  },
  actions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    alignItems: "center",
  },
  skipBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  gotItBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
  },
  gotItText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
});
