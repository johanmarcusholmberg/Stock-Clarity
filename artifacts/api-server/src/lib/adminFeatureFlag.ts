// Feature flag for Phase 3.2 admin-subscription tools.
//
// ADMIN_SUBSCRIPTION_TOOLS — kill-switch. Defaults to enabled.
//   Set 'false' explicitly to disable for everyone, even hardcoded admins
//   (belt-and-braces: server middleware enforces, mobile client gates UI).
//
// The ADMIN_SUBSCRIPTION_TOOLS_ADMINS rollout allowlist was retired in PR 6.
// All admins now have access when the kill-switch is on.

export function isSubscriptionToolsEnabled(): boolean {
  return (process.env.ADMIN_SUBSCRIPTION_TOOLS ?? "").toLowerCase() !== "false";
}

export interface FeatureFlagState {
  // Feature is turned on at the deployment level (kill-switch not 'false').
  enabled: boolean;
  // This caller may use it. Identical to `enabled` now that the allowlist
  // is gone — kept on the shape so mobile clients reading /admin/check
  // don't need to be rebuilt. Collapse the two fields on the next client
  // rev if we don't reintroduce per-admin gating.
  allowed: boolean;
}

export function canUseSubscriptionTools(): FeatureFlagState {
  const enabled = isSubscriptionToolsEnabled();
  return { enabled, allowed: enabled };
}
