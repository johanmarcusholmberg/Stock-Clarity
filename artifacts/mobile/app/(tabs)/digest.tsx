import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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
import DigestCard from "@/components/DigestCard";
import EventCard from "@/components/EventCard";

type Tab = "digest" | "events";

export default function DigestScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { digest, events } = useWatchlist();
  const [activeTab, setActiveTab] = useState<Tab>("digest");

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 : insets.bottom;

  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        paddingTop: topPadding + 16,
        paddingBottom: bottomPadding,
        paddingHorizontal: 16,
      }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.screenTitle, { color: colors.foreground }]}>Market Digest</Text>
      <Text style={[styles.date, { color: colors.mutedForeground }]}>{today}</Text>

      {digest.length === 0 && events.length === 0 ? (
        <View style={[styles.emptyContainer, { borderColor: colors.border }]}>
          <Feather name="book-open" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>Nothing to digest</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            Add stocks to your watchlist to see daily summaries and event breakdowns here.
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.tabContainer, { backgroundColor: colors.card, borderColor: colors.border, marginTop: 20 }]}>
            <TouchableOpacity
              style={[styles.tab, activeTab === "digest" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("digest")}
            >
              <Text style={[styles.tabText, { color: activeTab === "digest" ? colors.primaryForeground : colors.mutedForeground }]}>
                Daily Brief
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tab, activeTab === "events" && { backgroundColor: colors.primary }]}
              onPress={() => setActiveTab("events")}
            >
              <Text style={[styles.tabText, { color: activeTab === "events" ? colors.primaryForeground : colors.mutedForeground }]}>
                Event Details
              </Text>
            </TouchableOpacity>
          </View>

          {activeTab === "digest" && (
            <View style={styles.contentSection}>
              <View style={[styles.infoBanner, { backgroundColor: `${colors.primary}15`, borderColor: `${colors.primary}30` }]}>
                <Feather name="info" size={14} color={colors.primary} />
                <Text style={[styles.infoText, { color: colors.primary }]}>
                  Read in under 2 minutes. Scoped to your watchlist.
                </Text>
              </View>
              {digest.map((entry) => (
                <DigestCard key={entry.id} entry={entry} />
              ))}
            </View>
          )}

          {activeTab === "events" && (
            <View style={styles.contentSection}>
              <Text style={[styles.sectionNote, { color: colors.mutedForeground }]}>
                Tap any event to expand — each one covers what happened, why it may matter, and how unusual it is.
              </Text>
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  date: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  tabContainer: {
    flexDirection: "row",
    padding: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
    gap: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: "center",
  },
  tabText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  contentSection: {
    gap: 0,
  },
  infoBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  infoText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    flex: 1,
  },
  sectionNote: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 12,
  },
  emptyContainer: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingHorizontal: 24,
    marginTop: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
