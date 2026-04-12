import { useAuth } from "@clerk/expo";
import { Redirect, Stack } from "expo-router";
import React from "react";
import { useColors } from "@/hooks/useColors";

export default function AuthLayout() {
  const { isSignedIn } = useAuth();
  const colors = useColors();

  if (isSignedIn) {
    return <Redirect href="/(tabs)" />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
