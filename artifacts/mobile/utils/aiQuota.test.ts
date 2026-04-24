// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// The file is excluded from tsconfig.json, so this pragma only matters for
// ad-hoc transpile steps.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/utils/aiQuota.test.ts
// Run with Node <22:
//   pnpm exec tsc --target es2022 --module nodenext --moduleResolution nodenext \
//     --outDir /tmp/aq-test utils/aiQuota.ts utils/aiQuota.test.ts &&
//   node --test /tmp/aq-test/utils/aiQuota.test.js
//
// Uses only Node's built-in test runner + assert so no test framework
// dependency is added to the project.

import test from "node:test";
import assert from "node:assert/strict";
import { applyEventExpansion, remainingQuota, type QuotaState } from "./aiQuota";

const makeState = (used = 0, limit = 5): QuotaState => ({
  used,
  limit,
  expandedIds: new Set(),
});

// ── The scenario from the brief:
//   open A  (4 → 3)
//   close, reopen A  (count stays at 3)
//   open B  (3 → 2)
//   reopen A again  (count stays at 2)
// Represented here as remaining = limit - used, starting at limit=5, used=1
// so remaining begins at 4.
test("reopening the same item does not deduct a second credit", () => {
  let state: QuotaState = makeState(1, 5); // 4 left

  // Open A: fresh → decrements, adds to cache.
  let out = applyEventExpansion(state, "event-A");
  assert.equal(out.result.recorded, true);
  assert.equal(out.result.cached, undefined);
  state = out.state;
  assert.equal(remainingQuota(state), 3);
  assert.equal(state.expandedIds.has("event-A"), true);

  // Reopen A (user collapsed then tapped again): cached, no deduction.
  out = applyEventExpansion(state, "event-A");
  assert.equal(out.result.recorded, false);
  assert.equal(out.result.cached, true);
  state = out.state;
  assert.equal(remainingQuota(state), 3);

  // Open B: new item → decrements.
  out = applyEventExpansion(state, "event-B");
  assert.equal(out.result.recorded, true);
  state = out.state;
  assert.equal(remainingQuota(state), 2);
  assert.equal(state.expandedIds.has("event-B"), true);

  // Reopen A *again*: still cached, no deduction.
  out = applyEventExpansion(state, "event-A");
  assert.equal(out.result.recorded, false);
  assert.equal(out.result.cached, true);
  state = out.state;
  assert.equal(remainingQuota(state), 2);
});

test("out-of-quota blocks new events but lets cached ones through", () => {
  let state: QuotaState = {
    used: 3,
    limit: 3,
    expandedIds: new Set(["seen"]),
  };

  // A fresh event cannot be charged — no room in the daily pool.
  let out = applyEventExpansion(state, "fresh");
  assert.equal(out.result.recorded, false);
  assert.equal(out.result.outOfQuota, true);
  assert.equal(state.expandedIds.has("fresh"), false);
  assert.equal(out.state.used, 3); // unchanged

  // But an already-cached event can still be "opened" for free.
  out = applyEventExpansion(state, "seen");
  assert.equal(out.result.recorded, false);
  assert.equal(out.result.cached, true);
  assert.equal(out.state.used, 3);
});

test("Infinity limit never blocks expansion", () => {
  let state: QuotaState = { used: 999, limit: Infinity, expandedIds: new Set() };
  const out = applyEventExpansion(state, "anything");
  assert.equal(out.result.recorded, true);
  assert.equal(out.result.outOfQuota, undefined);
  assert.equal(remainingQuota(out.state), Infinity);
});

test("applyEventExpansion does not mutate its inputs", () => {
  const initial: QuotaState = makeState(0, 5);
  const initialIds = initial.expandedIds;
  const out = applyEventExpansion(initial, "X");
  assert.equal(out.result.recorded, true);
  // Original state untouched — caller decides whether to commit.
  assert.equal(initial.used, 0);
  assert.equal(initialIds.has("X"), false);
  assert.notEqual(out.state.expandedIds, initialIds);
});
