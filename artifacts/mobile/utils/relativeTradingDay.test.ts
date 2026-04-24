// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// The file is excluded from tsconfig.json, so this pragma only matters for
// ad-hoc transpile steps.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/utils/relativeTradingDay.test.ts
// Run with Node <22:
//   pnpm exec tsc --target es2022 --module nodenext --moduleResolution nodenext \
//     --outDir /tmp/rtd-test utils/marketHours.ts utils/relativeTradingDay.ts utils/relativeTradingDay.test.ts &&
//   node --test /tmp/rtd-test/utils/relativeTradingDay.test.js

import test from "node:test";
import assert from "node:assert/strict";
import {
  getPreviousTradingDay,
  formatRelativeTradingDay,
  previousTradingDayLabel,
} from "./relativeTradingDay";

// Use an exchange whose schedule is set ("STO" = Stockholm, Europe/Stockholm).
// Fixture `now` times are picked at noon local-time (via Europe/Stockholm)
// so the math doesn't straddle midnight.
const STO = "Nasdaq Stockholm";

test("midweek Tuesday → Yesterday (Monday)", () => {
  // Tuesday 2026-04-21 11:00 Stockholm = 09:00Z (summer: +02:00)
  const now = new Date("2026-04-21T09:00:00Z");
  assert.equal(previousTradingDayLabel(STO, now), "Yesterday");
});

test("midweek Friday → Yesterday (Thursday)", () => {
  const now = new Date("2026-04-24T09:00:00Z");
  assert.equal(previousTradingDayLabel(STO, now), "Yesterday");
});

test("Monday → Friday (skips the weekend)", () => {
  // Monday 2026-04-27 11:00 Stockholm
  const now = new Date("2026-04-27T09:00:00Z");
  const prev = getPreviousTradingDay(STO, now);
  // Friday 2026-04-24
  assert.equal(prev.year, 2026);
  assert.equal(prev.month, 4);
  assert.equal(prev.day, 24);
  assert.equal(formatRelativeTradingDay(prev, now, STO), "Friday");
});

test("Saturday → Friday (just-past weekday)", () => {
  const now = new Date("2026-04-25T09:00:00Z"); // Saturday
  const prev = getPreviousTradingDay(STO, now);
  assert.equal(prev.day, 24); // Friday
  // Saturday → Friday is 1 calendar day back → "Yesterday"
  assert.equal(formatRelativeTradingDay(prev, now, STO), "Yesterday");
});

test("Sunday → Friday (2 days back)", () => {
  const now = new Date("2026-04-26T09:00:00Z"); // Sunday
  const prev = getPreviousTradingDay(STO, now);
  assert.equal(prev.day, 24); // Friday
  // Sunday → Friday is 2 days back → weekday name
  assert.equal(formatRelativeTradingDay(prev, now, STO), "Friday");
});

test("manual prev-day more than 6 days back → Weekday, DD MMM", () => {
  const now = new Date("2026-04-27T09:00:00Z"); // Monday
  const prev = { year: 2026, month: 4, day: 17, weekday: 5 /* Fri */ };
  assert.equal(formatRelativeTradingDay(prev, now, STO), "Friday, 17 Apr");
});

test("same calendar day → Today", () => {
  const now = new Date("2026-04-21T09:00:00Z");
  const prev = { year: 2026, month: 4, day: 21, weekday: 2 };
  assert.equal(formatRelativeTradingDay(prev, now, STO), "Today");
});

test("US exchange (America/New_York) picks the same logic in its tz", () => {
  // 2026-04-27 03:00 UTC = 2026-04-26 23:00 New York (Sunday)
  const now = new Date("2026-04-27T03:00:00Z");
  const prev = getPreviousTradingDay("NASDAQ", now);
  // In NY it's still Sunday → Friday 2026-04-24
  assert.equal(prev.month, 4);
  assert.equal(prev.day, 24);
});

test("unknown exchange falls back to DEFAULT (America/New_York) without throwing", () => {
  const now = new Date("2026-04-27T14:00:00Z"); // Monday 10:00 NY
  const label = previousTradingDayLabel("SOME-MADE-UP-EXCHANGE", now);
  // Monday → Friday
  assert.equal(label, "Friday");
});
