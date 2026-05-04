import { Redirect, Slot, Tabs } from "expo-router";
import React from "react";
import { Platform } from "react-native";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";
import { useHoldings } from "@/context/HoldingsContext";
import { useOnboarding } from "@/hooks/useOnboarding";
import { WebShell } from "@/components/web/WebShell";
import {
  AccountIcon,
  AdminIcon,
  DigestIcon,
  HomeIcon,
  InsightsIcon,
  PortfolioIcon,
  SearchIcon,
} from "@/components/icons/StockIcons";

const ICON_SIZE = 23;

export default function TabLayout() {
  const { tier, isAdmin } = useSubscription();
  const { enabled: holdingsEnabled } = useHoldings();
  const { isSignedIn, isLoaded } = useAuth();
  const onboardingStatus = useOnboarding();
  const colors = useColors();
  const isWeb = Platform.OS === "web";

  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;
  // Wait for the onboarding flag to hydrate so first-launch users don't see a
  // flash of the tabs before the walkthrough.
  if (onboardingStatus === "loading") return null;
  if (onboardingStatus === "needed") return <Redirect href="/onboarding" />;

  // On web, the bottom Tabs bar is replaced by WebShell (sidebar + topbar).
  // Slot renders the matched child route — Tabs would inject its own
  // navigation chrome we don't want on desktop.
  if (isWeb) {
    return (
      <WebShell>
        <Slot />
      </WebShell>
    );
  }

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          height: isWeb ? 84 : 62,
          paddingBottom: isWeb ? 16 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="digest"
        options={{
          title: "Digest",
          tabBarIcon: ({ color }) => <DigestIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <SearchIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => <HomeIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color }) => <InsightsIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="portfolio"
        options={{
          title: "Portfolio",
          // Hidden when HOLDINGS_ENABLED is off; same gating pattern the
          // admin-panel tab uses with isAdmin.
          href: holdingsEnabled ? undefined : null,
          tabBarIcon: ({ color }) => <PortfolioIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <AccountIcon size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin-panel"
        options={{
          title: "Admin",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <AdminIcon size={ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}
