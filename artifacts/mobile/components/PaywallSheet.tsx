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
}

const FEATURE_MAP: Record<string, string[]> = {
  pro: [
    "10 stocks with AI analysis per day",
    "3 AI summaries per stock",
    "Up to 50 stocks in watchlist",
    "Interactive price charts",
    "Priority data refresh",
  ],
  premium: [
    "Unlimited stocks with AI per day",
    "5 AI summaries per stock",
    "Unlimited watchlist stocks",
    "Exclusive market insights",
    "Early access to new features",
    "Priority support",
  ],
};

export function PaywallSheet({ visible, onClose, triggerReason = "general" }: Props) {
  const colors = useColors();
  const { plans, plansLoading, fetchPlans, startCheckout } = useSubscription();
  const [selectedInterval, setSelectedInterval] = useState<"month" | "year">("month");
  const [loadingPriceId, setLoadingPriceId] = useState<string | null>(null);
  const { width } = Dimensions.get("window");

  useEffect(() => {
    if (visible) fetchPlans();
  }, [visible]);

  const reasonText: Record<string, string> = {
    ai_limit: "You've used all free AI summaries for today.",
    ai_stock_limit: "You've used your free AI summary for this stock today.",
    stock_daily_limit: "You've reached your daily limit of 3 stocks with AI analysis. Upgrade for more.",
    watchlist_limit: "Upgrade to track more stocks.",
    folder_limit: "Free users can have up to 2 folders. Upgrade for up to 10.",
    general: "Unlock the full StockClarify experience.",
  };

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
      maxHeight: Dimensions.get("window").height * 0.92,
    },
    handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginTop: 12, marginBottom: 8 },
    header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    closeBtn: { position: "absolute", right: 20, top: 8, padding: 8 },
    badge: { backgroundColor: colors.primary + "22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start" },
    badgeText: { color: colors.primary, fontSize: 11, fontFamily: "Inter_600SemiBold" },
    launchBadge: { backgroundColor: "#FF6B0022", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, alignSelf: "flex-start", borderWidth: 1, borderColor: "#FF6B0044" },
    launchBadgeText: { color: "#FF6B00", fontSize: 11, fontFamily: "Inter_600SemiBold" },
    title: { color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 4 },
    subtitle: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    toggle: { flexDirection: "row", backgroundColor: colors.secondary, borderRadius: 12, padding: 4, marginHorizontal: 24, marginVertical: 16 },
    toggleBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 9 },
    toggleActive: { backgroundColor: colors.primary },
    toggleText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground },
    toggleTextActive: { color: colors.primaryForeground },
    saveBadge: { backgroundColor: colors.positive, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 },
    saveBadgeText: { color: "#fff", fontSize: 10, fontFamily: "Inter_700Bold" },
    plansContainer: { paddingHorizontal: 24, gap: 12 },
    planCard: { borderRadius: 16, borderWidth: 1.5, borderColor: colors.border, overflow: "hidden" },
    planCardHighlight: { borderColor: colors.primary },
    planHeader: { padding: 16, gap: 4 },
    planHeaderHighlight: { backgroundColor: colors.primary + "18" },
    planName: { color: colors.foreground, fontSize: 17, fontFamily: "Inter_700Bold" },
    planPrice: { color: colors.primary, fontSize: 28, fontFamily: "Inter_700Bold" },
    planInterval: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular" },
    planDesc: { color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
    features: { padding: 16, paddingTop: 8, gap: 8 },
    featureRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    featureText: { color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
    subscribeBtn: { marginHorizontal: 16, marginBottom: 16, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    subscribeBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_700Bold" },
    footer: { paddingHorizontal: 24, paddingTop: 8 },
    footerText: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  });

  return (
    <Modal visible={visible} animationType="slide" transparent presentationStyle="overFullScreen" onRequestClose={onClose}>
      <View style={s.overlay}>
        <View style={s.sheet}>
          <View style={s.handle} />
          <View style={s.header}>
            <TouchableOpacity style={s.closeBtn} onPress={onClose}>
              <Feather name="x" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
              <View style={s.badge}>
                <Text style={s.badgeText}>⚡ UPGRADE</Text>
              </View>
              <View style={s.launchBadge}>
                <Text style={s.launchBadgeText}>🎉 LAUNCH OFFER</Text>
              </View>
            </View>
            <Text style={s.title}>StockClarify Pro</Text>
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

          <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: Dimensions.get("window").height * 0.55 }}>
            {plansLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
            ) : plans.length === 0 ? (
              <Text style={[s.footerText, { padding: 24 }]}>Plans unavailable. Please try again later.</Text>
            ) : (
              <View style={s.plansContainer}>
                {plans.map((plan, i) => {
                  const tierKey = plan.metadata?.tier ?? (i === 0 ? "pro" : "premium");
                  const isHighlight = tierKey === "pro";
                  const price = plan.prices?.find((p) => p.interval === selectedInterval);
                  const features = FEATURE_MAP[tierKey] ?? [];
                  const isLoading = price ? loadingPriceId === price.id : false;

                  return (
                    <View key={plan.id} style={[s.planCard, isHighlight && s.planCardHighlight]}>
                      <View style={[s.planHeader, isHighlight && s.planHeaderHighlight]}>
                        {isHighlight && (
                          <View style={{ flexDirection: "row", marginBottom: 4 }}>
                            <View style={[s.badge, { backgroundColor: colors.primary + "33", marginBottom: 0 }]}>
                              <Text style={s.badgeText}>MOST POPULAR</Text>
                            </View>
                          </View>
                        )}
                        <Text style={s.planName}>{plan.name}</Text>
                        {price ? (
                          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                            <Text style={s.planPrice}>{formatPrice(price.unit_amount)}</Text>
                            <Text style={s.planInterval}>/{price.interval === "year" ? "year" : "mo"}</Text>
                          </View>
                        ) : (
                          <Text style={s.planDesc}>Pricing unavailable</Text>
                        )}
                        <Text style={s.planDesc}>{plan.description}</Text>
                      </View>
                      <View style={s.features}>
                        {features.map((f) => (
                          <View key={f} style={s.featureRow}>
                            <Feather name="check-circle" size={14} color={colors.positive} />
                            <Text style={s.featureText}>{f}</Text>
                          </View>
                        ))}
                      </View>
                      {price && (
                        <TouchableOpacity style={s.subscribeBtn} onPress={() => handleSubscribe(plan)} disabled={isLoading}>
                          {isLoading ? (
                            <ActivityIndicator color={colors.primaryForeground} />
                          ) : (
                            <Text style={s.subscribeBtnText}>Subscribe · {formatPrice(price.unit_amount)}/{price.interval === "year" ? "yr" : "mo"}</Text>
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
            <Text style={[s.footerText, { color: "#FF6B00", marginBottom: 6, fontFamily: "Inter_600SemiBold" }]}>
              Early subscribers keep this price for 12 months. Pricing may change after that.
            </Text>
            <Text style={s.footerText}>Cancel anytime · Secure payment via Stripe · Restore purchases on sign in</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}
