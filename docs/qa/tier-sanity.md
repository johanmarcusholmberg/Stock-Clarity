# Tier system sanity check — Phase 3.2 PR 1

Manual QA scripts. Not part of the automated test suite. Run against a
throwaway DB (or a staging DB where these user rows can exist).

## Seed SQL — 4 scenarios

Run once before the tests. Uses hardcoded clerk ids `qa-free`, `qa-stripe`,
`qa-admin`, `qa-conflict` — pick different ids if those collide.

```sql
-- Scenario 1: default user, no subscription, no override
INSERT INTO users (id, clerk_user_id, email, tier, created_at, updated_at)
VALUES ('qa-free', 'qa-free', 'qa-free@example.test', 'free', NOW(), NOW())
ON CONFLICT (clerk_user_id) DO UPDATE
SET tier = 'free', stripe_customer_id = NULL, updated_at = NOW();

-- Scenario 2: Stripe-Pro subscriber, no admin grant
-- Requires an existing stripe.customers row + stripe.subscriptions row with
-- product metadata tier='pro'. If staging doesn't have that, skip this
-- scenario and validate it from a real subscriber instead.
INSERT INTO users (id, clerk_user_id, email, tier, stripe_customer_id, created_at, updated_at)
VALUES ('qa-stripe', 'qa-stripe', 'qa-stripe@example.test', 'pro', '<real_stripe_customer_id>', NOW(), NOW())
ON CONFLICT (clerk_user_id) DO UPDATE
SET tier = 'pro', stripe_customer_id = '<real_stripe_customer_id>', updated_at = NOW();

-- Scenario 3: admin-granted Premium, no Stripe
INSERT INTO users (id, clerk_user_id, email, tier, created_at, updated_at)
VALUES ('qa-admin', 'qa-admin', 'qa-admin@example.test', 'free', NOW(), NOW())
ON CONFLICT (clerk_user_id) DO UPDATE
SET tier = 'free', stripe_customer_id = NULL, updated_at = NOW();

INSERT INTO admin_grants (user_id, tier, expires_at, reason, granted_by_admin, status)
VALUES ('qa-admin', 'premium', NOW() + INTERVAL '30 days', 'qa sanity test', 'qa@example.test', 'active');

-- Scenario 4: conflict — Stripe Pro + admin Premium grant (grant should win)
INSERT INTO users (id, clerk_user_id, email, tier, stripe_customer_id, created_at, updated_at)
VALUES ('qa-conflict', 'qa-conflict', 'qa-conflict@example.test', 'pro', '<real_stripe_customer_id>', NOW(), NOW())
ON CONFLICT (clerk_user_id) DO UPDATE
SET tier = 'pro', stripe_customer_id = '<real_stripe_customer_id>', updated_at = NOW();

INSERT INTO admin_grants (user_id, tier, expires_at, reason, granted_by_admin, status)
VALUES ('qa-conflict', 'premium', NOW() + INTERVAL '7 days', 'qa conflict test', 'qa@example.test', 'active');
```

## Runner — node script

Save as `artifacts/api-server/src/lib/tierService.sanity.ts` and run with a
`DATABASE_URL` set:

```bash
DATABASE_URL=... node --experimental-strip-types \
  artifacts/api-server/src/lib/tierService.sanity.ts
```

Expected output table:

| userId        | expected tier | expected source | expected expiresAt |
|---------------|---------------|-----------------|--------------------|
| `qa-free`     | `free`        | `none`          | undefined          |
| `qa-stripe`   | `pro`         | `stripe`        | Stripe period_end  |
| `qa-admin`    | `premium`     | `admin_grant`   | grant.expires_at (~30d) |
| `qa-conflict` | `premium`     | `admin_grant`   | grant.expires_at (~7d)  |

## End-to-end check — /api/payment/subscription/:userId

After each scenario, hit the route and confirm the response:

```bash
curl -s "$API/api/payment/subscription/qa-free"     | jq
curl -s "$API/api/payment/subscription/qa-stripe"   | jq
curl -s "$API/api/payment/subscription/qa-admin"    | jq
curl -s "$API/api/payment/subscription/qa-conflict" | jq
```

Expected `tier` field matches the table above. `users.tier` column after
the call should match the returned tier (cache-write-through).

## Audit row check

After every admin tier flip (the three `writeAdminAudit` call sites), confirm
an `admin_audit` row landed:

```sql
SELECT admin_email, action, source, previous_state, new_state, created_at
  FROM admin_audit
 WHERE user_id = 'qa-admin'
 ORDER BY created_at DESC
 LIMIT 5;
```

Also exercise each admin endpoint and confirm audit rows appear:

```bash
# email-authed — admin_email should be the requester email
curl -sX POST "$API/api/admin/override-tier" \
  -H 'content-type: application/json' \
  -d '{"requesterId":"<admin_clerk_id>","requesterEmail":"johanmarcusholmberg@gmail.com","targetUserId":"qa-free","tier":"pro"}'

# header-authed — admin_email should be 'x-admin-key'
curl -sX PATCH "$API/api/admin/users/qa-free/tier" \
  -H "x-admin-key: $ADMIN_SECRET_KEY" \
  -H 'content-type: application/json' \
  -d '{"tier":"pro"}'

# dev-only — admin_email should be 'dev-tools'
ENABLE_DEV_TOOLS=true curl -sX PATCH "$API/api/dev/tier" \
  -H 'content-type: application/json' \
  -d '{"userId":"qa-free","tier":"pro"}'
```

## Cleanup

```sql
DELETE FROM admin_audit   WHERE user_id IN ('qa-free','qa-stripe','qa-admin','qa-conflict');
DELETE FROM admin_grants  WHERE user_id IN ('qa-admin','qa-conflict');
DELETE FROM users         WHERE clerk_user_id IN ('qa-free','qa-stripe','qa-admin','qa-conflict');
```
