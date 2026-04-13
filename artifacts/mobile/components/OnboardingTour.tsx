import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  Platform,
  ScrollView,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "@clerk/expo";
import { useRouter, Href } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TOUR_KEY_PREFIX = "@stockclarify_tour_seen_";

type SpotlightShape = "tab" | "full-content" | "header" | "card-area";

interface TourStep {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  description: string;
  color: string;
  route: Href;
  spotlightShape: SpotlightShape;
  tabIndex?: number;
}

const TOUR_STEPS: TourStep[] = [
  {
    icon: "home",
    title: "Your Watchlist",
    description:
      "This is your home screen. Add stocks you want to track — you'll see live prices, daily changes, and quick access to each stock's chart.",
    color: "#6366f1",
    route: "/",
    spotlightShape: "full-content",
    tabIndex: 2,
  },
  {
    icon: "folder",
    title: "Folders",
    description:
      "Organise your watchlist into folders by sector, strategy, or any group you like. Swipe left on a stock to move it or delete it.",
    color: "#8b5cf6",
    route: "/",
    spotlightShape: "header",
    tabIndex: 2,
  },
  {
    icon: "trending-up",
    title: "Stock Charts",
    description:
      "Tap any stock in your watchlist to see its interactive price chart. Switch timeframes from 1 day to all-time, and read AI-powered summaries.",
    color: "#06b6d4",
    route: "/",
    spotlightShape: "card-area",
    tabIndex: 2,
  },
  {
    icon: "book-open",
    title: "Daily Digest",
    description:
      "The Digest tab summarises the biggest movers in your watchlist each day with AI-powered insights — stay informed without the noise.",
    color: "#10b981",
    route: "/digest",
    spotlightShape: "full-content",
    tabIndex: 0,
  },
  {
    icon: "bell",
    title: "Notifications",
    description:
      "Set up push or email alerts so you never miss a significant move. Manage notification preferences in your Account settings.",
    color: "#f59e0b",
    route: "/account",
    spotlightShape: "full-content",
    tabIndex: 4,
  },
  {
    icon: "user",
    title: "Account & Settings",
    description:
      "Manage your profile, subscription plan, notification schedule, and send feedback — all from the Account tab.",
    color: "#ef4444",
    route: "/account",
    spotlightShape: "full-content",
    tabIndex: 4,
  },
];

const FINAL_STEP_INDEX = TOUR_STEPS.length;
const NUM_TABS = 5;

function useScreenDimensions() {
  const [dims, setDims] = useState(() => Dimensions.get("window"));
  useEffect(() => {
    const sub = Dimensions.addEventListener("change", ({ window }) => setDims(window));
    return () => sub.remove();
  }, []);
  return dims;
}

interface SpotlightBoxConfig {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

function getSpotlightBox(
  shape: SpotlightShape,
  tabIndex: number | undefined,
  screenWidth: number,
  screenHeight: number,
  tabBarHeight: number,
  headerHeight: number,
  insetTop: number,
): SpotlightBoxConfig {
  const TAB_WIDTH = screenWidth / NUM_TABS;
  const contentTop = insetTop + headerHeight;
  const contentBottom = screenHeight - tabBarHeight;
  const contentHeight = contentBottom - contentTop;

  switch (shape) {
    case "tab": {
      const tIdx = tabIndex ?? 0;
      return {
        top: contentBottom + 6,
        left: tIdx * TAB_WIDTH + 4,
        width: TAB_WIDTH - 8,
        height: tabBarHeight - 12,
        borderRadius: 10,
      };
    }
    case "full-content":
      return {
        top: contentTop + 8,
        left: 12,
        width: screenWidth - 24,
        height: contentHeight - 16,
        borderRadius: 16,
      };
    case "header":
      return {
        top: contentTop,
        left: 0,
        width: screenWidth,
        height: Math.min(80, contentHeight * 0.18),
        borderRadius: 0,
      };
    case "card-area":
      return {
        top: contentTop + Math.min(80, contentHeight * 0.18) + 8,
        left: 12,
        width: screenWidth - 24,
        height: contentHeight * 0.5,
        borderRadius: 16,
      };
    default:
      return {
        top: contentTop,
        left: 12,
        width: screenWidth - 24,
        height: contentHeight,
        borderRadius: 16,
      };
  }
}

interface Props {
  onComplete: () => void;
  forceShow?: boolean;
}

export function OnboardingTour({ onComplete, forceShow }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { userId } = useAuth();
  const router = useRouter();
  const dims = useScreenDimensions();

  const [visible, setVisible] = useState(false);
  const [checkedUserId, setCheckedUserId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(40)).current;
  const overlayAnim = useRef(new Animated.Value(0)).current;
  const spotlightAnim = useRef(new Animated.Value(0)).current;

  const isWeb = Platform.OS === "web";
  const TAB_BAR_HEIGHT = isWeb ? 84 : 62;
  const HEADER_HEIGHT = 60;
  const INSET_TOP = isWeb ? 0 : insets.top;

  const showTour = useCallback(() => {
    router.push(TOUR_STEPS[0].route);
    setVisible(true);
    overlayAnim.setValue(0);
    fadeAnim.setValue(0);
    slideAnim.setValue(40);
    spotlightAnim.setValue(0);
    Animated.sequence([
      Animated.timing(overlayAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
        Animated.timing(spotlightAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
    ]).start();
  }, [router]);

  useEffect(() => {
    if (forceShow) {
      setStepIndex(0);
      if (!visible) {
        showTour();
      }
      return;
    }
    if (!userId) return;
    if (checkedUserId === userId) return;
    const key = `${TOUR_KEY_PREFIX}${userId}`;
    AsyncStorage.getItem(key).then((val) => {
      setCheckedUserId(userId);
      if (!val) {
        showTour();
      }
    });
  }, [userId, checkedUserId, forceShow, showTour]);

  const animateStepChange = useCallback((callback: () => void) => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: -20, duration: 150, useNativeDriver: true }),
      Animated.timing(spotlightAnim, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      callback();
      slideAnim.setValue(40);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.timing(slideAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
        Animated.timing(spotlightAnim, { toValue: 1, duration: 280, useNativeDriver: true }),
      ]).start();
    });
  }, []);

  const markSeen = async () => {
    if (userId) {
      await AsyncStorage.setItem(`${TOUR_KEY_PREFIX}${userId}`, "1");
    }
  };

  const handleNext = () => {
    const nextIndex = stepIndex + 1;
    if (nextIndex < TOUR_STEPS.length) {
      const nextStep = TOUR_STEPS[nextIndex];
      animateStepChange(() => {
        setStepIndex(nextIndex);
        router.push(nextStep.route);
      });
    } else {
      animateStepChange(() => setStepIndex(FINAL_STEP_INDEX));
    }
  };

  const handleBack = () => {
    const prevIndex = stepIndex - 1;
    if (prevIndex >= 0) {
      const prevStep = TOUR_STEPS[prevIndex];
      animateStepChange(() => {
        setStepIndex(prevIndex);
        router.push(prevStep.route);
      });
    }
  };

  const handleSkip = async () => {
    await markSeen();
    dismissTour();
  };

  const handleFinish = async () => {
    await markSeen();
    dismissTour();
  };

  const dismissTour = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      Animated.timing(overlayAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(() => {
      setVisible(false);
      onComplete();
    });
  };

  if (!visible) return null;

  const isFinalStep = stepIndex === FINAL_STEP_INDEX;
  const currentStep = isFinalStep ? null : TOUR_STEPS[stepIndex];
  const stepColor = currentStep?.color ?? "#22c55e";
  const totalDots = TOUR_STEPS.length + 1;

  const spotlightBox = currentStep
    ? getSpotlightBox(
        currentStep.spotlightShape,
        currentStep.tabIndex,
        dims.width,
        dims.height,
        TAB_BAR_HEIGHT,
        HEADER_HEIGHT,
        INSET_TOP,
      )
    : null;

  const cardBottom = insets.bottom + 16;

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      {/* Dark overlay */}
      <Animated.View
        pointerEvents="box-none"
        style={[StyleSheet.absoluteFill, { opacity: overlayAnim }]}
      >
        {/* Spotlight cutout using 4 rectangles around the highlighted area */}
        {spotlightBox && !isFinalStep ? (
          <Animated.View
            style={[StyleSheet.absoluteFill, { opacity: spotlightAnim }]}
            pointerEvents="none"
          >
            {/* Top bar */}
            <View
              style={[
                s.overlayRect,
                {
                  top: 0,
                  left: 0,
                  right: 0,
                  height: spotlightBox.top,
                },
              ]}
            />
            {/* Bottom bar */}
            <View
              style={[
                s.overlayRect,
                {
                  top: spotlightBox.top + spotlightBox.height,
                  left: 0,
                  right: 0,
                  bottom: 0,
                },
              ]}
            />
            {/* Left bar */}
            <View
              style={[
                s.overlayRect,
                {
                  top: spotlightBox.top,
                  left: 0,
                  width: spotlightBox.left,
                  height: spotlightBox.height,
                },
              ]}
            />
            {/* Right bar */}
            <View
              style={[
                s.overlayRect,
                {
                  top: spotlightBox.top,
                  left: spotlightBox.left + spotlightBox.width,
                  right: 0,
                  height: spotlightBox.height,
                },
              ]}
            />
            {/* Spotlight border/glow ring */}
            <View
              style={{
                position: "absolute",
                top: spotlightBox.top - 3,
                left: spotlightBox.left - 3,
                width: spotlightBox.width + 6,
                height: spotlightBox.height + 6,
                borderRadius: spotlightBox.borderRadius + 3,
                borderWidth: 2.5,
                borderColor: stepColor,
                shadowColor: stepColor,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.9,
                shadowRadius: 12,
                elevation: 0,
              }}
            />
          </Animated.View>
        ) : (
          <View
            style={[StyleSheet.absoluteFill, s.overlayRect]}
            pointerEvents="none"
          />
        )}
      </Animated.View>

      {/* Card */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          s.cardWrapper,
          {
            bottom: cardBottom,
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <View
          style={[s.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        >
          {!isFinalStep && (
            <TouchableOpacity style={s.skipBtn} onPress={handleSkip}>
              <Text style={[s.skipText, { color: colors.mutedForeground }]}>Skip tour</Text>
            </TouchableOpacity>
          )}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.cardScroll}
            bounces={false}
          >

          {isFinalStep ? (
            <>
              <View style={[s.iconCircle, { backgroundColor: "#22c55e22" }]}>
                <Feather name="check-circle" size={32} color="#22c55e" />
              </View>
              <Text style={[s.title, { color: colors.foreground }]}>You're all set!</Text>
              <Text style={[s.description, { color: colors.mutedForeground }]}>
                You're ready to explore StockClarify. Track your favourite stocks, read daily digests, and stay on top of the market.
              </Text>
              <View style={s.dotRow}>
                {Array.from({ length: totalDots }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      {
                        backgroundColor: i === stepIndex ? "#22c55e" : colors.border,
                        width: i === stepIndex ? 20 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
              <TouchableOpacity
                style={[s.primaryBtn, { backgroundColor: "#22c55e" }]}
                onPress={handleFinish}
              >
                <Text style={[s.primaryBtnText, { color: "#fff" }]}>Enter the app</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={[s.iconCircle, { backgroundColor: stepColor + "22" }]}>
                <Feather name={currentStep!.icon} size={32} color={stepColor} />
              </View>
              <Text style={[s.stepLabel, { color: colors.mutedForeground }]}>
                {stepIndex + 1} of {TOUR_STEPS.length}
              </Text>
              <Text style={[s.title, { color: colors.foreground }]}>{currentStep!.title}</Text>
              <Text style={[s.description, { color: colors.mutedForeground }]}>
                {currentStep!.description}
              </Text>
              <View style={s.dotRow}>
                {Array.from({ length: totalDots }).map((_, i) => (
                  <View
                    key={i}
                    style={[
                      s.dot,
                      {
                        backgroundColor: i === stepIndex ? stepColor : colors.border,
                        width: i === stepIndex ? 20 : 6,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={s.navRow}>
                {stepIndex > 0 ? (
                  <TouchableOpacity
                    style={[s.backBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                    onPress={handleBack}
                  >
                    <Feather name="arrow-left" size={15} color={colors.foreground} />
                    <Text style={[s.backBtnText, { color: colors.foreground }]}>Back</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={s.backBtnPlaceholder} />
                )}
                <TouchableOpacity
                  style={[s.nextBtn, { backgroundColor: stepColor }]}
                  onPress={handleNext}
                >
                  <Text style={[s.nextBtnText, { color: "#fff" }]}>
                    {stepIndex === TOUR_STEPS.length - 1 ? "Finish" : "Next"}
                  </Text>
                  <Feather name="arrow-right" size={15} color="#fff" />
                </TouchableOpacity>
              </View>
            </>
          )}
          </ScrollView>
        </View>
      </Animated.View>
    </Modal>
  );
}

export async function resetTourForUser(userId: string) {
  await AsyncStorage.removeItem(`${TOUR_KEY_PREFIX}${userId}`);
}

const s = StyleSheet.create({
  overlayRect: {
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.78)",
  },
  cardWrapper: {
    position: "absolute",
    left: 12,
    right: 12,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 24,
    paddingTop: 44,
    alignItems: "center",
    gap: 8,
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 12,
  },
  cardScroll: {
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  skipBtn: {
    position: "absolute",
    top: 14,
    right: 18,
    padding: 6,
  },
  skipText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  stepLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  title: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  description: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    marginTop: 2,
    paddingHorizontal: 4,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 6,
    marginBottom: 2,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    width: "100%",
    marginTop: 6,
  },
  backBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  backBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  backBtnPlaceholder: {
    flex: 1,
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 14,
  },
  nextBtnText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
  },
  primaryBtn: {
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtnText: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
