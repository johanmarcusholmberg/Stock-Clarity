// Pin the canonical disclaimer strings so a future edit can't accidentally
// remove the regulatory micro-copy that has to appear on every AI summary
// and every market-data screen.
//
// Run with:
//   node --test --experimental-strip-types \
//     artifacts/mobile/components/Disclaimer.test.ts
//
// This is a pure-string assertion test (no React rendering) so it can run
// under Node's test runner without a DOM/native shim. The .ts (not .tsx)
// extension is intentional — Node's experimental TS strip only handles .ts,
// and the production Disclaimer.tsx happens to re-export the strings without
// any React types crossing the import boundary.

import test from "node:test";
import assert from "node:assert/strict";
import { AI_DISCLAIMER_TEXT, DATA_DISCLAIMER_TEXT } from "./disclaimerStrings.ts";

// Exact-string assertions — any copy edit needs an explicit test update,
// which forces a conversation about whether legal sign-off is still valid.
test("AI disclaimer copy is exactly the approved string", () => {
  assert.equal(
    AI_DISCLAIMER_TEXT,
    "AI-generated summary — may be incomplete or inaccurate. Not financial advice.",
  );
});

test("Data disclaimer copy is exactly the approved string", () => {
  assert.equal(
    DATA_DISCLAIMER_TEXT,
    "Market data provided by Yahoo Finance. Quotes may be delayed up to 15 minutes and are for informational purposes only — not for trading decisions.",
  );
});

// Spot-check the regulatory keywords too — if a future refactor accidentally
// rewrites the constants, the equality check above will catch it, but these
// give a clearer failure message about WHAT was lost.
test("AI disclaimer mentions both 'AI' and 'Not financial advice'", () => {
  assert.match(AI_DISCLAIMER_TEXT, /AI/i);
  assert.match(AI_DISCLAIMER_TEXT, /not financial advice/i);
});

test("Data disclaimer attributes Yahoo Finance and notes the delay", () => {
  assert.match(DATA_DISCLAIMER_TEXT, /Yahoo Finance/);
  assert.match(DATA_DISCLAIMER_TEXT, /delayed/i);
  assert.match(DATA_DISCLAIMER_TEXT, /informational/i);
});
