import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useWatchlist } from "@/context/WatchlistContext";
import AlertCard from "@/components/AlertCard";

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { alerts, unreadAlertCount } = useWatchlist();

  const topPadding = Platform.OS === "web" ? 67 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 34 + 84 : insets.bottom + 84;

  const unread = alerts.filter((a) => !a.read);
  const read = alerts.filter((a) => a.read);

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
      <View style={styles.titleRow}>
        <Text style={[styles.screenTitle, { color: colors.foreground }]}>Alerts</Text>
        {unreadAlertCount > 0 && (
          <View style={[styles.countBadge, { backgroundColor: `${colors.primary}22`, borderColor: `${colors.primary}44` }]}>
            <Text style={[styles.countText, { color: colors.primary }]}>{unreadAlertCount} new</Text>
          </View>
        )}
      </View>
      <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
        Unusual activity on your watchlist — with plain-language explanations.
      </Text>

      {alerts.length === 0 ? (
        <View style={[styles.empty, { borderColor: colors.border }]}>
          <Feather name="bell-off" size={32} color={colors.mutedForeground} />
          <Text style={[styles.emptyTitle, { color: colors.foreground }]}>No alerts yet</Text>
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
            When unusual price or volume activity occurs on your watchlist stocks, you'll see it here with context.
          </Text>
        </View>
      ) : (
        <>
          {unread.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.mutedForeground }]}>NEW</Text>
              {unread.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </>
          )}
          {read.length > 0 && (
            <>
              <Text style={[styles.groupLabel, { color: colors.mutedForeground, marginTop: unread.length > 0 ? 8 : 0 }]}>EARLIER</Text>
              {read.map((alert) => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </>
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
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 4,
  },
  screenTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  countText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  subtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 20,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "Inter_700Bold",
    letterSpacing: 1,
    marginBottom: 8,
  },
  empty: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    borderRadius: 16,
    paddingHorizontal: 24,
    marginTop: 8,
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
