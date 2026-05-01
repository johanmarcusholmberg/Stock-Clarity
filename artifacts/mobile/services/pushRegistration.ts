import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken } from "./alertsApi";

const API_BASE =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:8080/api";

function getProjectId(): string | undefined {
  return (
    process.env.EXPO_PUBLIC_EAS_PROJECT_ID ??
    Constants?.expoConfig?.extra?.eas?.projectId ??
    Constants?.easConfig?.projectId
  );
}

// Register the device's Expo push token with the server so the alert
// evaluator can deliver pushes to it. Idempotent — safe to call on every
// app launch.
//
// Returns the token string on success, null otherwise. We intentionally
// swallow all errors: missing permission, running on web, Expo without a
// project id, etc. are not worth surfacing to the user.
export async function registerForAlerts(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  if (Platform.OS === "web") return null;

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let status = existing;
    if (status !== "granted") {
      const { status: asked } = await Notifications.requestPermissionsAsync();
      status = asked;
    }
    if (status !== "granted") return null;

    const projectId = getProjectId();

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenRes?.data;
    if (!token) return null;

    // IANA zone (e.g. "Europe/Stockholm"). Used by the notify evaluator to
    // honour the user's quiet-hours window. We send it on every register;
    // the server upserts so the column stays current as the user travels.
    let timezone: string | null = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      timezone = null;
    }

    await registerPushToken(userId, token, Platform.OS, timezone);
    return token;
  } catch {
    return null;
  }
}

// Phase 3 contract: store-build push registration.
//
// Same flow as registerForAlerts, but POSTs to /api/notifications/register
// (the canonical store-build endpoint) and sets up the Android notification
// channel that production builds need for high-priority alerts.
export async function registerForPushNotifications(
  userId: string | null,
): Promise<string | null> {
  if (!userId) return null;
  if (Platform.OS === "web") return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;

  if (existing !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") return null;

  const projectId = getProjectId();

  const token = (
    await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    )
  ).data;

  try {
    await fetch(`${API_BASE}/notifications/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, token, platform: Platform.OS }),
    });
  } catch (err) {
    console.error("Failed to register push token:", err);
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "StockClarify Alerts",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#3B82F6",
    });
  }

  return token;
}
