import { Redirect, Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { useSubscription } from "@/context/SubscriptionContext";

const ICON_SIZE = 23;

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
          tabBarIcon: ({ color }) => <Feather name="book-open" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => <Feather name="search" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) => (
            <View style={{
              backgroundColor: focused ? colors.primary : colors.primary + "22",
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              marginTop: -10,
              shadowColor: colors.primary,
              shadowOpacity: focused ? 0.4 : 0,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: focused ? 6 : 0,
            }}>
              <Feather name="home" size={20} color={focused ? colors.primaryForeground : colors.primary} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color }) => <Feather name="pie-chart" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color }) => <Feather name="user" size={ICON_SIZE} color={color} />,
        }}
      />
      <Tabs.Screen
        name="alerts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin-panel"
        options={{
          title: "Admin",
          href: isAdmin ? undefined : null,
          tabBarIcon: ({ color }) => <Feather name="shield" size={ICON_SIZE} color={color} />,
        }}
      />
    </Tabs>
  );
}
