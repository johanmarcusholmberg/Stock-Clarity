// Tier system sanity runner. Not an automated test — a manual harness.
//
// Requires DATABASE_URL and the seed SQL in docs/qa/tier-sanity.md to have
// been applied. Prints the effective tier + source + expiresAt for each of
// the four canonical scenarios.
//
// Run:
//   DATABASE_URL=... node --experimental-strip-types \
//     artifacts/api-server/src/lib/tierService.sanity.ts
import { computeEffectiveTier } from "./tierService";

interface ExpectedCase {
  userId: string;
  label: string;
  expectedTier: "free" | "pro" | "premium";
  expectedSource: "admin_grant" | "stripe" | "apple_iap" | "google_play" | "none";
  expectsExpiresAt: boolean;
}

const CASES: ExpectedCase[] = [
  {
    userId: "qa-free",
    label: "Scenario 1 — default user",
    expectedTier: "free",
    expectedSource: "none",
    expectsExpiresAt: false,
  },
  {
    userId: "qa-stripe",
    label: "Scenario 2 — Stripe Pro",
    expectedTier: "pro",
    expectedSource: "stripe",
    expectsExpiresAt: true,
  },
  {
    userId: "qa-admin",
    label: "Scenario 3 — admin Premium grant",
    expectedTier: "premium",
    expectedSource: "admin_grant",
    expectsExpiresAt: true,
  },
  {
    userId: "qa-conflict",
    label: "Scenario 4 — Stripe Pro + admin Premium (grant wins)",
    expectedTier: "premium",
    expectedSource: "admin_grant",
    expectsExpiresAt: true,
  },
];

async function main() {
  let passed = 0;
  let failed = 0;
  for (const c of CASES) {
    const actual = await computeEffectiveTier(c.userId);
    const tierOk = actual.tier === c.expectedTier;
    const sourceOk = actual.source === c.expectedSource;
    const expiresOk = c.expectsExpiresAt ? actual.expiresAt instanceof Date : actual.expiresAt === undefined;
    const ok = tierOk && sourceOk && expiresOk;
    if (ok) passed++;
    else failed++;
    console.log(
      `[${ok ? "PASS" : "FAIL"}] ${c.label}`,
      `\n    userId=${c.userId}`,
      `\n    expected  tier=${c.expectedTier} source=${c.expectedSource} expiresAt=${c.expectsExpiresAt ? "<Date>" : "undefined"}`,
      `\n    actual    tier=${actual.tier} source=${actual.source} expiresAt=${actual.expiresAt?.toISOString() ?? "undefined"}${actual.grantId ? ` grantId=${actual.grantId}` : ""}`,
    );
  }
  console.log(`\n${passed}/${passed + failed} passed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("[sanity] runner error:", err);
  process.exit(2);
});
