// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// The file is excluded from tsconfig.json, so this pragma only matters for
// ad-hoc transpile steps.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/utils/eventBadge.test.ts
// Run with Node <22:
//   pnpm exec tsc --target es2022 --module nodenext --moduleResolution nodenext \
//     --outDir /tmp/eb-test utils/eventBadge.ts utils/eventBadge.test.ts &&
//   node --test /tmp/eb-test/utils/eventBadge.test.js

import test from "node:test";
import assert from "node:assert/strict";
import { computeEventBadge } from "./eventBadge";

const base = {
  tier: "free" as const,
  aiLimit: 5,
  aiUsed: 0,
  hasAI: true,
  expanded: false,
  alreadyExpanded: false,
  canExpand: true,
};

test("premium with infinite quota never shows a badge", () => {
  const badge = computeEventBadge({ ...base, tier: "premium", aiLimit: Infinity });
  assert.equal(badge.kind, "none");
});

test("premium even past any counter (sanity)", () => {
  const badge = computeEventBadge({
    ...base,
    tier: "premium",
    aiLimit: Infinity,
    aiUsed: 10_000,
  });
  assert.equal(badge.kind, "none");
});

test("expanded card never shows a badge", () => {
  const badge = computeEventBadge({ ...base, expanded: true });
  assert.equal(badge.kind, "none");
});

test("already-expanded (cached) card never shows a badge", () => {
  const badge = computeEventBadge({ ...base, alreadyExpanded: true });
  assert.equal(badge.kind, "none");
});

test("free tier with full budget shows no badge (footer tells the story)", () => {
  const badge = computeEventBadge({ ...base, aiLimit: 5, aiUsed: 0 });
  assert.equal(badge.kind, "none");
});

test("free tier at quota exhaustion → PRO upsell", () => {
  const badge = computeEventBadge({ ...base, aiLimit: 5, aiUsed: 5 });
  assert.equal(badge.kind, "upgrade");
  assert.equal(badge.label, "PRO");
  assert.equal(badge.reason, "ai_limit_reached");
});

test("free tier gated by stock-daily-limit → PRO upsell", () => {
  const badge = computeEventBadge({ ...base, canExpand: false });
  assert.equal(badge.kind, "upgrade");
  assert.equal(badge.label, "PRO");
  assert.equal(badge.reason, "stock_limit");
});

test("pro tier at quota exhaustion → 'Limit reached' (no more 'LIMIT' label)", () => {
  const badge = computeEventBadge({
    ...base,
    tier: "pro",
    aiLimit: 30,
    aiUsed: 30,
  });
  assert.equal(badge.kind, "used_up");
  assert.equal(badge.label, "Limit reached");
  assert.equal(badge.resetsAt, "tomorrow");
});

test("pro tier low-quota (≤2 left) → quota_low chip", () => {
  const badge = computeEventBadge({
    ...base,
    tier: "pro",
    aiLimit: 30,
    aiUsed: 28, // 2 remaining
  });
  assert.equal(badge.kind, "quota_low");
  assert.equal(badge.label, "2 left");
  assert.equal(badge.remaining, 2);
});

test("pro tier at 3-left is comfortable → no badge", () => {
  const badge = computeEventBadge({
    ...base,
    tier: "pro",
    aiLimit: 30,
    aiUsed: 27, // 3 remaining
  });
  assert.equal(badge.kind, "none");
});

test("card without AI content never shows a badge", () => {
  const badge = computeEventBadge({ ...base, hasAI: false });
  assert.equal(badge.kind, "none");
});

test("stock-limit outranks quota state (shows UPGRADE/PRO, not 'Limit reached')", () => {
  const badge = computeEventBadge({
    ...base,
    tier: "pro",
    aiLimit: 30,
    aiUsed: 30,
    canExpand: false,
  });
  assert.equal(badge.kind, "upgrade");
  assert.equal(badge.label, "UPGRADE");
  assert.equal(badge.reason, "stock_limit");
});
