import * as Notifications from "expo-notifications";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

export type NotificationFrequency = "daily" | "weekly" | "monthly";
export type NotificationMethod = "push" | "email" | "both";
export type AlertType = "price_target" | "market_open_close" | "large_movement" | "volume_spike";

export const ALERT_TYPE_OPTIONS: { key: AlertType; label: string; description: string; icon: string }[] = [
  { key: "large_movement",    label: "Large Price Moves",  description: "Significant % swings in your watchlist", icon: "trending-up" },
  { key: "volume_spike",      label: "Volume Spikes",      description: "Unusual trading volume detected",         icon: "activity" },
  { key: "price_target",      label: "Price Targets",      description: "Stocks nearing 52-week highs or lows",    icon: "target" },
  { key: "market_open_close", label: "Market Open/Close",  description: "Daily open and close summary",            icon: "clock" },
];

export interface NotificationPrefs {
  enabled: boolean;
  frequency: NotificationFrequency;
  method: NotificationMethod;
  email: string;
  hour: number;
  minute: number;
  alertTypes: AlertType[];
}

const PREFS_KEY = "@stockclarify_notification_prefs";

export const DEFAULT_PREFS: NotificationPrefs = {
  enabled: false,
  frequency: "daily",
  method: "push",
  email: "",
  hour: 8,
  minute: 0,
  alertTypes: ["large_movement", "volume_spike"],
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
  const body = `Today's update for your watchlist: ${tickerList}`;

  let trigger: Notifications.NotificationTriggerInput;
  const hour = prefs.hour;
  const minute = prefs.minute ?? 0;

  if (prefs.frequency === "daily") {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    };
  } else if (prefs.frequency === "weekly") {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
      weekday: 2,
      hour,
      minute,
    };
  } else {
    trigger = {
      type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
      day: 1,
      hour,
      minute,
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

export function formatNotifTime(hour: number, minute: number): string {
  const m = minute === 0 ? "00" : String(minute).padStart(2, "0");
  const suffix = hour < 12 ? "AM" : "PM";
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${m} ${suffix}`;
}

const FREQ_LABELS: Record<NotificationFrequency, string> = {
  daily: "Daily at",
  weekly: "Weekly (Mon) at",
  monthly: "Monthly (1st) at",
};

export function describeSchedule(prefs: NotificationPrefs): string {
  if (!prefs.enabled) return "Off";
  return `${FREQ_LABELS[prefs.frequency]} ${formatNotifTime(prefs.hour, prefs.minute ?? 0)}`;
}
