// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/api-server/src/lib/dividendParser.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { parseDividendsAndMeta } from "./dividendParser";

// Yahoo's quoteSummary returns timestamps in seconds-since-epoch, often
// wrapped as { raw, fmt }. We test both shapes plus the empty/missing path
// since real responses for non-dividend stocks omit the fields entirely.

const EX_DATE_TS = 1735776000; // 2025-01-02 UTC
const PAY_DATE_TS = 1736726400; // 2025-01-13 UTC

test("parses ex-date, pay-date, amount, currency, country from full response", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: {
      exDividendDate: { raw: EX_DATE_TS, fmt: "2025-01-02" },
      dividendDate: { raw: PAY_DATE_TS, fmt: "2025-01-13" },
    },
    summaryDetail: {
      lastDividendValue: { raw: 0.24, fmt: "0.24" },
      currency: "usd",
    },
    summaryProfile: { country: "United States" },
  });
  assert.equal(result.country, "United States");
  assert.equal(result.events.length, 1);
  const ev = result.events[0];
  assert.equal(ev.exDate, "2025-01-02");
  assert.equal(ev.payDate, "2025-01-13");
  assert.equal(ev.amount, 0.24);
  assert.equal(ev.currency, "USD"); // upper-cased
});

test("accepts bare-number timestamps (some Yahoo modules omit the wrapper)", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: {
      exDividendDate: EX_DATE_TS,
      dividendDate: PAY_DATE_TS,
    },
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].exDate, "2025-01-02");
  assert.equal(result.events[0].payDate, "2025-01-13");
});

test("missing exDividendDate yields zero events (non-dividend stock)", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: {
      earnings: { earningsDate: [{ raw: 1735776000 }] },
    },
    summaryDetail: { currency: "USD" },
    summaryProfile: { country: "United States" },
  });
  assert.equal(result.events.length, 0);
  assert.equal(result.country, "United States");
});

test("missing pay-date is fine; ex-date alone still emits an event", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: { exDividendDate: { raw: EX_DATE_TS } },
  });
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].exDate, "2025-01-02");
  assert.equal(result.events[0].payDate, null);
});

test("invalid timestamp (zero / negative) is rejected", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: { exDividendDate: { raw: 0 } },
  });
  assert.equal(result.events.length, 0);
});

test("country with whitespace-only string is treated as missing", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: { exDividendDate: { raw: EX_DATE_TS } },
    summaryProfile: { country: "   " },
  });
  assert.equal(result.country, null);
});

test("amount missing falls back to null without throwing", () => {
  const result = parseDividendsAndMeta({
    calendarEvents: { exDividendDate: { raw: EX_DATE_TS } },
    summaryDetail: {}, // no lastDividendValue
  });
  assert.equal(result.events[0].amount, null);
});

test("entirely empty input doesn't throw", () => {
  const result = parseDividendsAndMeta({});
  assert.equal(result.events.length, 0);
  assert.equal(result.country, null);
});
