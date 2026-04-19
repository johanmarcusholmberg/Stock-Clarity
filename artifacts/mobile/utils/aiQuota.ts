/**
 * Pure quota + cache logic for the shared AI-summary pool.
 *
 * Kept as a standalone module (no React, no AsyncStorage) so it can be
 * unit-tested in isolation and so the rule — "one generation per unique
 * event, forever; cached opens are free" — is easy to verify.
 *
 * The React context (SubscriptionContext) owns the state; this module
 * owns the decision.
 */

export interface QuotaState {
  /** AI summary expansions charged today. Resets at midnight. */
  used: number;
  /** Daily limit. Use `Infinity` for unlimited tiers (e.g. premium). */
  limit: number;
  /** Event IDs already expanded — their summaries can be reopened for free. */
  expandedIds: Set<string>;
}

export interface ExpansionResult {
  recorded: boolean;
  cached?: boolean;
  outOfQuota?: boolean;
}

/**
 * Returns the next state and the outcome of attempting to expand `eventId`.
 *
 *   - `{ recorded: false, cached: true }` — eventId is in the cache; no deduction.
 *   - `{ recorded: true }`                — quota deducted; eventId added to cache.
 *   - `{ recorded: false, outOfQuota: true }` — quota is zero; no change.
 */
export function applyEventExpansion(
  state: QuotaState,
  eventId: string,
): { state: QuotaState; result: ExpansionResult } {
  if (state.expandedIds.has(eventId)) {
    return { state, result: { recorded: false, cached: true } };
  }
  if (state.limit !== Infinity && state.used >= state.limit) {
    return { state, result: { recorded: false, outOfQuota: true } };
  }
  const nextIds = new Set(state.expandedIds);
  nextIds.add(eventId);
  return {
    state: { used: state.used + 1, limit: state.limit, expandedIds: nextIds },
    result: { recorded: true },
  };
}

export function remainingQuota(state: QuotaState): number {
  if (state.limit === Infinity) return Infinity;
  return Math.max(0, state.limit - state.used);
}
