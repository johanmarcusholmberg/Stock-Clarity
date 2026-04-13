import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";

const ICON_SIZE = 24;

export default function TabLayout() {
  const { tier, isAdmin } = useSubscription();
  const { isSignedIn, isLoaded } = useAuth();
  const colors = useColors();
  const isWeb = Platform.OS === "web";
  if (!isLoaded) return null;
  if (!isSignedIn) return <Redirect href="/(auth)/sign-in" />;

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
          height: isWeb ? 84 : 60,
          paddingBottom: isWeb ? 16 : 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontFamily: "Inter_600SemiBold",
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Watchlist",
          tabBarIcon: ({ color, focused }) => (
            <Feather name={focused ? "bar-chart-2" : "bar-chart-2"} size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="digest"
        options={{
          title: "Digest",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="book-open" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? colors.primary : colors.primary + "22",
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              marginTop: -8,
            }}>
              <Feather name="search" size={20} color={focused ? colors.primaryForeground : colors.primary} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="pie-chart" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, focused }) => (
            <Feather name="user" size={ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="admin-panel"
        options={{
          title: "Admin",
          tabBarButton: isAdmin ? undefined : () => null,
          tabBarIcon: ({ color, focused }) => (
            <Feather name="shield" size={ICON_SIZE} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
