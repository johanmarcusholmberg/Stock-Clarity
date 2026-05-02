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
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { DrumRollPicker } from "@/components/DrumRollPicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useTheme } from "@/context/ThemeContext";
import { confirmAsync } from "@/utils/confirm";
import { useSubscription } from "@/context/SubscriptionContext";
import { useWatchlist } from "@/context/WatchlistContext";
import { useNotify } from "@/context/NotifyContext";
import { PaywallSheet } from "@/components/PaywallSheet";
import { TabHintPopup } from "@/components/TabHintPopup";
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

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

type FeedbackCategory = "general" | "bug" | "feature" | "billing";
type FeatherIconName = React.ComponentProps<typeof Feather>["name"];

export default function AccountScreen() {
  const colors = useColors();
  const { theme, setTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const { signOut, userId, getToken } = useAuth();
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
  const notify = useNotify();
  const [showPaywall, setShowPaywall] = useState(false);
  const [feedbackCategory, setFeedbackCategory] = useState<FeedbackCategory>("general");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Privacy / Terms live on the API host but are NOT under /api — strip suffix.
  const LEGAL_BASE = API_BASE.replace(/\/api$/, "") + "/legal";
  const SUPPORT_EMAIL =
    process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? "support@stockclarify.app";
  const APP_VERSION = "1.0.1";

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

  const performSignOut = async () => {
    // Clear all user-specific cached data so the next user starts clean
    try {
      await AsyncStorage.multiRemove([
        "@stockclarify_stocks_v2",
        "@stockclarify_alerts_read",
        "@stockclarify_folders_v1",
        "@stockclarify_active_folder_v1",
        "@stockclarify_digest_daily",
        "@stockclarify_digest_weekly",
        "@stockclarify_digest_daily_date",
        "@stockclarify_digest_weekly_date",
        "@stockclarify_show_percent",
        "@stockclarify_benchmark_v1",
      ]);
    } catch {}
    // Terminate the Clerk session
    try {
      await signOut();
    } catch {}
    // Replace navigation history so back-button cannot return to the app
    router.replace("/(auth)/sign-in");
  };

  const handleSignOut = async () => {
    const ok = await confirmAsync(
      "Sign out",
      "Are you sure you want to sign out?",
      { confirmText: "Sign out", destructive: true },
    );
    if (ok) await performSignOut();
  };

  const handleDeleteAccount = async () => {
    // Two-step confirmation. The second confirmation uses different,
    // unmistakable wording so an accidental double-tap can't blow it through.
    // The first step explicitly tells the user what will and won't be cancelled
    // automatically — IAP subscriptions must be cancelled in the App Store /
    // Play Store settings, since stores don't allow server-side cancellation.
    const iapNotice =
      Platform.OS === "ios"
        ? "\n\nIf you subscribed through the App Store, cancel that subscription in Settings → Apple ID → Subscriptions before deleting — Apple does not let us cancel it for you."
        : Platform.OS === "android"
          ? "\n\nIf you subscribed through Google Play, cancel that subscription in Play Store → Subscriptions before deleting — Google does not let us cancel it for you."
          : "";

    const ok1 = await confirmAsync(
      "Delete account?",
      `This permanently removes your watchlist, holdings, alerts, and account profile. Any web (Stripe) subscription will be cancelled automatically.${iapNotice}\n\nYou won't be able to recover this data.`,
      { confirmText: "Continue", destructive: true },
    );
    if (!ok1) return;

    const ok2 = await confirmAsync(
      "Are you absolutely sure?",
      "This action cannot be undone. Your account will be deleted immediately.",
      { confirmText: "Delete forever", destructive: true },
    );
    if (!ok2) return;

    setDeleting(true);
    try {
      const token = await getToken();
      const res = await fetch(`${API_BASE}/account`, {
        method: "DELETE",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        Alert.alert(
          "Couldn't delete account",
          body.error ??
            "Something went wrong. Please try again or email support.",
        );
        return;
      }
      // performSignOut clears local cache, calls Clerk signOut (which is a no-op
      // now since the user is gone server-side), and routes to /(auth)/sign-in.
      await performSignOut();
    } catch {
      Alert.alert(
        "Network error",
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const openLegal = (page: "privacy" | "terms") => {
    Linking.openURL(`${LEGAL_BASE}/${page}`).catch(() =>
      Alert.alert("Couldn't open", "Please try again."),
    );
  };

  const openSupport = () => {
    Linking.openURL(
      `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("StockClarify support")}`,
    ).catch(() =>
      Alert.alert("No email app", `Email us at ${SUPPORT_EMAIL}`),
    );
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
        const ok = await confirmAsync(
          "No billing account",
          "There's no Stripe billing account linked to your profile. This can happen if your plan was activated manually. To manage billing, please subscribe through the app.",
          { confirmText: "View Plans" },
        );
        if (ok) setShowPaywall(true);
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
    signOutBtn: { margin: 20, marginBottom: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.destructive, alignItems: "center" },
    signOutText: { color: colors.destructive, fontSize: 15, fontFamily: "Inter_600SemiBold" },
    disclaimer: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      lineHeight: 16,
      marginTop: 10,
      paddingHorizontal: 4,
    },
    dangerZone: {
      marginTop: 20,
      marginHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    dangerTitle: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 10,
      textAlign: "center",
    },
    deleteBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      paddingVertical: 12,
      borderRadius: 10,
      backgroundColor: colors.destructive + "12",
    },
    deleteBtnText: {
      color: colors.destructive,
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
    },
    deleteHint: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      textAlign: "center",
      marginTop: 8,
      paddingHorizontal: 16,
      lineHeight: 15,
    },
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
                        <TouchableOpacity style={s.nameActionBtn} onPress={handleSaveName} accessibilityLabel="Save name" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Feather name="check" size={18} color={colors.primary} />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.nameActionBtn} onPress={handleCancelEditName} accessibilityLabel="Cancel editing" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Feather name="x" size={18} color={colors.mutedForeground} />
                        </TouchableOpacity>
                      </>
                    )}
                  </View>
                </>
              ) : (
                <>
                  <Text style={s.rowLabel} numberOfLines={1}>{displayName}</Text>
                  <TouchableOpacity onPress={handleEditName} style={{ padding: 4 }} accessibilityLabel="Edit name" hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}>
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

        {/* Appearance */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Appearance</Text>
          <View style={s.card}>
            <View style={[s.row, s.rowLast]}>
              <View style={s.rowIcon}>
                <Feather name={theme === "bright" ? "sun" : "moon"} size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowLabel}>Bright Mode</Text>
                <Text style={[s.rowValue, { fontSize: 12, marginTop: 1 }]}>
                  {theme === "bright" ? "Light background · active" : "Dark background · default"}
                </Text>
              </View>
              <Switch
                value={theme === "bright"}
                onValueChange={(v) => setTheme(v ? "bright" : "dark")}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={theme === "bright" ? colors.primaryForeground : "#FFFFFF"}
              />
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

        {/* Stock notifications (news + earnings, Phase 3.3) */}
        {notify.enabled && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Stock Notifications</Text>
            <View style={s.card}>
              <TouchableOpacity
                style={[s.row, s.rowLast]}
                onPress={() => router.push("/(tabs)/notifications")}
                activeOpacity={0.7}
              >
                <View style={s.rowIcon}>
                  <Feather name="bell" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { marginBottom: 0 }]}>News & earnings</Text>
                  <Text style={[s.rowValue, { fontSize: 11, marginTop: 2 }]}>
                    {notify.defaults.news?.status === "active" || notify.defaults.earnings?.status === "active"
                      ? "On"
                      : notify.defaults.news || notify.defaults.earnings
                        ? "Off"
                        : "Not set up yet"}
                  </Text>
                </View>
                <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Notifications */}
        {notifPrefs && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Watchlist Notifications</Text>
            <View style={s.card}>
              {/* Master toggle */}
              <View style={[s.row, !notifPrefs.enabled && s.rowLast]}>
                <View style={s.rowIcon}>
                  <Feather name="bell" size={18} color={notifPrefs.enabled ? colors.primary : colors.mutedForeground} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.rowLabel, { marginBottom: 0 }]}>Notifications</Text>
                  <Text style={[s.rowValue, { fontSize: 11, marginTop: 2 }]}>
                    {notifPrefs.enabled ? describeSchedule(notifPrefs) : "Off"}
                  </Text>
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
                  <View style={[s.row, { borderBottomWidth: 0, paddingBottom: 8 }]}>
                    <View style={s.rowIcon}><Feather name="calendar" size={18} color={colors.primary} /></View>
                    <Text style={[s.rowLabel]}>Frequency</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
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
                  <View style={[s.row, { borderBottomWidth: 0, paddingBottom: 8 }]}>
                    <View style={s.rowIcon}><Feather name="send" size={18} color={colors.primary} /></View>
                    <Text style={[s.rowLabel]}>Delivery</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingBottom: 16 }}>
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
                      <View style={[s.row, { borderBottomWidth: 0, paddingBottom: 8 }]}>
                        <View style={s.rowIcon}><Feather name="sliders" size={18} color={colors.primary} /></View>
                        <Text style={[s.rowLabel]}>Alert Types</Text>
                      </View>
                      <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 8 }}>
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
                  <TouchableOpacity key={star} style={s.starBtn} onPress={() => setFeedbackRating(star)} accessibilityLabel={`Rate ${star} star${star > 1 ? "s" : ""}`} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
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

        {/* About & Legal */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>About & Legal</Text>
          <View style={s.card}>
            <TouchableOpacity
              style={s.row}
              onPress={() => openLegal("privacy")}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel="Open Privacy Policy"
            >
              <View style={s.rowIcon}><Feather name="shield" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>Privacy Policy</Text>
              <Feather name="external-link" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.row}
              onPress={() => openLegal("terms")}
              activeOpacity={0.7}
              accessibilityRole="link"
              accessibilityLabel="Open Terms of Service"
            >
              <View style={s.rowIcon}><Feather name="file-text" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>Terms of Service</Text>
              <Feather name="external-link" size={14} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity
              style={s.row}
              onPress={openSupport}
              activeOpacity={0.7}
              accessibilityLabel="Email support"
            >
              <View style={s.rowIcon}><Feather name="life-buoy" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>Contact Support</Text>
              <Text style={s.rowValue} numberOfLines={1}>{SUPPORT_EMAIL}</Text>
            </TouchableOpacity>
            <View style={[s.row, s.rowLast]}>
              <View style={s.rowIcon}><Feather name="info" size={18} color={colors.primary} /></View>
              <Text style={s.rowLabel}>Version</Text>
              <Text style={s.rowValue}>{APP_VERSION}</Text>
            </View>
          </View>
          <Text style={s.disclaimer}>
            Not investment advice. Market data and AI summaries are for informational
            purposes only and may be delayed or inaccurate. Always do your own research
            and consult a licensed financial advisor before making investment decisions.
          </Text>
        </View>

        {/* Sign out */}
        <TouchableOpacity style={s.signOutBtn} onPress={handleSignOut}>
          <Text style={s.signOutText}>Sign Out</Text>
        </TouchableOpacity>

        {/* Danger zone — Delete account (Apple App Store requirement) */}
        <View style={s.dangerZone}>
          <Text style={s.dangerTitle}>Danger Zone</Text>
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={handleDeleteAccount}
            disabled={deleting}
            accessibilityLabel="Permanently delete account"
          >
            {deleting ? (
              <ActivityIndicator color={colors.destructive} />
            ) : (
              <>
                <Feather name="trash-2" size={16} color={colors.destructive} />
                <Text style={s.deleteBtnText}>Delete account</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={s.deleteHint}>
            Permanently removes your data. Web (Stripe) subscriptions are cancelled automatically; App Store and Play Store subscriptions must be cancelled in your store settings.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>

      <PaywallSheet visible={showPaywall} onClose={() => setShowPaywall(false)} triggerReason="general" currentTier={tier} />

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
      <TabHintPopup
        tabKey="account"
        hint="The Account tab is where you manage your profile, subscription plan, notification preferences, and send us feedback."
      />
    </SafeAreaView>
  );
}
