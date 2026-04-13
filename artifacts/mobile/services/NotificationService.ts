import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type NotificationFrequency = "daily" | "weekly" | "monthly";
export type NotificationMethod = "push" | "email" | "both";

export interface NotificationPrefs {
  enabled: boolean;
  frequency: NotificationFrequency;
  method: NotificationMethod;
  email: string;
  hour: number;
}

const PREFS_KEY = "@stockclarify_notification_prefs";

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  frequency: "daily",
  method: "push",
  email: "",
  hour: 8,
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function loadNotificationPrefs(): Promise<NotificationPrefs> {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_PREFS;
  }
}

export async function saveNotificationPrefs(prefs: NotificationPrefs): Promise<void> {
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

export async function scheduleWatchlistNotification(prefs: NotificationPrefs, tickers: string[]): Promise<void> {
  if (!prefs.enabled || !tickers.length) {
    await Notifications.cancelAllScheduledNotificationsAsync();
    return;
  }
  if (prefs.method === "email") return;

  const granted = await requestNotificationPermission();
  if (!granted) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  const tickerList = tickers.slice(0, 5).join(", ") + (tickers.length > 5 ? ` +${tickers.length - 5} more` : "");
  const body = `Check updates for your watchlist: ${tickerList}`;

  let trigger: Notifications.NotificationTriggerInput;

  if (prefs.frequency === "daily") {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: prefs.hour,
      minute: 0,
    };
  } else if (prefs.frequency === "weekly") {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2,
      hour: prefs.hour,
      minute: 0,
    };
  } else {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: 1,
      hour: prefs.hour,
      minute: 0,
    };
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: `📈 ${prefs.frequency === "weekly" ? "Weekly" : prefs.frequency === "monthly" ? "Monthly" : "Daily"} Watchlist Digest`,
      body,
      data: { type: "watchlist_digest" },
    },
    trigger,
  });
}

export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

const FREQ_LABELS: Record<NotificationFrequency, string> = {
  daily: "Daily at",
  weekly: "Weekly on Monday at",
  monthly: "Monthly on the 1st at",
};

export function describeSchedule(prefs: NotificationPrefs): string {
  if (!prefs.enabled) return "Off";
  const time = `${prefs.hour}:00 ${prefs.hour < 12 ? "AM" : "PM"}`;
  return `${FREQ_LABELS[prefs.frequency]} ${time}`;
}
