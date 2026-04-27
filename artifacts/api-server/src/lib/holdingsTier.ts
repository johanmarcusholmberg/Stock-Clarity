// Tiny pure-ish module for the "is this user Pro or better?" check used by
// the holdings routes. Lives in its own file so unit tests can import it
// without dragging in the route's schema/DB imports.
//
// `import type` for EffectiveTier means this module has zero runtime imports
// — tests can construct a stub fn and pass it in.

import type { EffectiveTier } from "./tierService";

export type EffectiveTierFn = (userId: string) => Promise<EffectiveTier>;

export async function isProOrBetter(
  userId: string,
  effectiveTierFn: EffectiveTierFn,
): Promise<boolean> {
  const eff = await effectiveTierFn(userId);
  return eff.tier === "pro" || eff.tier === "premium";
}
