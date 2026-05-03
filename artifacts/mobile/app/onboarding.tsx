import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useRef, useState } from "react";
import {
  Dimensions,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ViewToken,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { markOnboardingComplete } from "@/hooks/useOnboarding";

const { width: SCREEN_W } = Dimensions.get("window");

interface Slide {
  icon: keyof typeof Feather.glyphMap;
  iconColor: string;
  title: string;
  body: string;
  highlights?: { label: string; text: string; color: string }[];
  /** Small grey caveat at the bottom of the slide (e.g. financial-advice disclaimer). */
  footnote?: string;
}

const SLIDES: Slide[] = [
  {
    icon: "trending-up",
    iconColor: "#3B82F6",
    title: "Welcome to StockClarify",
    body:
      "Your AI investment companion. We don't dump raw data on you — we explain what happened, why it matters, and what's unusual about it.",
  },
  {
    icon: "list",
    iconColor: "#10B981",
    title: "Build your watchlist",
    body:
      "Track the stocks you actually care about. Organize them into folders, see daily moves at a glance, and get a summarized digest each day.",
  },
  {
    icon: "zap",
    iconColor: "#F59E0B",
    title: "Read the news in seconds",
    body:
      "Tap any news event to see three things, fast:",
    highlights: [
      { label: "WHAT HAPPENED", text: "The concrete facts beyond the headline.", color: "#3B82F6" },
      { label: "WHY IT MATTERS", text: "What it means for the stock.", color: "#F59E0B" },
      { label: "UNUSUAL", text: "What's surprising or worth watching.", color: "#94A3B8" },
    ],
    footnote:
      "StockClarify is an information tool, not a financial advisor. AI summaries can be incomplete or wrong — verify anything that matters before you act on it.",
  },
];

export default function OnboardingScreen() {
  const colors = useColors();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);

  const finish = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await markOnboardingComplete();
    router.replace("/(tabs)/digest");
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      Haptics.selectionAsync();
      listRef.current?.scrollToIndex({ index: index + 1, animated: true });
    } else {
      void finish();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;

  const isLast = index === SLIDES.length - 1;

  return (
    <SafeAreaView style={[s.root, { backgroundColor: colors.background }]} edges={["top", "bottom"]}>
      <View style={s.header}>
        <TouchableOpacity onPress={finish} hitSlop={12} accessibilityLabel="Skip onboarding">
          <Text style={[s.skip, { color: colors.mutedForeground }]}>Skip</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        renderItem={({ item }) => (
          <View style={[s.slide, { width: SCREEN_W }]}>
            <View style={[s.iconWrap, { backgroundColor: item.iconColor + "1A" }]}>
              <Feather name={item.icon} size={48} color={item.iconColor} />
            </View>
            <Text style={[s.title, { color: colors.foreground }]}>{item.title}</Text>
            <Text style={[s.body, { color: colors.mutedForeground }]}>{item.body}</Text>
            {item.highlights ? (
              <View style={s.highlights}>
                {item.highlights.map((h) => (
                  <View
                    key={h.label}
                    style={[s.highlight, { backgroundColor: colors.card, borderColor: colors.border }]}
                  >
                    <Text style={[s.highlightLabel, { color: h.color }]}>{h.label}</Text>
                    <Text style={[s.highlightText, { color: colors.foreground }]}>{h.text}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {item.footnote ? (
              <Text style={[s.footnote, { color: colors.mutedForeground }]}>{item.footnote}</Text>
            ) : null}
          </View>
        )}
      />

      <View style={s.footer}>
        <View style={s.dots}>
          {SLIDES.map((_, i) => (
            <View
              key={i}
              style={[
                s.dot,
                {
                  backgroundColor: i === index ? colors.primary : colors.border,
                  width: i === index ? 22 : 6,
                },
              ]}
            />
          ))}
        </View>
        <TouchableOpacity
          style={[s.cta, { backgroundColor: colors.primary }]}
          onPress={next}
          activeOpacity={0.85}
        >
          <Text style={[s.ctaText, { color: colors.primaryForeground }]}>
            {isLast ? "Get started" : "Next"}
          </Text>
          <Feather
            name={isLast ? "check" : "arrow-right"}
            size={16}
            color={colors.primaryForeground}
          />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  skip: { fontSize: 14, fontFamily: "Inter_500Medium" },
  slide: {
    paddingHorizontal: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
  },
  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    marginBottom: 12,
  },
  body: {
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 340,
  },
  highlights: { marginTop: 24, width: "100%", gap: 10 },
  highlight: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  highlightLabel: {
    fontSize: 10,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  highlightText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  footnote: {
    marginTop: 18,
    fontSize: 11,
    lineHeight: 15,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    maxWidth: 320,
  },
  footer: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    paddingTop: 16,
    gap: 18,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: { height: 6, borderRadius: 3 },
  cta: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  ctaText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
