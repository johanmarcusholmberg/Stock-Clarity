import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useAuth, useUser } from "@/lib/clerk";
import { useColors } from "@/hooks/useColors";
import { useSubscription, Tier } from "@/context/SubscriptionContext";

import { getApiBase } from "../../../lib/apiBase";
const API_BASE = getApiBase();

const ADMIN_URL: string | null = (() => {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "");
  if (!apiUrl) return null;
  return apiUrl.replace(/\/api$/, "") + "/admin";
})();

interface UserRow {
  clerk_user_id: string;
  email: string;
  tier: string;
  stripe_customer_id: string | null;
  created_at: string;
  updated_at: string;
  watchlist_count: number;
  folder_count: number;
  events_total: number;
  days_active: number;
  days_since_joined: number;
}

interface StatsData {
  users: { total: string; pro: string; premium: string };
  errors: { total: string; today: string };
  feedback: { total: string; avg_rating: string };
  eventHistory: Array<{ date: string; count: string }>;
  eventsToday?: number;
  uniqueStocksToday?: number;
  avgRating?: number;
}

interface PremiumFunnelRow {
  feature: string;
  impressions: string;
  cta_clicks: string;
  paywall_opens: string;
  checkouts: string;
  first_uses: string;
}

export default function AdminPanelScreen() {
  const colors = useColors();
  const router = useRouter();
  const { userId } = useAuth();
  const { user } = useUser();
  const { tier, isAdmin, subscriptionToolsAllowed, adminOverrideTier, refresh: refreshSub } = useSubscription();

  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [funnel, setFunnel] = useState<PremiumFunnelRow[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [settingTier, setSettingTier] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [activeSection, setActiveSection] = useState<"tiers" | "users" | "stats" | "funnel">("tiers");

  const email = user?.primaryEmailAddress?.emailAddress ?? "";

  const fetchUsers = useCallback(async () => {
    if (!email) return;
    setUsersLoading(true);
    try {
      const res = await fetch(`${API_BASE}/admin/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requesterEmail: email }),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users ?? []);
      }
    } finally {
      setUsersLoading(false);
    }
  }, [email]);

  const fetchStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analytics/summary`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } finally {
      setStatsLoading(false);
    }
  }, []);

  const fetchFunnel = useCallback(async () => {
    if (!email) return;
    setFunnelLoading(true);
    try {
      const res = await fetch(
        `${API_BASE}/admin/premium-funnel?email=${encodeURIComponent(email)}&days=30`,
      );
      if (res.ok) {
        const data = await res.json();
        setFunnel(Array.isArray(data.funnel) ? data.funnel : []);
      }
    } finally {
      setFunnelLoading(false);
    }
  }, [email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([fetchUsers(), fetchStats(), fetchFunnel(), refreshSub()]);
    setRefreshing(false);
  }, [fetchUsers, fetchStats, fetchFunnel, refreshSub]);

  useEffect(() => {
    fetchUsers();
    fetchStats();
    fetchFunnel();
  }, []);

  const setMyTier = async (newTier: Tier) => {
    setSettingTier(newTier);
    const ok = await adminOverrideTier(newTier);
    setSettingTier(null);
    if (ok) {
      Alert.alert("Tier updated", `Your tier is now: ${newTier.toUpperCase()}`);
      refreshSub();
    } else {
      Alert.alert("Error", "Failed to update tier. Make sure you are signed in as an admin.");
    }
  };

  const setUserTier = async (targetUserId: string, targetEmail: string, newTier: Tier) => {
    setSettingTier(targetUserId + newTier);
    const ok = await adminOverrideTier(newTier, targetUserId);
    setSettingTier(null);
    if (ok) {
      Alert.alert("Done", `${targetEmail} is now on ${newTier.toUpperCase()}`);
      fetchUsers();
    } else {
      Alert.alert("Error", "Failed to update tier");
    }
  };

  const tierColors: Record<string, string> = {
    free: colors.mutedForeground,
    pro: colors.primary,
    premium: "#FFB800",
  };

  const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      paddingHorizontal: 20,
      paddingTop: 16,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
    },
    headerIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: "#FF4757" + "22",
      alignItems: "center",
      justifyContent: "center",
    },
    headerTitle: { color: colors.foreground, fontSize: 22, fontFamily: "Inter_700Bold" },
    headerSub: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_400Regular" },
    tabs: {
      flexDirection: "row",
      paddingHorizontal: 20,
      paddingVertical: 12,
      gap: 8,
    },
    tabBtn: {
      flex: 1,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: colors.secondary,
      alignItems: "center",
    },
    tabBtnActive: { backgroundColor: colors.primary },
    tabText: { color: colors.mutedForeground, fontSize: 12, fontFamily: "Inter_600SemiBold" },
    tabTextActive: { color: colors.primaryForeground },
    section: { paddingHorizontal: 20, paddingBottom: 12 },
    sectionTitle: {
      color: colors.mutedForeground,
      fontSize: 11,
      fontFamily: "Inter_700Bold",
      textTransform: "uppercase",
      letterSpacing: 1,
      marginBottom: 12,
      marginTop: 4,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 20,
      marginBottom: 12,
    },
    tierRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    tierBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: "center",
    },
    tierBtnActive: { borderColor: colors.primary, backgroundColor: colors.primary + "18" },
    tierText: { fontSize: 13, fontFamily: "Inter_700Bold", color: colors.mutedForeground },
    tierTextActive: { color: colors.primary },
    currentTierBadge: {
      alignSelf: "flex-start",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 20,
      marginTop: 8,
    },
    currentTierText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    userRow: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    userEmail: { flex: 1, color: colors.foreground, fontSize: 13, fontFamily: "Inter_400Regular" },
    userTierBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 10,
      marginRight: 8,
    },
    miniTierBtn: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    miniTierBtnText: { fontSize: 10, fontFamily: "Inter_700Bold", color: colors.mutedForeground },
    manageBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary,
      backgroundColor: colors.primary + "14",
    },
    manageText: { color: colors.primary, fontSize: 11, fontFamily: "Inter_700Bold" },
    statRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      paddingVertical: 8,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    statLabel: { color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" },
    statValue: { color: colors.foreground, fontSize: 14, fontFamily: "Inter_600SemiBold" },
    warningBanner: {
      backgroundColor: "#FF4757" + "22",
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      flexDirection: "row",
      gap: 8,
      alignItems: "center",
    },
    warningText: { color: "#FF4757", fontSize: 13, fontFamily: "Inter_500Medium", flex: 1 },
    funnelRow: { flexDirection: "row", alignItems: "center" },
    funnelCellFeature: {
      flex: 1.8,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
    },
    funnelCellNum: {
      flex: 1,
      fontSize: 12,
      fontFamily: "Inter_600SemiBold",
      textAlign: "right",
      fontVariant: ["tabular-nums"],
    },
  });

  if (!isAdmin) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <Feather name="lock" size={40} color={colors.mutedForeground} />
          <Text style={{ color: colors.foreground, fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 16 }}>
            Admin Access Only
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", marginTop: 8, textAlign: "center" }}>
            Your account ({email || "unknown"}) does not have admin access.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Feather name="shield" size={18} color="#FF4757" />
        </View>
        <View>
          <Text style={s.headerTitle}>Admin Panel</Text>
          <Text style={s.headerSub}>{email}</Text>
        </View>
      </View>

      {/* Section tabs */}
      <View style={s.tabs}>
        {(["tiers", "users", "stats", "funnel"] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tabBtn, activeSection === tab && s.tabBtnActive]}
            onPress={() => setActiveSection(tab)}
          >
            <Text style={[s.tabText, activeSection === tab && s.tabTextActive]}>
              {tab === "tiers" ? "My Tier" : tab === "users" ? "Users" : tab === "stats" ? "Stats" : "Funnel"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
      >
        {/* ── My Tier section ─────────────────────────────────── */}
        {activeSection === "tiers" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Override My Subscription Tier</Text>
            <View style={s.warningBanner}>
              <Feather name="alert-triangle" size={14} color="#FF4757" />
              <Text style={s.warningText}>
                This changes what features you see in the app. Use it to test different subscription experiences.
              </Text>
            </View>
            <View style={s.card}>
              <Text style={{ color: colors.foreground, fontSize: 15, fontFamily: "Inter_600SemiBold", marginBottom: 4 }}>
                Current tier
              </Text>
              <View style={[s.currentTierBadge, { backgroundColor: tierColors[tier] + "22" }]}>
                <Text style={[s.currentTierText, { color: tierColors[tier] }]}>
                  {tier.toUpperCase()}
                </Text>
              </View>

              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 16, marginBottom: 12 }}>
                Switch to:
              </Text>
              <View style={s.tierRow}>
                {(["free", "pro", "premium"] as Tier[]).map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={[s.tierBtn, tier === t && s.tierBtnActive]}
                    onPress={() => setMyTier(t)}
                    disabled={settingTier !== null || tier === t}
                  >
                    {settingTier === t ? (
                      <ActivityIndicator color={colors.primary} size="small" />
                    ) : (
                      <Text style={[s.tierText, tier === t && s.tierTextActive]}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </Text>
                    )}
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 8 }}>
                Changes take effect immediately. The app will reflect the new tier without restarting.
              </Text>
            </View>
          </View>
        )}

        {/* ── Users section ─────────────────────────────────── */}
        {activeSection === "users" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>All Users ({users.length})</Text>
            {usersLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
            ) : (
              <View style={s.card}>
                {users.length === 0 ? (
                  <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", padding: 16 }}>
                    No users yet
                  </Text>
                ) : (
                  users.map((u, i) => (
                    <View key={u.clerk_user_id} style={[s.userRow, i === users.length - 1 && { borderBottomWidth: 0 }, { flexDirection: "column", alignItems: "stretch", gap: 8 }]}>
                      {/* Top row: email + tier badge + tier buttons */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.userEmail} numberOfLines={1}>{u.email || "—"}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                            Joined {new Date(u.created_at).toLocaleDateString()} · {u.days_since_joined ?? 1} day{u.days_since_joined !== 1 ? "s" : ""} ago
                          </Text>
                        </View>
                        <View style={[s.userTierBadge, { backgroundColor: tierColors[u.tier || "free"] + "22" }]}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: tierColors[u.tier || "free"] }}>
                            {(u.tier || "free").toUpperCase()}
                          </Text>
                        </View>
                        {u.clerk_user_id !== userId && (
                          <View style={{ flexDirection: "row", gap: 4 }}>
                            {(["free", "pro", "premium"] as Tier[]).map((t) => (
                              <TouchableOpacity
                                key={t}
                                style={[s.miniTierBtn, u.tier === t && { borderColor: tierColors[t], backgroundColor: tierColors[t] + "22" }]}
                                onPress={() => setUserTier(u.clerk_user_id, u.email, t)}
                                disabled={settingTier !== null}
                              >
                                {settingTier === u.clerk_user_id + t ? (
                                  <ActivityIndicator size="small" color={colors.primary} style={{ width: 20 }} />
                                ) : (
                                  <Text style={[s.miniTierBtnText, u.tier === t && { color: tierColors[t] }]}>
                                    {t[0].toUpperCase()}
                                  </Text>
                                )}
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                      </View>
                      {/* Stats row */}
                      <View style={{ flexDirection: "row", gap: 12, paddingLeft: 2, flexWrap: "wrap" }}>
                        {[
                          { icon: "bookmark", label: "Watchlist", value: u.watchlist_count ?? 0 },
                          { icon: "folder", label: "Folders", value: u.folder_count ?? 0 },
                          { icon: "zap", label: "Events", value: u.events_total ?? 0 },
                          { icon: "calendar", label: "Active days", value: `${u.days_active ?? 0}d` },
                        ].map((stat) => (
                          <View key={stat.label} style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                            <Feather name={stat.icon as any} size={11} color={colors.mutedForeground} />
                            <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular" }}>
                              {stat.label}: <Text style={{ color: colors.foreground, fontFamily: "Inter_600SemiBold" }}>{stat.value}</Text>
                            </Text>
                          </View>
                        ))}
                      </View>
                      {/* Manage ▸ — opens the detail screen. Flag-gated; server is
                          authoritative, this gate is cosmetic. */}
                      {subscriptionToolsAllowed && (
                        <TouchableOpacity
                          style={[s.manageBtn, { alignSelf: "flex-start" }]}
                          onPress={() => router.push(`/admin-panel/user/${u.clerk_user_id}`)}
                        >
                          <Feather name="settings" size={12} color={colors.primary} />
                          <Text style={s.manageText}>manage ▸</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        )}

        {/* ── Stats section ─────────────────────────────────── */}
        {activeSection === "stats" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>App Stats</Text>
            {statsLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
            ) : (
              <View style={s.card}>
                {[
                  { label: "Events Today", value: String(stats?.eventsToday ?? 0) },
                  { label: "Unique Stocks Today", value: String(stats?.uniqueStocksToday ?? 0) },
                  { label: "Avg Rating", value: stats?.avgRating ? `${stats.avgRating} ★` : "—" },
                ].map((row, i, arr) => (
                  <View key={row.label} style={[s.statRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={s.statLabel}>{row.label}</Text>
                    <Text style={s.statValue}>{row.value}</Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={s.sectionTitle}>Quick Links</Text>
            <View style={s.card}>
              <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 20 }}>
                Full dashboard with error logs, feedback list, and trending stocks is available at:{"\n"}
              </Text>
              <TouchableOpacity
                onPress={() => {
                  const url = ADMIN_URL;
                  if (url) Linking.openURL(url);
                }}
                disabled={!ADMIN_URL}
              >
                <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold", fontSize: 13, textDecorationLine: "underline" }}>
                  {ADMIN_URL ?? "your-domain/admin"}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Premium Conversion Funnel ─────────────────────── */}
        {activeSection === "funnel" && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Premium Conversion Funnel · Last 30 days</Text>
            {funnelLoading ? (
              <ActivityIndicator color={colors.primary} style={{ padding: 32 }} />
            ) : funnel.length === 0 ? (
              <View style={s.card}>
                <Text style={{ color: colors.mutedForeground, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
                  No data yet. Once users interact with a gated feature, impressions and click-throughs will appear here.
                </Text>
              </View>
            ) : (
              <View style={s.card}>
                <View style={[s.funnelRow, { borderBottomColor: colors.border, borderBottomWidth: 1, paddingBottom: 8 }]}>
                  <Text style={[s.funnelCellFeature, { color: colors.mutedForeground }]}>FEATURE</Text>
                  <Text style={[s.funnelCellNum, { color: colors.mutedForeground }]}>IMPR</Text>
                  <Text style={[s.funnelCellNum, { color: colors.mutedForeground }]}>CTA</Text>
                  <Text style={[s.funnelCellNum, { color: colors.mutedForeground }]}>CHK</Text>
                  <Text style={[s.funnelCellNum, { color: colors.mutedForeground }]}>CVR</Text>
                </View>
                {funnel.map((row) => {
                  const impr = Number(row.impressions);
                  const cta = Number(row.cta_clicks);
                  const chk = Number(row.checkouts);
                  const cvr = impr > 0 ? (cta / impr) * 100 : 0;
                  return (
                    <View key={row.feature} style={[s.funnelRow, { borderBottomColor: colors.border, borderBottomWidth: 1, paddingVertical: 10 }]}>
                      <Text style={[s.funnelCellFeature, { color: colors.foreground }]} numberOfLines={1}>{row.feature}</Text>
                      <Text style={[s.funnelCellNum, { color: colors.foreground }]}>{impr}</Text>
                      <Text style={[s.funnelCellNum, { color: colors.foreground }]}>{cta}</Text>
                      <Text style={[s.funnelCellNum, { color: colors.primary }]}>{chk}</Text>
                      <Text style={[s.funnelCellNum, { color: cvr >= 5 ? colors.positive : colors.mutedForeground }]}>
                        {cvr.toFixed(1)}%
                      </Text>
                    </View>
                  );
                })}
                <Text style={{ color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 12, lineHeight: 16 }}>
                  IMPR = lock impressions · CTA = upgrade clicks · CHK = checkouts started · CVR = CTA / IMPR.
                </Text>
              </View>
            )}
          </View>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
