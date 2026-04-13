import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Switch,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Linking,
  Platform,
  Animated,
  Modal,
} from "react-native";
import { DrumRollPicker } from "@/components/DrumRollPicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { resetTourForUser } from "@/components/OnboardingTour";
import { OnboardingTour } from "@/components/OnboardingTour";
import {
  loadNotificationPrefs,
  saveNotificationPrefs,
  scheduleWatchlistNotification,
  cancelAllNotifications,
  requestNotificationPermission,
  describeSchedule,
  formatNotifTime,
  ALERT_TYPE_OPTIONS,
  type NotificationPrefs,
  type NotificationFrequency,
  type NotificationMethod,
  type AlertType,
} from "@/services/NotificationService";

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
  const { stocks } = useWatchlist();
  const [showPaywall, setShowPaywall] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs | null>(null);
  const [notifSaving, setNotifSaving] = useState(false);
  const [timePickerVisible, setTimePickerVisible] = useState(false);

  const toH12 = (h24: number) => h24 === 0 ? 12 : h24 > 12 ? h24 - 12 : h24;
  const toH24 = (h12: number, ampm: "AM" | "PM") => {
    if (ampm === "AM") return h12 === 12 ? 0 : h12;
    return h12 === 12 ? 12 : h12 + 12;
  };
  const currentH12 = notifPrefs ? toH12(notifPrefs.hour) : 8;
  const currentAMPM: "AM" | "PM" = notifPrefs ? (notifPrefs.hour < 12 ? "AM" : "PM") : "AM";
  const [pickerH12, setPickerH12] = useState(currentH12);
  const [pickerMinute, setPickerMinute] = useState(notifPrefs?.minute ?? 0);
  const [pickerAMPM, setPickerAMPM] = useState<"AM" | "PM">(currentAMPM);

  const toastOpacity = useRef(new Animated.Value(0)).current;
  const toastAnimRef = useRef<ReturnType<typeof Animated.sequence> | null>(null);

  useEffect(() => {
    loadNotificationPrefs().then(setNotifPrefs);
  }, []);

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

  const handleReplayTour = async () => {
    if (userId) {
      await resetTourForUser(userId);
    }
    setShowTour(true);
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

  const watchlistTickers = Object.keys(stocks);

  const handleNotifUpdate = async (updater: (p: NotificationPrefs) => NotificationPrefs) => {
    if (!notifPrefs) return;
    const updated = updater(notifPrefs);
    setNotifPrefs(updated);
    setNotifSaving(true);
    try {
      if (updated.enabled && (updated.method === "push" || updated.method === "both")) {
        const granted = await requestNotificationPermission();
        if (!granted) {
          Alert.alert(
            "Permission needed",
            "Please enable notifications in your device settings to receive watchlist updates.",
          );
          const fixed = { ...updated, method: "email" as NotificationMethod };
          setNotifPrefs(fixed);
          await saveNotificationPrefs(fixed);
          return;
        }
      }
      await saveNotificationPrefs(updated);
      if (updated.enabled) {
        await scheduleWatchlistNotification(updated, watchlistTickers);
      } else {
        await cancelAllNotifications();
      }
    } finally {
      setNotifSaving(false);
    }
  };

  const HOURS = ["1","2","3","4","5","6","7","8","9","10","11","12"];
  const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

  const openTimePicker = useCallback(() => {
    if (!notifPrefs) return;
    setPickerH12(toH12(notifPrefs.hour));
    setPickerMinute(notifPrefs.minute ?? 0);
    setPickerAMPM(notifPrefs.hour < 12 ? "AM" : "PM");
    setTimePickerVisible(true);
  }, [notifPrefs]);

  const confirmTimePicker = useCallback(() => {
    const h24 = toH24(pickerH12, pickerAMPM);
    setTimePickerVisible(false);
    if (!notifPrefs) return;
    handleNotifUpdate((p) => ({ ...p, hour: h24, minute: pickerMinute }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerH12, pickerMinute, pickerAMPM, notifPrefs]);

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
    timePickerOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 24 },
    timePickerSheet: { width: "100%", maxWidth: 340, borderRadius: 20, borderWidth: 1, padding: 24, gap: 20 },
    timePickerTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
    timePickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 },
    timePickerColon: { fontSize: 28, fontFamily: "Inter_700Bold", marginHorizontal: 4, marginBottom: 4 },
    timePickerAMPM: { gap: 8, marginLeft: 12 },
    timePickerPeriodBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, alignItems: "center" },
    timePickerPeriodText: { fontSize: 14, fontFamily: "Inter_700Bold" },
    timePickerButtons: { flexDirection: "row", gap: 10 },
    timePickerCancelBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1, alignItems: "center" },
    timePickerConfirmBtn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: "center" },
    timePickerBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
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
            <View style={[s.row, tier !== "free" ? s.rowLast : {}]}>
              <View style={s.rowIcon}><Feather name="cpu" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>AI Summaries</Text>
              {tier !== "free" ? (
                <Text style={[s.rowValue, { color: colors.positive }]}>Unlimited</Text>
              ) : (
                <Text style={s.rowValue}>{aiSummariesRemaining} left today</Text>
              )}
            </View>
            {tier === "free" && (
              <View style={[s.row, s.rowLast, { flexDirection: "column", alignItems: "stretch", gap: 6, paddingTop: 4 }]}>
                <View style={s.aiBar}>
                  <View style={[s.aiBarFill, { width: `${aiPercent}%`, backgroundColor: aiPercent >= 80 ? colors.negative : colors.primary }]} />
                </View>
                <Text style={s.usageText}>{aiSummariesUsedToday} / {aiSummariesLimit} used</Text>
              </View>
            )}

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

        {/* Notifications */}
        {notifPrefs && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Watchlist Notifications</Text>
            <View style={s.card}>
              {/* Master toggle */}
              <View style={[s.row]}>
                <View style={s.rowIcon}><Feather name="bell" size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { marginBottom: 0 }]}>Notifications</Text>
                  {notifPrefs.enabled && (
                    <Text style={[s.rowValue, { fontSize: 11, marginTop: 2 }]}>{describeSchedule(notifPrefs)}</Text>
                  )}
                </View>
                {notifSaving ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Switch
                    value={notifPrefs.enabled}
                    onValueChange={(v) => handleNotifUpdate((p) => ({ ...p, enabled: v }))}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#fff"
                  />
                )}
              </View>

              {notifPrefs.enabled && (
                <>
                  {/* Frequency */}
                  <View style={[s.row]}>
                    <View style={s.rowIcon}><Feather name="calendar" size={18} color={colors.primary} /></View>
                    <Text style={[s.rowLabel]}>Frequency</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
                    {(["daily", "weekly", "monthly"] as NotificationFrequency[]).map((f) => (
                      <TouchableOpacity
                        key={f}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                          borderColor: notifPrefs.frequency === f ? colors.primary : colors.border,
                          backgroundColor: notifPrefs.frequency === f ? colors.primary + "18" : "transparent",
                          alignItems: "center",
                        }}
                        onPress={() => handleNotifUpdate((p) => ({ ...p, frequency: f }))}
                      >
                        <Text style={{
                          fontSize: 12, fontFamily: "Inter_600SemiBold",
                          color: notifPrefs.frequency === f ? colors.primary : colors.mutedForeground,
                          textTransform: "capitalize",
                        }}>{f}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Delivery time — tappable row opens drum-roll modal */}
                  <TouchableOpacity style={[s.row]} onPress={openTimePicker} activeOpacity={0.7}>
                    <View style={s.rowIcon}><Feather name="clock" size={18} color={colors.primary} /></View>
                    <Text style={[s.rowLabel]}>Delivery Time</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <Text style={[s.rowValue]}>{formatNotifTime(notifPrefs.hour, notifPrefs.minute ?? 0)}</Text>
                      <Feather name="chevron-right" size={14} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>

                  {/* Delivery method */}
                  <View style={[s.row]}>
                    <View style={s.rowIcon}><Feather name="send" size={18} color={colors.primary} /></View>
                    <Text style={[s.rowLabel]}>Delivery</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}>
                    {([
                      { value: "push", label: "Push", icon: "smartphone" },
                      { value: "email", label: "Email", icon: "mail" },
                      { value: "both", label: "Both", icon: "layers" },
                    ] as { value: NotificationMethod; label: string; icon: FeatherIconName }[]).map((m) => (
                      <TouchableOpacity
                        key={m.value}
                        style={{
                          flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1.5,
                          borderColor: notifPrefs.method === m.value ? colors.primary : colors.border,
                          backgroundColor: notifPrefs.method === m.value ? colors.primary + "18" : "transparent",
                          alignItems: "center", gap: 4,
                        }}
                        onPress={() => handleNotifUpdate((p) => ({ ...p, method: m.value }))}
                      >
                        <Feather name={m.icon} size={14} color={notifPrefs.method === m.value ? colors.primary : colors.mutedForeground} />
                        <Text style={{
                          fontSize: 11, fontFamily: "Inter_600SemiBold",
                          color: notifPrefs.method === m.value ? colors.primary : colors.mutedForeground,
                        }}>{m.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Email for email delivery */}
                  {(notifPrefs.method === "email" || notifPrefs.method === "both") && (
                    <View style={[s.row, s.rowLast]}>
                      <View style={s.rowIcon}><Feather name="at-sign" size={18} color={colors.primary} /></View>
                      <Text style={[s.rowLabel, { color: colors.mutedForeground, fontSize: 13 }]} numberOfLines={1}>
                        {user?.primaryEmailAddress?.emailAddress ?? "No email on file"}
                      </Text>
                    </View>
                  )}

                  {/* Alert types — shown when push delivery is selected */}
                  {(notifPrefs.method === "push" || notifPrefs.method === "both") && (
                    <>
                      <View style={[s.row]}>
                        <View style={s.rowIcon}><Feather name="sliders" size={18} color={colors.primary} /></View>
                        <Text style={[s.rowLabel]}>Alert Types</Text>
                      </View>
                      <View style={{ paddingHorizontal: 16, paddingBottom: 14, gap: 8 }}>
                        {ALERT_TYPE_OPTIONS.map((opt) => {
                          const active = notifPrefs.alertTypes?.includes(opt.key) ?? false;
                          return (
                            <TouchableOpacity
                              key={opt.key}
                              style={{
                                flexDirection: "row", alignItems: "center", gap: 12,
                                paddingVertical: 10, paddingHorizontal: 12,
                                borderRadius: 12, borderWidth: 1.5,
                                borderColor: active ? colors.primary : colors.border,
                                backgroundColor: active ? colors.primary + "12" : "transparent",
                              }}
                              onPress={() => handleNotifUpdate((p) => {
                                const current = p.alertTypes ?? [];
                                const next = active
                                  ? current.filter((t) => t !== opt.key)
                                  : [...current, opt.key];
                                return { ...p, alertTypes: next };
                              })}
                            >
                              <Feather
                                name={opt.icon as any}
                                size={16}
                                color={active ? colors.primary : colors.mutedForeground}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: active ? colors.foreground : colors.mutedForeground }}>
                                  {opt.label}
                                </Text>
                                <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 }}>
                                  {opt.description}
                                </Text>
                              </View>
                              <View style={{
                                width: 20, height: 20, borderRadius: 10, borderWidth: 1.5,
                                borderColor: active ? colors.primary : colors.border,
                                backgroundColor: active ? colors.primary : "transparent",
                                alignItems: "center", justifyContent: "center",
                              }}>
                                {active && <Feather name="check" size={11} color={colors.primaryForeground} />}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                        <Text style={{ fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 2 }}>
                          Push notifications require the app installed natively on your device.
                        </Text>
                      </View>
                    </>
                  )}

                  {notifPrefs.method === "email" && (
                    <View style={[s.row]}>
                      <Feather name="info" size={14} color={colors.mutedForeground} style={{ marginRight: 8 }} />
                      <Text style={{ color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 }}>
                        Email digests include all significant movements across your watchlist.
                      </Text>
                    </View>
                  )}
                </>
              )}
            </View>
          </View>
        )}

        {/* Help */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Help</Text>
          <View style={s.card}>
            <TouchableOpacity style={[s.row, s.rowLast]} onPress={handleReplayTour}>
              <View style={s.rowIcon}><Feather name="map" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>Take the tour</Text>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>
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

      {showTour && (
        <OnboardingTour forceShow onComplete={() => setShowTour(false)} />
      )}

      {/* ── Time Picker Modal ── */}
      <Modal
        visible={timePickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setTimePickerVisible(false)}
      >
        <TouchableOpacity
          style={s.timePickerOverlay}
          activeOpacity={1}
          onPress={() => setTimePickerVisible(false)}
        >
          <View
            style={[s.timePickerSheet, { backgroundColor: colors.card, borderColor: colors.border }]}
            onStartShouldSetResponder={() => true}
          >
            <Text style={[s.timePickerTitle, { color: colors.foreground }]}>Delivery Time</Text>
            <View style={s.timePickerRow}>
              <DrumRollPicker
                items={HOURS}
                selectedIndex={pickerH12 - 1}
                onSelect={(i) => setPickerH12(i + 1)}
                width={72}
              />
              <Text style={[s.timePickerColon, { color: colors.foreground }]}>:</Text>
              <DrumRollPicker
                items={MINUTES}
                selectedIndex={pickerMinute}
                onSelect={(i) => setPickerMinute(i)}
                width={72}
              />
              <View style={s.timePickerAMPM}>
                {(["AM", "PM"] as const).map((period) => (
                  <TouchableOpacity
                    key={period}
                    style={[
                      s.timePickerPeriodBtn,
                      {
                        backgroundColor: pickerAMPM === period ? colors.primary : colors.secondary,
                        borderColor: pickerAMPM === period ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setPickerAMPM(period)}
                  >
                    <Text style={[s.timePickerPeriodText, { color: pickerAMPM === period ? colors.primaryForeground : colors.mutedForeground }]}>
                      {period}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.timePickerButtons}>
              <TouchableOpacity
                style={[s.timePickerCancelBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
                onPress={() => setTimePickerVisible(false)}
              >
                <Text style={[s.timePickerBtnText, { color: colors.mutedForeground }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.timePickerConfirmBtn, { backgroundColor: colors.primary }]}
                onPress={confirmTimePicker}
              >
                <Text style={[s.timePickerBtnText, { color: colors.primaryForeground }]}>Set Time</Text>
              </TouchableOpacity>
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
