// Helpers for formatting the "when was the previous trading day" label.
// Powers the subtext under the PREV CLOSE card — replaces the static
// "Yesterday" that was incorrect on Mondays and post-holiday reopens.

import { normaliseExchange, SCHEDULES } from "./marketHours";

/** Returns a Date at 12:00 noon local-time in `timezone` for the given UTC instant.
 * Using noon avoids DST edge cases where midnight could land on the wrong side
 * of a clock change — noon is always unambiguously within the calendar day. */
function calendarDayInTimezone(when: Date, timezone: string): {
  year: number;
  month: number; // 1-12
  day: number;
  weekday: number; // 0=Sun..6=Sat
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
  }).formatToParts(when);

  const year = parseInt(parts.find((p) => p.type === "year")?.value ?? "0", 10);
  const month = parseInt(parts.find((p) => p.type === "month")?.value ?? "0", 10);
  const day = parseInt(parts.find((p) => p.type === "day")?.value ?? "0", 10);
  const wkShort = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const weekday = wdMap[wkShort] ?? 1;
  return { year, month, day, weekday };
}

/** UTC timestamp of noon on (year, month, day). Used as a stable reference
 * point when comparing two calendar days regardless of timezone quirks. */
function noonUTC(year: number, month: number, day: number): number {
  return Date.UTC(year, month - 1, day, 12, 0, 0, 0);
}

/** Returns the calendar day (in the exchange's timezone) of the last completed
 * trading day relative to `now`. Weekends are skipped. Holidays are NOT
 * handled — the app doesn't have a trading-calendar data source, so a
 * post-holiday Tuesday will report "Monday" even though the actual last close
 * was the prior Friday. Good enough for the 90% case and leaves room to plug
 * in a real calendar later. */
export function getPreviousTradingDay(
  exchangeRaw: string,
  now: Date = new Date(),
): { year: number; month: number; day: number; weekday: number } {
  const key = normaliseExchange(exchangeRaw);
  const timezone = (SCHEDULES[key] ?? SCHEDULES["DEFAULT"]).timezone;
  const today = calendarDayInTimezone(now, timezone);

  // Mon(1) → go back 3 (Fri)
  // Sun(0) → go back 2 (Fri)
  // Sat(6) → go back 1 (Fri)
  // Tue–Fri → go back 1 (prev weekday)
  let daysBack: number;
  switch (today.weekday) {
    case 1: daysBack = 3; break; // Monday
    case 0: daysBack = 2; break; // Sunday
    case 6: daysBack = 1; break; // Saturday (still Friday)
    default: daysBack = 1;       // Tue–Fri
  }

  const nowMs = noonUTC(today.year, today.month, today.day);
  const prevMs = nowMs - daysBack * 86_400_000;
  const prev = new Date(prevMs);
  return {
    year: prev.getUTCFullYear(),
    month: prev.getUTCMonth() + 1,
    day: prev.getUTCDate(),
    weekday: prev.getUTCDay(),
  };
}

const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Formats a trading day relative to `now`:
 *   0 calendar-days ago → "Today"
 *   1                   → "Yesterday"
 *   2–6                 → weekday name ("Friday")
 *   7+                  → "Weekday, DD MMM" ("Thursday, 17 Apr")
 *
 * `prevDay` uses the exchange's timezone; `now` is a wall clock. Since we
 * already converted `prevDay` to a calendar day in `getPreviousTradingDay`,
 * we compare against `now` in that same timezone (via `exchangeRaw`) so the
 * diff is symmetric. */
export function formatRelativeTradingDay(
  prevDay: { year: number; month: number; day: number; weekday: number },
  now: Date,
  exchangeRaw: string,
): string {
  const key = normaliseExchange(exchangeRaw);
  const timezone = (SCHEDULES[key] ?? SCHEDULES["DEFAULT"]).timezone;
  const today = calendarDayInTimezone(now, timezone);

  const nowMs = noonUTC(today.year, today.month, today.day);
  const prevMs = noonUTC(prevDay.year, prevDay.month, prevDay.day);
  const diffDays = Math.round((nowMs - prevMs) / 86_400_000);

  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays <= 6) return WEEKDAY_LONG[prevDay.weekday] ?? "";
  const weekday = WEEKDAY_LONG[prevDay.weekday] ?? "";
  const month = MONTH_SHORT[prevDay.month - 1] ?? "";
  return `${weekday}, ${prevDay.day} ${month}`;
}

/** Convenience wrapper for the common case: "what day does the PREV CLOSE
 * refer to?" Handles both steps in one call. */
export function previousTradingDayLabel(exchangeRaw: string, now: Date = new Date()): string {
  const prev = getPreviousTradingDay(exchangeRaw, now);
  return formatRelativeTradingDay(prev, now, exchangeRaw);
}
