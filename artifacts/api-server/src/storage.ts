import { query, queryOne, execute } from "./db";

export const storage = {
  // ── Stripe read helpers ─────────────────────────────────────────────────────
  async getProducts() {
    return query(`
      SELECT p.id, p.name, p.description, p.active, p.metadata,
             json_agg(json_build_object('id', pr.id, 'unit_amount', pr.unit_amount, 'currency', pr.currency, 'interval', pr.recurring->>'interval')) as prices
      FROM stripe.products p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      WHERE p.active = true
      GROUP BY p.id
      ORDER BY p.metadata->>'sort_order'
    `);
  },

  async getSubscriptionByCustomerId(customerId: string) {
    return queryOne(`
      SELECT s.* FROM stripe.subscriptions s
      WHERE s.customer = $1
      AND s.status IN ('active', 'trialing')
      ORDER BY s.created DESC
      LIMIT 1
    `, [customerId]);
  },

  async getCustomerByEmail(email: string) {
    return queryOne("SELECT * FROM stripe.customers WHERE email = $1 LIMIT 1", [email]);
  },

  // ── User helpers ────────────────────────────────────────────────────────────
  async upsertUser(clerkUserId: string, email?: string) {
    return queryOne<any>(`
      INSERT INTO users (id, clerk_user_id, email, created_at, updated_at)
      VALUES ($1, $1, $2, NOW(), NOW())
      ON CONFLICT (clerk_user_id) DO UPDATE
      SET email = COALESCE($2, users.email), updated_at = NOW()
      RETURNING *
    `, [clerkUserId, email ?? null]);
  },

  async getUserByClerkId(clerkUserId: string) {
    return queryOne<any>("SELECT * FROM users WHERE clerk_user_id = $1", [clerkUserId]);
  },

  async updateUserStripe(clerkUserId: string, stripeCustomerId: string, subscriptionId?: string | null) {
    return execute(`
      UPDATE users SET stripe_customer_id = $2, stripe_subscription_id = $3, updated_at = NOW()
      WHERE clerk_user_id = $1
    `, [clerkUserId, stripeCustomerId, subscriptionId ?? null]);
  },

  async updateUserTier(clerkUserId: string, tier: "free" | "pro" | "premium") {
    return execute("UPDATE users SET tier = $2, updated_at = NOW() WHERE clerk_user_id = $1", [clerkUserId, tier]);
  },

  async checkAndResetAiQuota(clerkUserId: string) {
    const user = await queryOne<any>(`
      SELECT ai_summaries_today, ai_summaries_reset_date, tier FROM users WHERE clerk_user_id = $1
    `, [clerkUserId]);
    if (!user) return { allowed: true, remaining: 999 };

    const today = new Date().toISOString().split("T")[0];
    if (user.ai_summaries_reset_date !== today) {
      await execute("UPDATE users SET ai_summaries_today = 0, ai_summaries_reset_date = $2 WHERE clerk_user_id = $1", [clerkUserId, today]);
      user.ai_summaries_today = 0;
    }

    const limits: Record<string, number> = { free: 5, pro: 999, premium: 9999 };
    const limit = limits[user.tier] ?? 5;
    const remaining = Math.max(0, limit - user.ai_summaries_today);
    return { allowed: remaining > 0, remaining, limit, current: user.ai_summaries_today };
  },

  async incrementAiUsage(clerkUserId: string) {
    await execute("UPDATE users SET ai_summaries_today = ai_summaries_today + 1 WHERE clerk_user_id = $1", [clerkUserId]);
  },
};
