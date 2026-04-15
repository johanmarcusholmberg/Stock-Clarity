import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Dimensions,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useSubscription, Plan } from "@/context/SubscriptionContext";

interface Props {
  visible: boolean;
  onClose: () => void;
  triggerReason?: "ai_limit" | "watchlist_limit" | "folder_limit" | "ai_stock_limit" | "stock_daily_limit" | "general";
  currentTier?: "free" | "pro" | "premium";
}

interface PlanFeature {
  text: string;
  included: boolean;
}

const PLAN_FEATURES: Record<string, PlanFeature[]> = {
  pro: [
    { text: "10 stock pages with AI analysis per day", included: true },
    { text: "3 AI event summaries per stock", included: true },
    { text: "Up to 50 stocks in watchlist", included: true },
    { text: "Up to 5 watchlist folders", included: true },
    { text: "Interactive 1-year price charts", included: true },
    { text: "Digest: daily AI stock briefings", included: true },
    { text: "Multi-source news with AI filtering", included: true },
    { text: "Unlimited AI summaries", included: false },
    { text: "Priority support", included: false },
  ],
  premium: [
    { text: "Unlimited stock pages with AI per day", included: true },
    { text: "5 AI event summaries per stock", included: true },
    { text: "Unlimited stocks in watchlist", included: true },
    { text: "Unlimited watchlist folders", included: true },
    { text: "Interactive 1-year price charts", included: true },
    { text: "Digest: daily AI stock briefings", included: true },
    { text: "Multi-source news with AI filtering", included: true },
    { text: "Unlimited AI summaries", included: true },
    { text: "Priority support", included: true },
  ],
};

export function PaywallSheet({ visible, onClose, triggerReason = "general", currentTier = "free" }: Props) {
  const colors = useColors();
  const { plans, plansLoading, fetchPlans, startCheckout } = useSubscription();
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">("month");
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const { width } = Dimensions.get("window");

  useEffect(() => {
    if (visible) fetchPlans();
  }, [visible]);

  const reasonText: Record<string, string> = {
    ai_limit: "You've used all your free AI summaries for today.",
    ai_stock_limit: "You've reached your AI summary limit for this stock.",
    stock_daily_limit: "You've reached your 3-stock daily limit. Upgrade for more.",
    watchlist_limit: "Upgrade to track more stocks in your watchlist.",
    folder_limit: "You've reached the folder limit on your current plan.",
    general: currentTier === "pro" ? "Unlock everything with Premium." : "Unlock the full StockClarify experience.",
  };

  // Filter plans based on current tier (pro users only see premium)
  const visiblePlans = plans.filter((plan) => {
    const tier = plan.metadata?.tier;
    if (currentTier === "pro") return tier === "premium";
    return tier === "pro" || tier === "premium";
  });

  const handleSubscribe = async (plan: Plan) => {
    const price = plan.prices?.find((p) => p.interval === selectedInterval);
    if (!price) return;
    setLoadingPriceId(price.id);
    try {
      const url = await startCheckout(price.id);
      if (url) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Checkout unavailable", "Could not start checkout. Please try again in a moment.");
      }
    } finally {
      setLoadingPriceId(null);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingBottom: Platform.OS === "ios" ? 40 : 24,
      maxHeight: Dimensions.get("window").height * 0.94,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 8 },
    header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    closeBtn: { position: "absolute", right: 16, top: 4, padding: 12 },
    badge: { backgroundColor: colors.primary + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" },
    badgeText: { color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" },
    launchBadge: { backgroundColor: colors.accent + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start", borderWidth: 1, borderColor: colors.accent + "44" },
    launchBadgeText: { color: colors.accent, fontSize: 11, fontFamily: "Inter_600SemiBold" },
    title: { color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    toggle: { flexDirection: "row", backgroundColor: colors.secondary, borderRadius: 12, padding: 4, marginHorizontal: 24, marginVertical: 16 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
    toggleActive: { backgroundColor: colors.primary },
    toggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    toggleTextActive: { color: colors.primaryForeground },
    saveBadge: { backgroundColor: colors.positive, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
    saveBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
    plansContainer: { paddingHorizontal: 16, gap: 12 },
    planCard: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, overflow: "hidden" },
    planCardHighlight: { borderColor: colors.primary },
    planHeader: { padding: 16, gap: 4 },
    planHeaderHighlight: { backgroundColor: colors.primary + "18" },
    planName: { color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold" },
    priceRow: { flexDirection: "row", alignItems: "baseline", gap: 2, marginTop: 4 },
    planPrice: { color: colors.primary, fontSize: 30, fontFamily: "Inter_700Bold" },
    planInterval: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" },
    originalPrice: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", textDecorationLine: "line-through", marginLeft: 6 },
    planDesc: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
    features: { paddingHorizontal: 16, paddingBottom: 8, paddingTop: 4, gap: 7 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    featureText: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
    featureIncluded: { color: colors.foreground },
    featureExcluded: { color: colors.mutedForeground },
    subscribeBtn: { marginHorizontal: 16, marginBottom: 16, marginTop: 8, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    subscribeBtnSecondary: { backgroundColor: colors.secondary, borderWidth: 1.5, borderColor: colors.border },
    subscribeBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_700Bold" },
    subscribeBtnTextSecondary: { color: colors.foreground },
    footer: { paddingHorizontal: 24, paddingTop: 8 },
    footerText: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  });

  const title = currentTier === "pro" ? "Upgrade to Premium" : "Unlock StockClarify";

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <TouchableOpacity style={s.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <View style={s.badge}>
                <Text style={s.badgeText}>⚡ UPGRADE</Text>
              </View>
              <View style={s.launchBadge}>
                <Text style={s.launchBadgeText}>🎉 LAUNCH PRICING</Text>
              </View>
            </View>
            <Text style={s.title}>{title}</Text>
            <Text style={s.subtitle}>{reasonText[triggerReason]}</Text>
          </View>

          {/* Billing toggle */}
          <View style={s.toggle}>
            <TouchableOpacity style={[s.toggleBtn, selectedInterval === "month" && s.toggleActive]} onPress={() => setSelectedInterval("month")}>
              <Text style={[s.toggleText, selectedInterval === "month" && s.toggleTextActive]}>Monthly</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.toggleBtn, selectedInterval === "year" && s.toggleActive]} onPress={() => setSelectedInterval("year")}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={[s.toggleText, selectedInterval === "year" && s.toggleTextActive]}>Yearly</Text>
                <View style={s.saveBadge}><Text style={s.saveBadgeText}>SAVE 20%</Text></View>
              </View>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get("window").height * 0.56 }}>
            {plansLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
            ) : visiblePlans.length === 0 ? (
              <Text style={[s.footerText, { padding: 24 }]}>Plans unavailable. Please try again later.</Text>
            ) : (
              <View style={s.plansContainer}>
                {visiblePlans.map((plan, i) => {
                  const tierKey = plan.metadata?.tier ?? (i === 0 ? "pro" : "premium");
                  const isPro = tierKey === "pro";
                  const isPremium = tierKey === "premium";
                  const isHighlight = currentTier === "pro" ? isPremium : isPro;
                  const price = plan.prices?.find((p) => p.interval === selectedInterval);
                  const features = PLAN_FEATURES[tierKey] ?? [];
                  const isLoading = price ? loadingPriceId === price.id : false;

                  return (
                    <View key={plan.id} style={[s.planCard, isHighlight && s.planCardHighlight]}>
                      <View style={[s.planHeader, isHighlight && s.planHeaderHighlight]}>
                        {isHighlight && (
                          <View style={{ flexDirection: "row", marginBottom: 6 }}>
                            <View style={[s.badge, { backgroundColor: colors.primary + "33", marginBottom: 0 }]}>
                              <Text style={s.badgeText}>{currentTier === "pro" ? "YOUR UPGRADE" : "MOST POPULAR"}</Text>
                            </View>
                          </View>
                        )}
                        <Text style={s.planName}>{plan.name}</Text>
                        {price ? (
                          <View style={s.priceRow}>
                            <Text style={s.planPrice}>{formatPrice(price.unit_amount)}</Text>
                            <Text style={s.planInterval}>/{price.interval === "year" ? "yr" : "mo"}</Text>
                            {price.interval === "year" && (
                              <Text style={s.originalPrice}>
                                ${((price.unit_amount / 100 / 12) / 0.8 * 12).toFixed(0)}/yr
                              </Text>
                            )}
                          </View>
                        ) : (
                          <Text style={s.planDesc}>Pricing unavailable</Text>
                        )}
                        {price?.interval === "year" && (
                          <Text style={{ color: colors.positive, fontSize: 12, fontFamily: "Inter_600SemiBold", marginTop: 2 }}>
                            = {formatPrice(Math.round(price.unit_amount / 12))}/mo — save 20%
                          </Text>
                        )}
                      </View>

                      <View style={s.features}>
                        {features.map((f) => (
                          <View key={f.text} style={s.featureRow}>
                            <Feather
                              name={f.included ? "check-circle" : "x-circle"}
                              size={14}
                              color={f.included ? colors.positive : colors.mutedForeground}
                            />
                            <Text style={[s.featureText, f.included ? s.featureIncluded : s.featureExcluded]}>
                              {f.text}
                            </Text>
                          </View>
                        ))}
                      </View>

                      {price && (
                        <TouchableOpacity
                          style={[s.subscribeBtn, !isHighlight && s.subscribeBtnSecondary]}
                          onPress={() => handleSubscribe(plan)}
                          disabled={isLoading}
                        >
                          {isLoading ? (
                            <ActivityIndicator color={isHighlight ? colors.primaryForeground : colors.foreground} />
                          ) : (
                            <Text style={[s.subscribeBtnText, !isHighlight && s.subscribeBtnTextSecondary]}>
                              {currentTier === "pro" && isPremium ? "Upgrade to Premium" : `Get ${plan.name}`} · {formatPrice(price.unit_amount)}/{price.interval === "year" ? "yr" : "mo"}
                            </Text>
                          )}
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>
            )}
            <View style={{ height: 16 }} />
          </ScrollView>

          <View style={s.footer}>
            <Text style={[s.footerText, { color: colors.accent, marginBottom: 6, fontFamily: "Inter_600SemiBold" }]}>
              Early subscribers keep this price for 12 months.
            </Text>
            <Text style={s.footerText}>Cancel anytime · Secure payment via Stripe · Restore purchases on sign in</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
