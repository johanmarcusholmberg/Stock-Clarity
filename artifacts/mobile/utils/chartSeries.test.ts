// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// The file is excluded from tsconfig.json, so this pragma only matters for
// ad-hoc transpile steps.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/utils/chartSeries.test.ts
// Run with Node <22:
//   pnpm exec tsc --target es2022 --module nodenext --moduleResolution nodenext \
//     --outDir /tmp/cs-test utils/chartSeries.ts utils/chartSeries.test.ts &&
//   node --test /tmp/cs-test/utils/chartSeries.test.js
//
// Uses only Node's built-in test runner + assert so no test framework
// dependency is added to the project.

import test from "node:test";
import assert from "node:assert/strict";
import { buildChartSeries } from "./chartSeries";

// ── 1D: 5-minute intraday bars, yesterday's close as anchor ────────────
test("1D series starts at the previous close", () => {
  const previousClose = 180.42;
  const timestamps = [
    1_700_000_000_000,
    1_700_000_300_000, // +5 min
    1_700_000_600_000, // +10 min
  ];
  const prices = [181.1, 182.3, 181.7];

  const result = buildChartSeries(prices, timestamps, previousClose);

  assert.equal(result.hasAnchor, true);
  assert.equal(result.series[0].price, previousClose);
  assert.equal(result.series[0].isAnchor, true);
  assert.equal(result.series[0].timestamp, timestamps[0] - 300_000);
  assert.deepEqual(result.prices, [previousClose, ...prices]);
  assert.equal(result.series[result.series.length - 1].price, prices[prices.length - 1]);
});

// ── 1W (5D) view: 15-minute bars spanning several days ─────────────────
test("1W series starts at the previous close", () => {
  const previousClose = 97.55;
  const timestamps = [
    1_700_000_000_000,
    1_700_000_900_000, // +15 min
    1_700_001_800_000, // +30 min
    1_700_002_700_000, // +45 min
  ];
  const prices = [98.1, 98.6, 99.0, 98.8];

  const result = buildChartSeries(prices, timestamps, previousClose);

  assert.equal(result.hasAnchor, true);
  assert.equal(result.series[0].price, previousClose);
  assert.equal(result.series[0].isAnchor, true);
  assert.equal(result.series[0].timestamp, timestamps[0] - 900_000);
  assert.equal(result.series.length, prices.length + 1);
  assert.equal(result.prices[0], previousClose);
});

// ── Anchor is skipped cleanly when the server omits it ─────────────────
test("falls back to raw series when previousClose is missing", () => {
  const result = buildChartSeries([10, 11, 12], [1, 2, 3], null);
  assert.equal(result.hasAnchor, false);
  assert.deepEqual(result.prices, [10, 11, 12]);
  assert.deepEqual(result.timestamps, [1, 2, 3]);
  assert.equal(result.series[0].isAnchor, false);
});

test("falls back to raw series when previousClose is NaN", () => {
  const result = buildChartSeries([10, 11], [1, 2], Number.NaN);
  assert.equal(result.hasAnchor, false);
  assert.equal(result.prices[0], 10);
});

test("empty price array returns empty series without anchor", () => {
  const result = buildChartSeries([], [], 100);
  assert.equal(result.hasAnchor, false);
  assert.deepEqual(result.series, []);
});
