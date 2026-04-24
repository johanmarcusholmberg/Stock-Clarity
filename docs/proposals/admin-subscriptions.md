# Admin Subscription Management — Design Proposal (2026-04-21)

Scope: Phase 3 item 9 — let Admin move any user between tiers regardless of subscription source, with correct downstream billing effects, a full audit trail, and safety controls.

Tracked files:
- [artifacts/api-server/src/routes/admin.ts:391](artifacts/api-server/src/routes/admin.ts:391) — current `PATCH /users/:userId/tier` endpoint
- [artifacts/api-server/src/routes/admin.ts:247](artifacts/api-server/src/routes/admin.ts:247) — server-rendered admin HTML (the inline tier buttons)
- [artifacts/api-server/src/routes/payment.ts:188](artifacts/api-server/src/routes/payment.ts:188) — `/subscription/:userId` (tier reconciliation that silently overwrites admin flips)
- [artifacts/api-server/src/storage.ts:27](artifacts/api-server/src/storage.ts:27) — `getTierFromSubscription`
- [artifacts/mobile/app/(tabs)/admin-panel.tsx](artifacts/mobile/app/(tabs)/admin-panel.tsx) — mobile admin UI

---

## 1. Where we are today

- Admin identity is email-based — `isAdminEmail` at [admin.ts:18](artifacts/api-server/src/routes/admin.ts:18). Two overlapping auth modes: user-invoked routes check Clerk email; dashboard routes require `x-admin-key` from `ADMIN_SECRET_KEY`. Mobile admin panel uses the email mode.
- Tier mutation = `PATCH /api/admin/users/:userId/tier` at [admin.ts:391](artifacts/api-server/src/routes/admin.ts:391). Validates the tier string and calls `storage.updateUserTier`. **No audit. No expiry. No source awareness. No side effect on Stripe.**
- **Bug the spec is about:** the effective tier is recomputed on every `/subscription/:userId` hit at [payment.ts:201](artifacts/api-server/src/routes/payment.ts:201). Stripe is trusted as ground truth and writes back to `users.tier`. An admin's manual flip is silently overwritten on the user's next tier sync.
- **No IAP.** `grep -ri 'apple\|iap\|rev.*cat\|google.*play' artifacts/api-server/src` returns zero. Stripe is the only real subscription source today; manual flips via the admin panel are the only override mechanism.
- Two admin UIs exist: server-rendered HTML at [admin.ts:247](artifacts/api-server/src/routes/admin.ts:247) and the mobile [admin-panel.tsx](artifacts/mobile/app/(tabs)/admin-panel.tsx). Phase 2 shipped the premium-funnel panel in the mobile app, not the HTML — the mobile panel is the direction of travel.

Scope implication: we ship the **infra** for all four sources (Stripe / Apple / Google / Manual) but only Stripe + Manual actually mutate external state today. Apple/Google actions ship as audit-logged stubs returning "IAP not integrated yet" — ready to activate when IAP lands, and useful as evidence of intent ("admin tried to cancel an Apple sub on date X") the day we do.

## 2. Schema additions

Three additions. `CREATE TABLE IF NOT EXISTS` on module load, same pattern as alerts.

```sql
-- One row per explicit "give this user tier X until Y" grant.
CREATE TABLE IF NOT EXISTS admin_grants (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           TEXT NOT NULL,              -- Clerk user id
  tier              TEXT NOT NULL CHECK (tier IN ('pro','premium')),
  expires_at        TIMESTAMPTZ NOT NULL,
  reason            TEXT NOT NULL,
  granted_by_admin  TEXT NOT NULL,              -- admin email (stable identifier)
  status            TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active','revoked','expired')),
  revoked_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX admin_grants_user_active_idx ON admin_grants (user_id) WHERE status = 'active';
CREATE INDEX admin_grants_expiry_idx      ON admin_grants (expires_at) WHERE status = 'active';

-- Append-only. Never updated, never deleted.
CREATE TABLE IF NOT EXISTS admin_audit (
  id              BIGSERIAL PRIMARY KEY,
  admin_email     TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  action          TEXT NOT NULL,   -- 'grant'|'revoke'|'extend'|'cancel'|'refund'|'tier_flip'|'expire'
  source          TEXT NOT NULL,   -- 'stripe'|'apple_iap'|'google_play'|'manual'
  previous_state  JSONB,
  new_state       JSONB,
  reason          TEXT,
  metadata        JSONB,           -- e.g. { refund_amount_cents, extend_days, stripe_subscription_id }
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX admin_audit_user_idx  ON admin_audit (user_id, created_at DESC);
CREATE INDEX admin_audit_admin_idx ON admin_audit (admin_email, created_at DESC);

-- Anticipates IAP. Not populated until IAP ships. Nullable today.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS iap_source                  TEXT,  -- 'apple'|'google'|NULL
  ADD COLUMN IF NOT EXISTS iap_original_transaction_id TEXT;
```

"Never delete subscription history" from the spec: Stripe's own data lives in the `stripe.*` schema owned by `stripe-replit-sync` — we never write to it. Our history = `admin_audit` + `admin_grants`. Soft-delete via `status='revoked'` flip + a new audit row.

## 3. The effective-tier function

One function determines a user's current tier. Today this logic is split between the `users.tier` column and the Stripe reconciliation in [payment.ts:193](artifacts/api-server/src/routes/payment.ts:193). We unify:

```ts
// Priority order (first non-empty wins):
//   1. Active admin_grant — manual overrides always win (that's the whole point)
//   2. Active Stripe subscription — current behaviour
//   3. Active IAP subscription — stub until IAP integration
//   4. 'free'
async function computeEffectiveTier(userId: string):
  Promise<{ tier: Tier; source: Source; expiresAt?: Date }> { … }
```

Rationale: an admin granting a goodwill Premium month must outrank a stale Stripe sync. The existing `users.tier` column becomes a **cached projection** — updated on admin writes and by the grant-expiry cron (§5), not a source of truth. The existing `getTierFromSubscription` at [storage.ts:27](artifacts/api-server/src/storage.ts:27) stays, called from inside `computeEffectiveTier`.

**Grant stacking:** if a user has both an active Stripe Pro sub and an active Premium grant, effective tier = Premium. When the grant expires they drop back to Stripe Pro, not to Free. Revocation behaves the same way. This matters: the alternative ("grant replaces Stripe") would accidentally demote paying customers.

## 4. Per-source action flows

The admin sees the same action list regardless of source. Dialog copy and side effects differ:

| Action | Stripe | Apple IAP | Google Play | Manual |
|---|---|---|---|---|
| **Grant** tier (N days, reason) | Insert `admin_grants`. Stripe untouched. | Same. | Same. | Same. |
| **Revoke** grant | `admin_grants.status='revoked'`. Stripe untouched. | Same. | Same. | Same. |
| **Extend** by N days | Bumps `expires_at` on the active grant; creates one at current tier if none. | Local only. Does not extend IAP entitlement. | Same. | Same. |
| **Cancel** subscription | Stripe API `subscriptions.update(id, { cancel_at_period_end: true })` default; dialog also offers "Cancel immediately, no refund" and "Cancel immediately + refund remaining". | **Cannot cancel server-side.** Dialog: "Apple manages this subscription — the user must cancel in App Store settings." Button "Send instructions" emails the steps. Local access can be revoked separately. | Play Developer API `purchases.subscriptions.cancel`. Same UX as Stripe. | N/A — Manual = grant only. |
| **Refund** | Stripe Refunds API, partial allowed. `metadata.refund_amount_cents` in audit. | Apple's refund API is limited — admin can *request* on user's behalf. Dialog surfaces that. | Play Console / API. Same shape as Stripe. | N/A. |

Source detection — one `resolveSubscriptionSource(userId)` helper, checked in order:
1. Active Stripe subscription → `stripe`
2. `users.iap_source` set → `apple_iap` / `google_play`
3. Active `admin_grants` (no underlying sub) → `manual`
4. Else `none` (user is free; only "Grant" is offered)

Admin never picks the source — the UI presents the right dialog automatically.

## 5. Scheduled tasks

Two jobs, same `startAlertEvaluator` in-process pattern:

- **`grant_expiry`** — hourly. `SELECT … WHERE status='active' AND expires_at < NOW()` → flip `status='expired'`, recompute effective tier, write `admin_audit` with action `'expire'`. Idempotent via the status filter.
- **`grant_expiry_warning`** — daily 09:00 UTC. For any active grant with `expires_at` within 3 days, send a transactional email (reusing the Stripe-sender plumbing Phase 2 uses for email alerts). Warn-once semantics: track `warn_sent_at` on the grant row, or a `user_events` row with `event_type = 'grant_expiry_warned'` keyed on grant id.

## 6. UI

New admin screen replaces inline tier buttons. Target: mobile — new React Native route `/(tabs)/admin-panel/user/:userId`. The server-rendered HTML gets a banner ("Open in admin app") linking to the mobile deep-link; we don't want to maintain two admin UIs long-term.

Layout:
- **Header.** Email, Clerk id, current tier badge + source, Stripe period end if applicable.
- **Actions drawer.** Grant / Extend / Revoke / Cancel / Refund. Each opens a dialog. Per-source availability follows §4 — disabled buttons show the reason in a tooltip.
- **Audit log panel.** Last 50 `admin_audit` rows for this user, newest first. Expandable `previous_state` / `new_state` JSON diff.

Safety:
- Every mutating action requires typing the target user's **email** (we don't have usernames; per [admin.ts:247](artifacts/api-server/src/routes/admin.ts:247), email is the human-facing id). Cancellation additionally requires typing `CANCEL`.
- Rate limit: `10 destructive actions / admin email / hour`, sliding window in memory (keyed on admin email).
- Feature flag: `ADMIN_SUBSCRIPTION_TOOLS=true` gates the screen; `ADMIN_SUBSCRIPTION_TOOLS_ADMINS=alice@…,bob@…` gates which admins can use it during rollout. Senior admins only until the audit log has a week of clean data.

## 7. Implementation sequencing

1. **PR 1 — schema + effective-tier function:**
   - `adminSchema.ts` with the three additions.
   - `computeEffectiveTier()` replacing ad-hoc logic in [payment.ts:193](artifacts/api-server/src/routes/payment.ts:193).
   - Write an `admin_audit` row on every existing tier flip — history backfills from day one.

2. **PR 2 — grants API + expiry cron:**
   - `POST /api/admin/users/:userId/grants`, `DELETE …/grants/:grantId`, `PATCH …/grants/:grantId`.
   - `startGrantExpiryWorker()` from `index.ts:50`.

3. **PR 3 — Stripe cancel + refund:**
   - `POST /api/admin/users/:userId/cancel` with `{ mode: 'period_end'|'immediate'|'immediate_refund' }`.
   - `POST /api/admin/users/:userId/refund` with partial-cent support.

4. **PR 4 — IAP stubs + audit event hooks:**
   - Apple / Google cancel + refund endpoints return 501 with the right user-facing error, but write `admin_audit` rows.
   - Keeps future IAP integration mechanical.

5. **PR 5 — mobile admin UI:**
   - Screen under `/(tabs)/admin-panel/user/:userId`.
   - Feature-flagged to `ADMIN_SUBSCRIPTION_TOOLS_ADMINS`.

6. **PR 6 — retire HTML tier buttons, flip flag to all admins.**

## 8. Open questions

1. **"Type the username" → type the email.** We don't have usernames. Email is what admins see in every list view today. Confirm the email-typing barrier is sufficient.
2. **Admin identity persistence.** We key audit on `admin_email` because the admin allowlist is an env var, not a DB table. If we grow past ~5 admins or want "admin left" flows, add an `admins` table. Defer.
3. **IAP stubs — ship or skip?** Recommend ship in PR 4. The audit evidence ("attempted Apple cancel on date X") is useful the day IAP integration lands. Greyed buttons with explanatory copy.
4. **Refund default on cancel-immediately.** Default to no refund with an explicit refund step? Or default prorated? Stripe's own convention is "no refund by default" — I recommend matching.
5. **Grant stacking behaviour.** §3 proposes grants ride on top (user gets MAX(stripe, grant)). Alternative is replace. Confirm — wrong choice here silently demotes paying customers.
6. **Audit log visibility.** Per-user page only, or a global "everything that happened in the last 7 days" admin-wide log? Second one is cheap and the debugging value is obvious. I'd add it as an extra tab in PR 5.

---

*Stop here for team review. No implementation until schema, effective-tier order, and per-source cancellation flows are signed off.*
