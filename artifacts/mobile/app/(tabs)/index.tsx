import { Feather } from "@expo/vector-icons";
import { useAuth, useUser } from "@clerk/expo";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import StockCard from "@/components/StockCard";
import { FolderTabStrip } from "@/components/FolderTabStrip";

type Filter = "all" | "gainers" | "losers";

export default function WatchlistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { watchlist, stocks, unreadAlertCount, folders, activeFolderId } = useWatchlist();
  const { signOut } = useAuth();
  const { user } = useUser();
  const [profileOpen, setProfileOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const activeFolder = folders.find((f) => f.id === activeFolderId);

  const allWatched = watchlist.map((ticker) => stocks[ticker]).filter(Boolean);
  const gainers = allWatched.filter((s) => s.changePercent >= 0);
  const losers = allWatched.filter((s) => s.changePercent < 0);

  const displayed = filter === "gainers" ? gainers : filter === "losers" ? losers : allWatched;

  const handleSignOut = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setProfileOpen(false);
    await signOut();
  };

  const userInitials = user?.firstName
    ? `${user.firstName[0]}${user.lastName?.[0] ?? ""}`.toUpperCase()
    : user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() ?? "?";

  const FILTERS: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: allWatched.length },
    { key: "gainers", label: "Gainers", count: gainers.length },
    { key: "losers", label: "Losers", count: losers.length },
  ];

  return (
    <View style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={{ paddingTop: topPadding + 16 }}>
        <View style={[styles.titleRow, { paddingHorizontal: 16 }]}>
          <View>
            <Text style={[styles.greeting, { color: colors.mutedForeground }]}>
              {user?.firstName ? `Good morning, ${user.firstName}` : "Good morning"}
            </Text>
            <Text style={[styles.appTitle, { color: colors.foreground }]}>StockClarify</Text>
          </View>
          <View style={styles.headerButtons}>
            {unreadAlertCount > 0 && (
              <TouchableOpacity
                style={[styles.iconButton, { backgroundColor: colors.secondary }]}
                onPress={() => router.push("/(tabs)/alerts")}
              >
                <Feather name="bell" size={18} color={colors.primary} />
                <View style={[styles.badge, { backgroundColor: colors.primary }]}>
                  <Text style={[styles.badgeText, { color: colors.primaryForeground }]}>{unreadAlertCount}</Text>
                </View>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.avatarButton, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}
              onPress={() => setProfileOpen(true)}
            >
              <Text style={[styles.avatarText, { color: colors.primary }]}>{userInitials}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.statsRow, { marginTop: 20, paddingHorizontal: 16, marginBottom: 16 }]}>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.foreground }]}>{allWatched.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Watching</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.positive }]}>{gainers.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Gainers</Text>
          </View>
          <View style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.negative }]}>{losers.length}</Text>
            <Text style={[styles.statLabel, { color: colors.mutedForeground }]}>Losers</Text>
          </View>
        </View>

        <FolderTabStrip />

        <View style={[styles.sectionHeader, { paddingHorizontal: 16, marginBottom: 10 }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            {activeFolder?.name ?? "Watchlist"}
          </Text>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}
            onPress={() => router.push("/(tabs)/search")}
          >
            <Feather name="plus" size={14} color={colors.primary} />
            <Text style={[styles.addButtonText, { color: colors.primary }]}>Add stock</Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.filterRow, { marginBottom: 12, paddingHorizontal: 16 }]}>
          {FILTERS.map((f) => (
            <TouchableOpacity
              key={f.key}
              style={[
                styles.filterChip,
                {
                  backgroundColor: filter === f.key ? colors.primary : colors.secondary,
                  borderColor: filter === f.key ? colors.primary : colors.border,
                },
              ]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setFilter(f.key); }}
            >
              <Text style={[styles.filterChipText, { color: filter === f.key ? colors.primaryForeground : colors.mutedForeground }]}>
                {f.label}
              </Text>
              {f.count > 0 && (
                <View style={[styles.filterCount, { backgroundColor: filter === f.key ? `${colors.primaryForeground}33` : `${colors.primary}22` }]}>
                  <Text style={[styles.filterCountText, { color: filter === f.key ? colors.primaryForeground : colors.primary }]}>{f.count}</Text>
                </View>
              )}
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <ScrollView
        style={styles.fill}
        contentContainerStyle={{ paddingBottom: bottomPadding, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {displayed.length === 0 && allWatched.length === 0 ? (
          <View style={[styles.empty, { borderColor: colors.border }]}>
            <Feather name="bar-chart-2" size={32} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No stocks yet</Text>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
              Search and add stocks from any world market to start tracking them.
            </Text>
            <TouchableOpacity
              style={[styles.emptyButton, { backgroundColor: colors.primary }]}
              onPress={() => router.push("/(tabs)/search")}
            >
              <Text style={[styles.emptyButtonText, { color: colors.primaryForeground }]}>Browse world markets</Text>
            </TouchableOpacity>
          </View>
        ) : displayed.length === 0 ? (
          <View style={[styles.emptyFilter, { borderColor: colors.border }]}>
            <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>No {filter} right now.</Text>
          </View>
        ) : (
          displayed.map((stock) => <StockCard key={stock.ticker} stock={stock} />)
        )}
      </ScrollView>

      <Modal visible={profileOpen} transparent animationType="fade" onRequestClose={() => setProfileOpen(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setProfileOpen(false)}>
          <View style={[styles.profileSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={[styles.profileAvatar, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
              <Text style={[styles.profileAvatarText, { color: colors.primary }]}>{userInitials}</Text>
            </View>
            <Text style={[styles.profileName, { color: colors.foreground }]}>
              {user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : "Your account"}
            </Text>
            <Text style={[styles.profileEmail, { color: colors.mutedForeground }]}>
              {user?.emailAddresses?.[0]?.emailAddress ?? ""}
            </Text>
            <View style={[styles.profileDivider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.profileMenuItem} onPress={handleSignOut}>
              <Feather name="log-out" size={16} color={colors.negative} />
              <Text style={[styles.profileMenuItemText, { color: colors.negative }]}>Sign out</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  titleRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  greeting: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 2 },
  appTitle: { fontSize: 28, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  headerButtons: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  iconButton: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", position: "relative" },
  badge: { position: "absolute", top: 5, right: 5, width: 14, height: 14, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  badgeText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  avatarButton: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statsRow: { flexDirection: "row", gap: 10 },
  statCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 14, borderWidth: 1, alignItems: "center" },
  statValue: { fontSize: 22, fontFamily: "Inter_700Bold", marginBottom: 2 },
  statLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  addButton: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, gap: 4 },
  addButtonText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterRow: { flexDirection: "row", gap: 8 },
  filterChip: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, gap: 6 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterCount: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 8, minWidth: 18, alignItems: "center" },
  filterCountText: { fontSize: 10, fontFamily: "Inter_700Bold" },
  empty: { alignItems: "center", paddingVertical: 48, gap: 10, borderWidth: 1, borderStyle: "dashed", borderRadius: 16, paddingHorizontal: 24 },
  emptyFilter: { alignItems: "center", paddingVertical: 32, borderWidth: 1, borderStyle: "dashed", borderRadius: 12 },
  emptyTitle: { fontSize: 18, fontFamily: "Inter_700Bold", marginTop: 4 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  emptyButton: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 8 },
  emptyButtonText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  profileSheet: { width: 280, borderRadius: 20, borderWidth: 1, padding: 24, alignItems: "center", gap: 6 },
  profileAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  profileAvatarText: { fontSize: 24, fontFamily: "Inter_700Bold" },
  profileName: { fontSize: 17, fontFamily: "Inter_700Bold" },
  profileEmail: { fontSize: 13, fontFamily: "Inter_400Regular" },
  profileDivider: { height: 1, width: "100%", marginVertical: 12 },
  profileMenuItem: { flexDirection: "row", alignItems: "center", gap: 8, width: "100%", paddingVertical: 4 },
  profileMenuItemText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
