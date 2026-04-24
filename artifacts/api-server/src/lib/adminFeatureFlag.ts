// Feature-flagging for Phase 3.2 admin-subscription tools (PR 5a).
//
// Two env vars control rollout (design doc §6):
//   ADMIN_SUBSCRIPTION_TOOLS          — 'true' / 'false'. Big off-switch.
//                                       Unset or 'false' disables the feature
//                                       for everyone, even hardcoded admins.
//   ADMIN_SUBSCRIPTION_TOOLS_ADMINS   — comma-separated emails. Empty/unset
//                                       means "all admins allowed" (PR 6
//                                       retires the allowlist entirely).
//
// Server middleware on every PR 2/3/4/5a subscription-tool route enforces
// these; the mobile SubscriptionContext reads the flag via /admin/check and
// hides the UI. Belt-and-braces by design — a missing client gate must not
// permit server-side mutations.

export function isSubscriptionToolsEnabled(): boolean {
  return (process.env.ADMIN_SUBSCRIPTION_TOOLS ?? "").toLowerCase() === "true";
}

function getRolloutAdmins(): string[] {
  const raw = process.env.ADMIN_SUBSCRIPTION_TOOLS_ADMINS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface FeatureFlagState {
  // Feature is turned on at the deployment level (env var is 'true').
  enabled: boolean;
  // This specific caller is allowed to use it. Requires `enabled` plus
  // either (a) empty allowlist (end state) or (b) email matches.
  allowed: boolean;
}

// Decides whether a resolved admin identifier may use the subscription
// tools. The `email` param is whatever resolveAdminEmail() returned, which
// may be a real address or the literal string 'x-admin-key' when the shared
// secret was used. The secret-key path bypasses the rollout allowlist —
// that auth mode has no email to match, and during rollout we want the
// operator console / CI scripts still to work against the endpoints.
// ADMIN_SUBSCRIPTION_TOOLS=false still turns them off even for x-admin-key.
export function canUseSubscriptionTools(email: string): FeatureFlagState {
  if (!isSubscriptionToolsEnabled()) return { enabled: false, allowed: false };
  if (email === "x-admin-key") return { enabled: true, allowed: true };
  const rollout = getRolloutAdmins();
  if (rollout.length === 0) return { enabled: true, allowed: true };
  const normalised = email.toLowerCase().trim();
  return { enabled: true, allowed: rollout.includes(normalised) };
}
