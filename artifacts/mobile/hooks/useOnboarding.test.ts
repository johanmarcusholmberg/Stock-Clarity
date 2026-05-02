// @ts-nocheck — Node stdlib imports (node:test, node:assert/strict) don't
// resolve without @types/node, which the mobile workspace doesn't install.
// Matches the convention used by utils/aiQuota.test.ts.
//
// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/mobile/hooks/useOnboarding.test.ts
//
// The hook itself is React + AsyncStorage and isn't covered here. What we
// test is the *contract* the (tabs)/_layout.tsx redirect depends on:
//   - the storage key string is stable across releases
//   - parseStoredValue() correctly maps stored values → status, including
//     legacy / corrupt values which must default to "needed" (i.e. show the
//     walkthrough) rather than silently swallowing the first launch.

import test from "node:test";
import assert from "node:assert/strict";
import { ONBOARDING_KEY, parseStoredValue } from "./useOnboarding.ts";

test("ONBOARDING_KEY is the documented v1 key (changing it re-shows onboarding to all users)", () => {
  assert.equal(ONBOARDING_KEY, "@stockclarify_onboarding_completed_v1");
});

test("parseStoredValue returns 'completed' only for the exact string \"1\"", () => {
  assert.equal(parseStoredValue("1"), "completed");
});

test("parseStoredValue treats null as 'needed' (first launch on a fresh install)", () => {
  assert.equal(parseStoredValue(null), "needed");
});

test("parseStoredValue treats empty string as 'needed' (corrupt write should re-prompt)", () => {
  assert.equal(parseStoredValue(""), "needed");
});

test("parseStoredValue treats unexpected values as 'needed' (forward-compat: future v2 marker won't bypass)", () => {
  assert.equal(parseStoredValue("true"), "needed");
  assert.equal(parseStoredValue("0"), "needed");
  assert.equal(parseStoredValue("yes"), "needed");
});
