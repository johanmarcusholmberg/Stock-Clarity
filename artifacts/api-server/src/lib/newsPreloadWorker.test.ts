// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/api-server/src/lib/newsPreloadWorker.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { __test__ } from "./newsPreloadWorker";
import type { NewsItem } from "./newsSources";

const { urlHash } = __test__;

const item = (over: Partial<NewsItem> = {}): NewsItem => ({
  title: "Nvidia beats Q2 earnings",
  publisher: "Reuters",
  url: "https://www.reuters.com/tech/nvidia-q2-beat-2025-08-20",
  timestamp: "2025-08-20T20:00:00Z",
  timestampMs: 1_755_720_000_000,
  ...over,
});

test("yahoo items hash by normalised URL host+path", () => {
  const a = urlHash(item(), "yahoo");
  const b = urlHash(
    item({ url: "https://www.reuters.com/tech/nvidia-q2-beat-2025-08-20?utm_source=spam" }),
    "yahoo",
  );
  // Query string stripped → same hash. Tracking-param differences don't dupe.
  assert.equal(a, b);
});

test("google_rss items hash by publisher+title, ignoring URL", () => {
  const a = urlHash(item({ url: "https://news.google.com/rss/articles/abc" }), "google_rss");
  const b = urlHash(item({ url: "https://news.google.com/rss/articles/xyz_different" }), "google_rss");
  // Same story from different Google redirect URLs → same hash.
  assert.equal(a, b);
});

test("case-insensitive publisher+title match for google_rss", () => {
  const a = urlHash(item({ publisher: "Reuters", title: "Nvidia beats Q2 earnings" }), "google_rss");
  const b = urlHash(item({ publisher: "REUTERS", title: "NVIDIA BEATS Q2 EARNINGS" }), "google_rss");
  assert.equal(a, b);
});

test("yahoo items with news.google.com URL fall back to publisher+title", () => {
  // Defensive: Yahoo sometimes surfaces Google redirect URLs. We shouldn't
  // trust those for dedup — fall back to publisher+title.
  const a = urlHash(item({ url: "https://news.google.com/xyz" }), "yahoo");
  const b = urlHash(item({ url: "https://news.google.com/different" }), "yahoo");
  assert.equal(a, b);
});

test("different stories (distinct URLs) produce different hashes", () => {
  // Yahoo dedup intentionally hashes by host+path *only*. Two articles at the
  // same URL with different titles are treated as the same story (e.g. the
  // publisher edited the headline) — that's the desired behaviour. The
  // realistic "different stories" case is two distinct URLs.
  const a = urlHash(
    item({
      title: "Earnings beat",
      url: "https://www.reuters.com/tech/nvidia-earnings-2025-08-20",
    }),
    "yahoo",
  );
  const b = urlHash(
    item({
      title: "Lawsuit filed",
      url: "https://www.reuters.com/legal/nvidia-lawsuit-2025-08-21",
    }),
    "yahoo",
  );
  assert.notEqual(a, b);
});

test("same URL with different titles still dedup (intentional — publisher edited headline)", () => {
  const a = urlHash(item({ title: "Earnings beat" }), "yahoo");
  const b = urlHash(item({ title: "Earnings beat — updated" }), "yahoo");
  assert.equal(a, b);
});

test("malformed URL falls back to publisher+title without throwing", () => {
  assert.doesNotThrow(() => urlHash(item({ url: "not a url" }), "yahoo"));
  const a = urlHash(item({ url: "not a url" }), "yahoo");
  const b = urlHash(item({ url: "" }), "yahoo");
  // Empty URL path hits the google-redirect/fallback branch (fallback key).
  // "not a url" throws inside `new URL` and hits the same fallback.
  assert.equal(typeof a, "string");
  assert.equal(a.length, 40);
  assert.equal(a, b);
});
