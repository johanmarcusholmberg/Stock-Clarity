// Pure logic for the quota/upgrade badge on AI news cards.  Extracted so the
// behaviour can be unit-tested without RN, and so Premium never falls into a
// "LIMIT" path (the bug we're fixing).

export type Tier = "free" | "pro" | "premium";

export type EventBadge =
  // Don't render anything (Premium, already expanded, or a fresh pro user
  // with budget to spare — their quota is visible in the footer).
  | { kind: "none" }
  // Free-tier upsell: "PRO" chip with lock icon.
  | { kind: "upgrade"; label: string; reason: "stock_limit" | "ai_limit_reached" | "feature_gated" }
  // Quota used up for a paid-but-limited tier.  Card should also be dimmed.
  | { kind: "used_up"; label: string; resetsAt: "tomorrow" | "next_week" }
  // Low-quota warning for a paid-but-limited tier (1–2 summaries left).
  | { kind: "quota_low"; label: string; remaining: number };

export interface EventBadgeInput {
  tier: Tier;
  /** Total daily AI summaries the tier can generate; Infinity for Premium. */
  aiLimit: number;
  /** How many summaries the user has generated today. */
  aiUsed: number;
  /** The AI card has summary content (what/why/unusual) to gate. */
  hasAI: boolean;
  /** Whether the card is currently expanded. */
  expanded: boolean;
  /** Whether this specific event was already expanded (cached → no deduction). */
  alreadyExpanded: boolean;
  /** External gate — e.g., the Stock page's "3 stocks/day" limit. */
  canExpand: boolean;
}

export function computeEventBadge(i: EventBadgeInput): EventBadge {
  // Nothing to gate if the card is open, already generated, or has no AI content.
  if (i.expanded || i.alreadyExpanded || !i.hasAI) return { kind: "none" };

  // Premium (or any future Enterprise/unlimited tier) never sees a quota badge.
  // This is the core bug: the old code would fall into "LIMIT" here because
  // `remaining` was treated as 0 when Infinity was set.
  if (i.aiLimit === Infinity) return { kind: "none" };

  const remaining = Math.max(0, i.aiLimit - i.aiUsed);

  // External gate: stock-daily-limit hit. Free users get the "PRO" upsell,
  // paid users get a generic "UPGRADE" prompt.
  if (!i.canExpand) {
    return {
      kind: "upgrade",
      label: i.tier === "free" ? "PRO" : "UPGRADE",
      reason: "stock_limit",
    };
  }

  // Quota exhausted for a limited tier.
  if (remaining <= 0) {
    if (i.tier === "free") {
      // Free user's daily brief budget is spent — upsell.
      return {
        kind: "upgrade",
        label: "PRO",
        reason: "ai_limit_reached",
      };
    }
    return {
      kind: "used_up",
      label: "Limit reached",
      resetsAt: "tomorrow",
    };
  }

  // Low-quota warning: 1–2 summaries left.  At 0 remaining we already
  // returned above, so this only fires when the user can still act.
  if (remaining <= 2) {
    return {
      kind: "quota_low",
      label: `${remaining} left`,
      remaining,
    };
  }

  // Comfortable budget — no top-right badge, the footer carries the count.
  return { kind: "none" };
}
