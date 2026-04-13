import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import { PaywallSheet } from "@/components/PaywallSheet";

const API_BASE = (() => {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return "http://localhost:8080/api";
})();

type FeedbackCategory = "general" | "bug" | "feature" | "billing";

export default function AccountScreen() {
  const colors = useColors();
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const {
    tier,
    isLoading,
    aiSummariesUsedToday,
    aiSummariesLimit,
    aiSummariesRemaining,
    subscriptionStatus,
    openPortal,
    refresh,
  } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [devTapCount, setDevTapCount] = useState(0);
  const [devToolsVisible, setDevToolsVisible] = useState(false);
  const [devTierLoading, setDevTierLoading] = useState(false);
  const devTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tierColors: Record<string, string> = {
    free: colors.mutedForeground,
    pro: colors.primary,
    premium: "#FFB800",
  };
  const tierLabels: Record<string, string> = {
    free: "Free",
    pro: "Pro",
    premium: "Premium",
  };

  const handleSignOut = async () => {
    Alert.alert("Sign out", "Are you sure you want to sign out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign out", style: "destructive", onPress: () => signOut() },
    ]);
  };

  const handleVersionTap = () => {
    const next = devTapCount + 1;
    setDevTapCount(next);
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    devTapTimer.current = setTimeout(() => setDevTapCount(0), 2000);
    if (next >= 5) {
      setDevToolsVisible(true);
      setDevTapCount(0);
      Alert.alert("Dev Tools Unlocked", "Developer testing tools are now visible.");
    }
  };

  const handleDevSetTier = async (newTier: "free" | "pro" | "premium") => {
    if (!userId) return;
    setDevTierLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dev/tier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, tier: newTier }),
      });
      if (res.ok) {
        refresh();
        Alert.alert("Tier Updated", `Your account is now on the ${newTier} plan. Pull to refresh if the UI doesn't update immediately.`);
      } else {
        Alert.alert("Error", "Failed to update tier. Make sure the API server is running.");
      }
    } catch {
      Alert.alert("Error", "Network error. Make sure the API server is running.");
    } finally {
      setDevTierLoading(false);
    }
  };

  const handleManageSubscription = async () => {
    if (tier === "free") {
      setShowPaywall(true);
      return;
    }
    setPortalLoading(true);
    try {
      const url = await openPortal();
      if (url) await Linking.openURL(url);
      else Alert.alert("Error", "Could not open subscription portal. Please try again.");
    } finally {
      setPortalLoading(false);
    }
  };

  const handleSubmitFeedback = async () => {
    if (feedbackMessage.trim().length < 10) {
      Alert.alert("Too short", "Please write at least 10 characters of feedback.");
      return;
    }
    setFeedbackLoading(true);
    try {
      const res = await fetch(`${API_BASE}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId,
          email: user?.primaryEmailAddress?.emailAddress,
          category: feedbackCategory,
          message: feedbackMessage.trim(),
          rating: feedbackRating > 0 ? feedbackRating : undefined,
        }),
      });
      if (res.ok) {
        setFeedbackMessage("");
        setFeedbackRating(0);
        setFeedbackCategory("general");
        Alert.alert("Thank you!", "Your feedback has been submitted.");
      } else {
        Alert.alert("Error", "Failed to submit feedback. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const categories: { value: FeedbackCategory; label: string; icon: string }[] = [
    { value: "general", label: "General", icon: "message-circle" },
    { value: "bug", label: "Bug Report", icon: "alert-triangle" },
    { value: "feature", label: "Feature", icon: "star" },
    { value: "billing", label: "Billing", icon: "credit-card" },
  ];

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    scroll: { flex: 1 },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerTitle: { color: colors.foreground, fontSize: 24, fontFamily: "Inter_700Bold" },
    section: { marginTop: 20, paddingHorizontal: 20 },
    sectionTitle: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 },
    card: { backgroundColor: colors.card, borderRadius: 16, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
    row: { flexDirection: "row", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowLast: { borderBottomWidth: 0 },
    rowIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.secondary, alignItems: "center", justifyContent: "center", marginRight: 12 },
    rowLabel: { flex: 1, color: colors.foreground, fontSize: 15, fontFamily: "Inter_400Regular" },
    rowValue: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    tierBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    tierText: { fontSize: 13, fontFamily: "Inter_700Bold" },
    aiBar: { height: 6, borderRadius: 3, backgroundColor: colors.border, marginTop: 8, overflow: "hidden" },
    aiBarFill: { height: "100%", borderRadius: 3, backgroundColor: colors.primary },
    usageText: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
    upgradeBtn: { margin: 16, backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    upgradeBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_700Bold" },
    manageBtn: { margin: 16, backgroundColor: colors.secondary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    manageBtnText: { color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold" },
    catRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
    catBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5, borderColor: colors.border, alignItems: "center" },
    catBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "18" },
    catText: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    catTextActive: { color: colors.primary },
    stars: { flexDirection: "row", gap: 8, marginBottom: 12 },
    starBtn: { padding: 4 },
    textarea: {
      backgroundColor: colors.secondary,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      color: colors.foreground,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      padding: 14,
      minHeight: 100,
      textAlignVertical: "top",
      marginBottom: 12,
    },
    submitBtn: { backgroundColor: colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    submitBtnText: { color: colors.primaryForeground, fontSize: 15, fontFamily: "Inter_700Bold" },
    signOutBtn: { margin: 20, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.destructive, alignItems: "center" },
    signOutText: { color: colors.destructive, fontSize: 15, fontFamily: "Inter_600SemiBold" },
  });

  const aiPercent = aiSummariesLimit > 999 ? 0 : Math.min(100, (aiSummariesUsedToday / aiSummariesLimit) * 100);

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Account</Text>
        </View>

        {/* Profile */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Profile</Text>
          <View style={s.card}>
            <View style={[s.row]}>
              <View style={s.rowIcon}><Feather name="user" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel} numberOfLines={1}>
                {user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "—"}
              </Text>
            </View>
            <View style={[s.row, s.rowLast]}>
              <View style={s.rowIcon}><Feather name="mail" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel} numberOfLines={1}>
                {user?.primaryEmailAddress?.emailAddress ?? "—"}
              </Text>
            </View>
          </View>
        </View>

        {/* Subscription */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Subscription</Text>
          <View style={s.card}>
            <View style={[s.row]}>
              <View style={s.rowIcon}><Feather name="zap" size={18} color={tierColors[tier]} /></View>
              <Text style={s.rowLabel}>Current Plan</Text>
              {isLoading ? (
                <ActivityIndicator color={colors.primary} size="small" />
              ) : (
                <View style={[s.tierBadge, { backgroundColor: tierColors[tier] + "22" }]}>
                  <Text style={[s.tierText, { color: tierColors[tier] }]}>{tierLabels[tier]}</Text>
                </View>
              )}
            </View>
            {subscriptionStatus && (
              <View style={[s.row]}>
                <View style={s.rowIcon}><Feather name="check-circle" size={18} color={colors.positive} /></View>
                <Text style={s.rowLabel}>Status</Text>
                <Text style={[s.rowValue, { color: colors.positive, textTransform: "capitalize" }]}>{subscriptionStatus}</Text>
              </View>
            )}
            {/* AI Usage */}
            <View style={[s.row, s.rowLast]}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={[s.rowIcon, { marginRight: 0 }]}><Feather name="cpu" size={18} color={colors.primary} /></View>
                  <Text style={[s.rowLabel, { flex: 0 }]}>AI Summaries Today</Text>
                </View>
                {tier === "free" ? (
                  <>
                    <View style={s.aiBar}>
                      <View style={[s.aiBarFill, { width: `${aiPercent}%`, backgroundColor: aiPercent >= 80 ? colors.negative : colors.primary }]} />
                    </View>
                    <Text style={s.usageText}>{aiSummariesUsedToday} / {aiSummariesLimit} used · {aiSummariesRemaining} remaining</Text>
                  </>
                ) : (
                  <Text style={[s.usageText, { marginTop: 4 }]}>Unlimited on {tierLabels[tier]}</Text>
                )}
              </View>
            </View>

            {tier === "free" ? (
              <TouchableOpacity style={s.upgradeBtn} onPress={() => setShowPaywall(true)}>
                <Text style={s.upgradeBtnText}>⚡ Upgrade to Pro — $9.99/mo</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={s.manageBtn} onPress={handleManageSubscription} disabled={portalLoading}>
                {portalLoading ? (
                  <ActivityIndicator color={colors.foreground} />
                ) : (
                  <Text style={s.manageBtnText}>Manage Subscription</Text>
                )}
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Feedback */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Send Feedback</Text>
          <View style={s.card}>
            <View style={{ padding: 16 }}>
              {/* Category */}
              <View style={s.catRow}>
                {categories.map((cat) => (
                  <TouchableOpacity
                    key={cat.value}
                    style={[s.catBtn, feedbackCategory === cat.value && s.catBtnActive]}
                    onPress={() => setFeedbackCategory(cat.value)}
                  >
                    <Text style={[s.catText, feedbackCategory === cat.value && s.catTextActive]}>{cat.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Star rating */}
              <View style={s.stars}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <TouchableOpacity key={star} style={s.starBtn} onPress={() => setFeedbackRating(star)}>
                    <Feather
                      name="star"
                      size={24}
                      color={feedbackRating >= star ? "#FFB800" : colors.border}
                    />
                  </TouchableOpacity>
                ))}
                {feedbackRating > 0 && (
                  <TouchableOpacity onPress={() => setFeedbackRating(0)} style={{ marginLeft: 8, justifyContent: "center" }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>clear</Text>
                  </TouchableOpacity>
                )}
              </View>

              <TextInput
                style={s.textarea}
                placeholder="Tell us what you think, report a bug, or request a feature..."
                placeholderTextColor={colors.mutedForeground}
                multiline
                value={feedbackMessage}
                onChangeText={setFeedbackMessage}
              />
              <TouchableOpacity style={s.submitBtn} onPress={handleSubmitFeedback} disabled={feedbackLoading}>
                {feedbackLoading ? (
                  <ActivityIndicator color={colors.primaryForeground} />
                ) : (
                  <Text style={s.submitBtnText}>Submit Feedback</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Dev Tools (hidden — tap version label 5 times to reveal) */}
        {devToolsVisible && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Developer Tools</Text>
            <View style={s.card}>
              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Feather name="tool" size={16} color={colors.warning} />
                  <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Subscription Tier Override</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 14, lineHeight: 18 }}>
                  Switch your account tier to test tier-gated features. Changes persist in the database.
                </Text>
                {devTierLoading ? (
                  <ActivityIndicator color={colors.primary} style={{ marginVertical: 10 }} />
                ) : (
                  <View style={{ flexDirection: "row", gap: 8 }}>
                    {(["free", "pro", "premium"] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", borderWidth: 1.5 },
                          tier === t
                            ? { backgroundColor: tierColors[t] + "22", borderColor: tierColors[t] }
                            : { backgroundColor: colors.secondary, borderColor: colors.border },
                        ]}
                        onPress={() => handleDevSetTier(t)}
                      >
                        <Text style={[
                          { fontSize: 13, fontFamily: "Inter_700Bold" },
                          { color: tier === t ? tierColors[t] : colors.mutedForeground },
                        ]}>
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <View style={{ padding: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <Feather name="credit-card" size={16} color={colors.primary} />
                  <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_700Bold" }}>Payment Testing</Text>
                </View>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 14, lineHeight: 18 }}>
                  Open the upgrade flow to test the checkout experience. Use Stripe test card: 4242 4242 4242 4242.
                </Text>
                <TouchableOpacity
                  style={{ backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 11, alignItems: "center", marginBottom: 8 }}
                  onPress={() => setShowPaywall(true)}
                >
                  <Text style={{ color: colors.primaryForeground, fontFamily: "Inter_700Bold", fontSize: 14 }}>Open Paywall / Upgrade Flow</Text>
                </TouchableOpacity>
              </View>

              <View style={{ height: 1, backgroundColor: colors.border }} />

              <TouchableOpacity
                style={{ padding: 16, flexDirection: "row", alignItems: "center", gap: 10 }}
                onPress={() => setDevToolsVisible(false)}
              >
                <Feather name="eye-off" size={15} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Hide Developer Tools</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Version — tap 5× to reveal dev tools */}
        <TouchableOpacity onPress={handleVersionTap} activeOpacity={0.7} style={{ alignItems: "center", paddingVertical: 8 }}>
          <Text style={{ color: colors.border, fontSize: 12, fontFamily: "Inter_400Regular" }}>
            StockClarify v1.0{devTapCount > 0 ? ` (${5 - devTapCount} more taps…)` : ""}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>

      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} triggerReason="general" />
    </SafeAreaView>
  );
}
