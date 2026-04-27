// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/api-server/src/lib/holdingsTier.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { isProOrBetter, type EffectiveTierFn } from "./holdingsTier";

// Inline copy of the structural shape we need from tierService; importing
// the real type drags the full tierService module in for ad-hoc transpile,
// which then needs db / storage / adminSchema. The check uses tier only,
// so the structural type is sufficient.
type EffectiveTier = {
  tier: "free" | "pro" | "premium";
  source: "admin_grant" | "stripe" | "apple_iap" | "google_play" | "none";
  expiresAt?: Date;
  grantId?: string;
};

function stub(tier: EffectiveTier["tier"]): EffectiveTierFn {
  return async () => ({ tier, source: "stripe" }) as EffectiveTier;
}

test("free tier is gated — cap-check fires", async () => {
  const result = await isProOrBetter("user-free", stub("free"));
  assert.equal(result, false);
});

test("pro tier bypasses the holdings cap", async () => {
  const result = await isProOrBetter("user-pro", stub("pro"));
  assert.equal(result, true);
});

test("premium tier bypasses the holdings cap", async () => {
  const result = await isProOrBetter("user-premium", stub("premium"));
  assert.equal(result, true);
});

test("admin-granted pro tier counts the same as Stripe pro", async () => {
  // Grants stack on Stripe (see tierService.computeEffectiveTier docs);
  // the cap check just looks at the effective tier, not the source.
  const grantPro: EffectiveTierFn = async () => ({
    tier: "pro",
    source: "admin_grant",
    grantId: "g_abc",
  });
  assert.equal(await isProOrBetter("user-grant", grantPro), true);
});
