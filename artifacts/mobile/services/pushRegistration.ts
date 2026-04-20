import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { registerPushToken } from "./alertsApi";

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

    const projectId =
      Constants?.expoConfig?.extra?.eas?.projectId ??
      Constants?.easConfig?.projectId;

    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenRes?.data;
    if (!token) return null;

    await registerPushToken(userId, token, Platform.OS);
    return token;
  } catch {
    return null;
  }
}
