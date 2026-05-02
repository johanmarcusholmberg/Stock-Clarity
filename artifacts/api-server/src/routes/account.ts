import { Router, type IRouter } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { storage } from "../storage";
import { execute } from "../db";
import { getUncachableStripeClient } from "../stripeClient";
import { sendEmail, accountDeletionEmail } from "../lib/email";

const router: IRouter = Router();

/**
 * DELETE /api/account
 *
 * Permanently deletes the authenticated user's account.
 *
 * Order of operations:
 *   1. Look up user record (need email for feedback rows that may be email-only).
 *   2. Cancel any active Stripe subscription (best-effort warning if it fails —
 *      a Stripe failure should not block the user from removing their data).
 *   3. Wipe every user-linked DB row. ALL deletes here are REQUIRED — if any
 *      one fails we abort BEFORE deleting the Clerk user, so the user can
 *      retry and we never end up with an orphaned-data state where the user
 *      believes their account is gone but data remains.
 *   4. Delete the Clerk user (which invalidates all sessions). This is also
 *      required — if it fails after the DB wipe, we surface a clear error.
 *
 * Apple App Store and Google Play both require this to be reachable from
 * inside the app. See:
 *   https://developer.apple.com/app-store/review/guidelines/#5.1.1(v)
 *
 * Auth: requires a valid Clerk session token. The user can only delete
 * their OWN account — the userId comes from the verified session, not
 * from the request body.
 *
 * Note on in-app purchases: subscriptions purchased through Apple App Store
 * or Google Play CANNOT be cancelled server-side. Only Stripe (web) subs
 * are cancelled here. The mobile UI must instruct users to cancel IAP
 * subscriptions in their App Store / Play Store settings before deletion.
 */
router.delete("/", async (req, res) => {
  const auth = getAuth(req);
  const clerkUserId = auth.userId;
  if (!clerkUserId) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  req.log.info({ clerkUserId }, "Account deletion requested");

  // 1. Look up user record (for email-keyed deletes like feedback).
  const user = await storage.getUserByClerkId(clerkUserId);
  const userEmail: string | null = user?.email ?? null;

  // 1b. Send the deletion confirmation email NOW, while we still have the
  //     user's address. We `await` (rather than fire-and-forget) so the
  //     network round-trip can't be cut off mid-flight by Node tearing down
  //     the request after the wipe completes. `sendEmail` swallows its own
  //     errors and returns a Result, so this can't throw or block deletion.
  if (userEmail) {
    await sendEmail(accountDeletionEmail({ to: userEmail }));
  }

  // 2. Cancel Stripe subscription if any (best-effort — must not block deletion).
  if (user?.stripe_customer_id) {
    try {
      const sub = await storage.getSubscriptionByCustomerId(user.stripe_customer_id);
      if (sub?.id) {
        const stripe = getUncachableStripeClient();
        await stripe.subscriptions.cancel(sub.id, {
          invoice_now: false,
          prorate: false,
        });
        req.log.info(
          { clerkUserId, subscriptionId: sub.id },
          "Cancelled Stripe subscription on account deletion",
        );
      }
    } catch (err) {
      req.log.warn(
        { err, clerkUserId },
        "Account deletion: failed to cancel Stripe subscription (continuing)",
      );
    }
  }

  // 3. Wipe all user-linked DB rows. ALL of these are required: if any
  //    one fails we abort with 500 BEFORE touching Clerk, so the user
  //    can safely retry without ending up half-deleted.
  type DeleteSpec = { table: string; sql: string; params: unknown[] };
  const deletes: DeleteSpec[] = [
    {
      table: "lots",
      sql: "DELETE FROM lots WHERE holding_id IN (SELECT id FROM holdings WHERE user_id = $1)",
      params: [clerkUserId],
    },
    { table: "holdings", sql: "DELETE FROM holdings WHERE user_id = $1", params: [clerkUserId] },
    {
      table: "alert_events",
      sql: "DELETE FROM alert_events WHERE alert_id IN (SELECT id FROM alerts WHERE user_id = $1)",
      params: [clerkUserId],
    },
    { table: "alerts", sql: "DELETE FROM alerts WHERE user_id = $1", params: [clerkUserId] },
    { table: "expo_push_tokens", sql: "DELETE FROM expo_push_tokens WHERE user_id = $1", params: [clerkUserId] },
    { table: "notify_subscriptions", sql: "DELETE FROM notify_subscriptions WHERE user_id = $1", params: [clerkUserId] },
    { table: "notification_events", sql: "DELETE FROM notification_events WHERE user_id = $1", params: [clerkUserId] },
    { table: "admin_grants", sql: "DELETE FROM admin_grants WHERE user_id = $1", params: [clerkUserId] },
    { table: "user_events", sql: "DELETE FROM user_events WHERE user_id = $1", params: [clerkUserId] },
    { table: "stock_views", sql: "DELETE FROM stock_views WHERE user_id = $1", params: [clerkUserId] },
    { table: "portfolio_snapshots", sql: "DELETE FROM portfolio_snapshots WHERE user_id = $1", params: [clerkUserId] },
    { table: "password_history", sql: "DELETE FROM password_history WHERE user_id = $1", params: [clerkUserId] },
    {
      // Feedback rows are linked by either user_id OR email; clear both forms.
      table: "feedback",
      sql: userEmail
        ? "DELETE FROM feedback WHERE user_id = $1 OR email = $2"
        : "DELETE FROM feedback WHERE user_id = $1",
      params: userEmail ? [clerkUserId, userEmail] : [clerkUserId],
    },
    { table: "users", sql: "DELETE FROM users WHERE clerk_user_id = $1", params: [clerkUserId] },
  ];

  const failures: string[] = [];
  for (const { table, sql, params } of deletes) {
    try {
      await execute(sql, params);
    } catch (err) {
      failures.push(table);
      req.log.error(
        { err, table, clerkUserId },
        "Account deletion: REQUIRED delete failed",
      );
    }
  }

  if (failures.length > 0) {
    // Abort BEFORE Clerk delete. The user keeps their account and can retry.
    req.log.error(
      { clerkUserId, failures },
      "Account deletion aborted — required DB deletes failed; Clerk user kept intact",
    );
    return res.status(500).json({
      error:
        "We couldn't fully delete your account just now. No data was changed. Please try again, or contact support if it keeps failing.",
    });
  }

  // Note: admin_audit rows are intentionally retained for compliance/security
  // logging (records administrative actions taken on/by the user, with no
  // free-text personal content). They are anchored by clerk_user_id only.

  // 4. Delete the Clerk user. Required — if this fails, the DB is wiped but
  //    the sign-in still exists, which is a half-deleted state.
  try {
    await clerkClient.users.deleteUser(clerkUserId);
    req.log.info({ clerkUserId }, "Deleted Clerk user on account deletion");
  } catch (err) {
    req.log.error(
      { err, clerkUserId },
      "Account deletion: DB wiped but failed to delete Clerk user — half-deleted state",
    );
    return res.status(500).json({
      error:
        "Your data was removed but we couldn't remove your sign-in. Please contact support.",
    });
  }

  req.log.info({ clerkUserId }, "Account deletion complete");
  return res.json({ ok: true });
});

export default router;
