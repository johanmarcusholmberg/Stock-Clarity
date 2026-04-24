import React from "react";
import { Stack } from "expo-router";

/**
 * Nested Stack inside the `admin-panel` tab so the detail screen at
 * `user/[userId]` keeps the parent Tabs bar visible. Header is hidden on
 * every child — each screen renders its own SafeAreaView + header band to
 * match the existing admin-panel index visual.
 */
export default function AdminPanelStackLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
