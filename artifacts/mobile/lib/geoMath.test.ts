// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// The file is excluded from tsconfig.json, so this pragma only matters for
// ad-hoc transpile steps.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/lib/geoMath.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { computeExposure } from "./geoMath";

function holding(
  ticker: string,
  currency: string,
  country: string | null,
  qty: number,
) {
  return {
    ticker,
    currency,
    country,
    lots: [{ qty: String(qty) }],
  };
}

function quote(price: number, currency?: string) {
  return { regularMarketPrice: price, currency };
}

test("empty holdings → empty exposure", () => {
  const result = computeExposure([], new Map());
  assert.deepEqual(result, { byCountry: {}, byCurrency: {} });
});

test("single-currency single-country portfolio is 100% one bucket", () => {
  const holdings = [holding("AAPL", "USD", "United States", 10)];
  const quotes = new Map([["AAPL", quote(150, "USD")]]);
  const { byCountry, byCurrency } = computeExposure(holdings, quotes);
  assert.equal(byCountry["United States"], 100);
  assert.equal(byCurrency["USD"], 100);
});

test("two equal-value holdings split exposure 50/50", () => {
  const holdings = [
    holding("AAPL", "USD", "United States", 10), // 10 * 100 = 1000
    holding("ASML.AS", "EUR", "Netherlands", 5), // 5 * 200 = 1000
  ];
  const quotes = new Map([
    ["AAPL", quote(100, "USD")],
    ["ASML.AS", quote(200, "EUR")],
  ]);
  const { byCountry, byCurrency } = computeExposure(holdings, quotes);
  assert.equal(byCountry["United States"], 50);
  assert.equal(byCountry["Netherlands"], 50);
  assert.equal(byCurrency["USD"], 50);
  assert.equal(byCurrency["EUR"], 50);
});

test("missing country buckets into 'Unknown'", () => {
  const holdings = [
    holding("AAPL", "USD", null, 10), // country unknown
    holding("MSFT", "USD", "United States", 10),
  ];
  const quotes = new Map([
    ["AAPL", quote(100, "USD")],
    ["MSFT", quote(100, "USD")],
  ]);
  const { byCountry } = computeExposure(holdings, quotes);
  assert.equal(byCountry["Unknown"], 50);
  assert.equal(byCountry["United States"], 50);
});

test("holdings without a quote are excluded (no quote = no value)", () => {
  const holdings = [
    holding("AAPL", "USD", "United States", 10),
    holding("UNKNOWN.X", "EUR", "France", 100), // no quote
  ];
  const quotes = new Map([["AAPL", quote(100, "USD")]]);
  const { byCountry, byCurrency } = computeExposure(holdings, quotes);
  assert.equal(byCountry["United States"], 100);
  assert.equal(byCurrency["USD"], 100);
  assert.equal(byCountry["France"], undefined);
});

test("quote currency overrides holding currency when they disagree", () => {
  // Mirrors snapshotWorker: if user mistyped currency on add, the quote
  // wins. Holding declared GBP but Yahoo says USD → exposure goes to USD.
  const holdings = [holding("AAPL", "GBP", "United States", 10)];
  const quotes = new Map([["AAPL", quote(100, "USD")]]);
  const { byCurrency } = computeExposure(holdings, quotes);
  assert.equal(byCurrency["USD"], 100);
  assert.equal(byCurrency["GBP"], undefined);
});

test("zero-qty holding contributes nothing", () => {
  const holdings = [
    holding("AAPL", "USD", "United States", 10),
    holding("EMPTY", "USD", "Canada", 0),
  ];
  const quotes = new Map([
    ["AAPL", quote(100, "USD")],
    ["EMPTY", quote(50, "USD")],
  ]);
  const { byCountry } = computeExposure(holdings, quotes);
  assert.equal(byCountry["United States"], 100);
  assert.equal(byCountry["Canada"], undefined);
});

test("percentages sum to 100 (within float epsilon) across either axis", () => {
  const holdings = [
    holding("AAPL", "USD", "United States", 3),
    holding("ASML.AS", "EUR", "Netherlands", 7),
    holding("TSLA", "USD", "United States", 1),
  ];
  const quotes = new Map([
    ["AAPL", quote(100, "USD")],
    ["ASML.AS", quote(50, "EUR")],
    ["TSLA", quote(200, "USD")],
  ]);
  const { byCountry, byCurrency } = computeExposure(holdings, quotes);
  const sumCountry = Object.values(byCountry).reduce((a, b) => a + b, 0);
  const sumCurrency = Object.values(byCurrency).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sumCountry - 100) < 1e-9, `country sum = ${sumCountry}`);
  assert.ok(Math.abs(sumCurrency - 100) < 1e-9, `currency sum = ${sumCurrency}`);
});
