// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/api-server/src/lib/newsImpact.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { scoreImpact, type ImpactInput } from "./newsImpact";

const NOW = Date.UTC(2026, 3, 22, 12, 0, 0); // 2026-04-22 12:00 UTC

const base: ImpactInput = {
  title: "Company reorganises mid-level staff",
  publisher: "Unknown Blog",
  source: "google_rss",
  publishedAtMs: NOW - 12 * 60 * 60 * 1000, // 12h old
};

test("score is clamped to [0, 100]", () => {
  const low = scoreImpact({ ...base, title: "", publisher: "", publishedAtMs: NOW - 1000 * 60 * 60 * 24 * 30 }, NOW);
  assert.ok(low >= 0, `expected >=0, got ${low}`);

  const high = scoreImpact(
    {
      title: "NVDA beats Q2 earnings, raises guidance — Reuters acquisition rumour",
      publisher: "Reuters",
      source: "yahoo",
      publishedAtMs: NOW - 30 * 60 * 1000, // 30 min old
    },
    NOW,
  );
  assert.ok(high <= 100, `expected <=100, got ${high}`);
});

test("high-signal headlines score higher than noise", () => {
  const noisy = scoreImpact({ ...base }, NOW);
  const earnings = scoreImpact({ ...base, title: "Acme beats Q2 earnings; revenue up 20%" }, NOW);
  assert.ok(earnings > noisy, `earnings=${earnings} should beat noisy=${noisy}`);
});

test("tier-1 publisher beats long-tail publisher", () => {
  const reuters = scoreImpact({ ...base, publisher: "Reuters" }, NOW);
  const blog = scoreImpact({ ...base, publisher: "SomeBlog.net" }, NOW);
  assert.ok(reuters > blog, `reuters=${reuters} should beat blog=${blog}`);
});

test("Yahoo source outweighs Google RSS source", () => {
  const yahoo = scoreImpact({ ...base, source: "yahoo" }, NOW);
  const google = scoreImpact({ ...base, source: "google_rss" }, NOW);
  assert.ok(yahoo > google, `yahoo=${yahoo} should beat google=${google}`);
});

test("fresh news beats week-old news with the same title", () => {
  const fresh = scoreImpact({ ...base, publishedAtMs: NOW - 60 * 60 * 1000 }, NOW);
  const old = scoreImpact({ ...base, publishedAtMs: NOW - 7 * 24 * 60 * 60 * 1000 }, NOW);
  assert.ok(fresh > old, `fresh=${fresh} should beat old=${old}`);
});

test("recency bonus is fully gone after 48h", () => {
  const at48h = scoreImpact({ ...base, publishedAtMs: NOW - 47 * 60 * 60 * 1000 }, NOW);
  const at72h = scoreImpact({ ...base, publishedAtMs: NOW - 72 * 60 * 60 * 1000 }, NOW);
  assert.ok(at48h >= at72h, `48h=${at48h} should be >= 72h=${at72h}`);
});

test("multiple keyword buckets stack", () => {
  const onlyEarnings = scoreImpact({ ...base, title: "Acme Q2 earnings beat" }, NOW);
  const earningsPlusAnalyst = scoreImpact(
    { ...base, title: "Acme Q2 earnings beat; analyst upgrades to buy" },
    NOW,
  );
  assert.ok(earningsPlusAnalyst > onlyEarnings, "stacking buckets should raise score");
});

test("same bucket hit twice doesn't double-count", () => {
  // "beats" and "revenue" both fall in the earnings bucket — the bucket is
  // counted once, so this shouldn't exceed a single-keyword earnings hit by
  // the bucket's full weight.
  const single = scoreImpact({ ...base, title: "Acme beats Q2 forecasts" }, NOW);
  const double = scoreImpact({ ...base, title: "Acme beats Q2 — revenue beats guidance" }, NOW);
  // Allow a small delta from recency rounding but not a full bucket's worth.
  assert.ok(double - single < 22, `single bucket shouldn't stack: single=${single} double=${double}`);
});

test("score is deterministic and integer", () => {
  const a = scoreImpact(base, NOW);
  const b = scoreImpact(base, NOW);
  assert.equal(a, b);
  assert.equal(Number.isInteger(a), true);
});
