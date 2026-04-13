import React, { useState, useRef, useEffect } from "react";
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
  Animated,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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
type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

export default function AccountScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
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
  } = useSubscription();
  const [showPaywall, setShowPaywall] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastAnimRef = useRef<ReturnType<typeof Animated.sequence> | null>(null);

  const showToast = () => {
    if (toastAnimRef.current) toastAnimRef.current.stop();
    toastOpacity.setValue(0);
    toastAnimRef.current = Animated.sequence([
      Animated.timing(toastOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
      Animated.delay(2500),
      Animated.timing(toastOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
    ]);
    toastAnimRef.current.start();
  };

  useEffect(() => {
    return () => {
      if (toastAnimRef.current) toastAnimRef.current.stop();
    };
  }, []);

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

  const handleManageSubscription = async () => {
    if (tier === "free") {
      setShowPaywall(true);
      return;
    }
    setPortalLoading(true);
    try {
      const { url, error } = await openPortal();
      if (url) {
        await Linking.openURL(url);
      } else if (error === "No subscription found") {
        Alert.alert(
          "No billing account",
          "There's no Stripe billing account linked to your profile. This can happen if your plan was activated manually. To manage billing, please subscribe through the app.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "View Plans", onPress: () => setShowPaywall(true) },
          ]
        );
      } else {
        Alert.alert("Unavailable", "Could not open the subscription portal. Please try again later.");
      }
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
        showToast();
      } else {
        Alert.alert("Error", "Failed to submit feedback. Please try again.");
      }
    } catch {
      Alert.alert("Error", "Network error. Please check your connection.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleEditName = () => {
    setNameInput(user?.firstName ?? "");
    setEditingName(true);
  };

  const handleCancelEditName = () => {
    setEditingName(false);
    setNameInput("");
  };

  const handleSaveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert("Name required", "Please enter a display name.");
      return;
    }
    if (!user) {
      Alert.alert("Error", "User session not available. Please try again.");
      return;
    }
    setNameSaving(true);
    try {
      await user.update({ firstName: trimmed });
      setEditingName(false);
      setNameInput("");
    } catch {
      Alert.alert("Error", "Could not save your display name. Please try again.");
    } finally {
      setNameSaving(false);
    }
  };

  const categories: { value: FeedbackCategory; label: string; icon: FeatherIconName }[] = [
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
    catBtn: {
      flex: 1,
      paddingVertical: 10,
      paddingHorizontal: 4,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
      justifyContent: "center",
    },
    catBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "18" },
    catText: { color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 4 },
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
    nameInput: {
      flex: 1,
      color: colors.foreground,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      borderBottomWidth: 1,
      borderBottomColor: colors.primary,
      paddingVertical: 2,
      marginRight: 8,
    },
    nameEditActions: { flexDirection: "row", alignItems: "center", gap: 8 },
    nameActionBtn: { padding: 4 },
  });

  const aiPercent = aiSummariesLimit > 999 ? 0 : Math.min(100, (aiSummariesUsedToday / aiSummariesLimit) * 100);

  const displayName = user?.firstName || user?.fullName || user?.username || user?.primaryEmailAddress?.emailAddress || "—";

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          top: insets.top + 12,
          left: 16,
          right: 16,
          zIndex: 999,
          opacity: toastOpacity,
          backgroundColor: "#22c55e",
          borderRadius: 14,
          paddingVertical: 14,
          paddingHorizontal: 18,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 6,
        }}
      >
        <Feather name="check-circle" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold", flex: 1 }}>
          Feedback sent — thank you!
        </Text>
      </Animated.View>
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Text style={s.headerTitle}>Account</Text>
        </View>

        {/* Profile */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Profile</Text>
          <View style={s.card}>
            {/* Editable Display Name */}
            <View style={[s.row]}>
              <View style={s.rowIcon}><Feather name="user" size={18} color={colors.primary} /></View>
              {editingName ? (
                <>
                  <TextInput
                    style={s.nameInput}
                    value={nameInput}
                    onChangeText={setNameInput}
                    placeholder="Display name"
                    placeholderTextColor={colors.mutedForeground}
                    autoFocus
                    returnKeyType="done"
                    onSubmitEditing={handleSaveName}
                  />
                  <View style={s.nameEditActions}>
                    {nameSaving ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <>
                        <TouchableOpacity style={s.nameActionBtn} onPress={handleSaveName}>
                          <Feather name="check" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.nameActionBtn} onPress={handleCancelEditName}>
                          <Feather name="x" size={18} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.rowLabel} numberOfLines={1}>{displayName}</Text>
                  <TouchableOpacity onPress={handleEditName} style={{ padding: 4 }}>
                    <Feather name="edit-2" size={15} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </>
              )}
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
                <Text style={s.upgradeBtnText}>⚡ Upgrade — Pro from $4.99/mo</Text>
              </TouchableOpacity>
            ) : tier === "pro" ? (
              <View>
                <TouchableOpacity style={s.upgradeBtn} onPress={() => setShowPaywall(true)}>
                  <Text style={s.upgradeBtnText}>⬆ Upgrade to Premium — $9.99/mo</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.manageBtn} onPress={handleManageSubscription} disabled={portalLoading}>
                  {portalLoading ? (
                    <ActivityIndicator color={colors.foreground} />
                  ) : (
                    <Text style={s.manageBtnText}>Manage Subscription</Text>
                  )}
                </TouchableOpacity>
              </View>
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
                    <Feather
                      name={cat.icon}
                      size={16}
                      color={feedbackCategory === cat.value ? colors.primary : colors.mutedForeground}
                    />
                    <Text numberOfLines={1} style={[s.catText, feedbackCategory === cat.value && s.catTextActive]}>{cat.label}</Text>
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

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        <Text style={{ color: colors.border, fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", paddingVertical: 8 }}>
          StockClarify v1.0
        </Text>

        <View style={{ height: 40 }} />
      </ScrollView>

      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} triggerReason="general" currentTier={tier} />
    </SafeAreaView>
  );
}
