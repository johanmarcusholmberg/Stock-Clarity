import { Router } from "express";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { storage } from "../storage";
import { logger } from "../lib/logger";
import { computeEffectiveTier } from "../lib/tierService";

const router = Router();

const APP_BASE = () => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:3000";
};

// Payment return page (redirect target from Stripe)
router.get("/return", (req, res) => {
  const status = req.query.status === "cancelled" ? "cancelled" : "success";
  const deepLink = `stockclarify://checkout/${status}`;
  const title = status === "success" ? "Payment Successful" : "Payment Cancelled";
  const message =
    status === "success"
      ? "Your subscription is now active. Returning you to StockClarify..."
      : "Your payment was cancelled. Returning you to StockClarify...";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} – StockClarify</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0A1628;
      color: #E8EDF5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: 24px;
      text-align: center;
    }
    .icon {
      font-size: 64px;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 24px;
      font-weight: 700;
      margin-bottom: 12px;
      color: ${status === "success" ? "#4ADE80" : "#FACC15"};
    }
    p {
      font-size: 16px;
      color: #94A3B8;
      margin-bottom: 32px;
      max-width: 320px;
      line-height: 1.5;
    }
    a.btn {
      display: inline-block;
      background: #3B82F6;
      color: #fff;
      text-decoration: none;
      font-size: 16px;
      font-weight: 600;
      padding: 14px 32px;
      border-radius: 12px;
      transition: background 0.2s;
    }
    a.btn:hover { background: #2563EB; }
    .note {
      margin-top: 20px;
      font-size: 13px;
      color: #64748B;
    }
  </style>
</head>
<body>
  <div class="icon">${status === "success" ? "✅" : "↩️"}</div>
  <h1>${title}</h1>
  <p>${message}</p>
  <a class="btn" href="${deepLink}">Return to App</a>
  <p class="note">If the app didn't open automatically, tap the button above.</p>
  <script>
    (function () {
      var link = "${deepLink}";
      window.location.href = link;
    })();
  </script>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

// Get subscription plans
router.get("/plans", async (_req, res) => {
  try {
    const products = await storage.getProducts();
    res.json({ plans: products });
  } catch (err: any) {
    logger.error(err, "Failed to get plans");
    res.status(500).json({ error: "Failed to load plans" });
  }
});

// Get publishable key (for frontend)
router.get("/config", async (_req, res) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch {
    res.status(500).json({ error: "Stripe not configured" });
  }
});

// Create Stripe Checkout session
router.post("/checkout", async (req, res) => {
  const { priceId, userId, email } = req.body;
  if (!priceId) return void res.status(400).json({ error: "priceId required" });

  try {
    const stripe = await getUncachableStripeClient();
    const base = APP_BASE();

    // Find or create customer
    let customerId: string | undefined;
    if (userId) {
      const user = await storage.getUserByClerkId(userId);
      if (user?.stripe_customer_id) {
        customerId = user.stripe_customer_id;
      } else if (email) {
        // Check if customer already exists in Stripe
        const existingCustomer = await storage.getCustomerByEmail(email);
        if (existingCustomer) {
          customerId = (existingCustomer as any).id;
        } else {
          const customer = await stripe.customers.create({ email, metadata: { userId: userId ?? "" } });
          customerId = customer.id;
          if (userId) await storage.updateUserStripe(userId, customer.id);
        }
      }
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: !customerId ? email : undefined,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${base}/api/payment/return?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/api/payment/return?status=cancelled`,
      metadata: { userId: userId ?? "" },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    logger.error(err, "Checkout creation failed");
    res.status(500).json({ error: err.message });
  }
});

// Customer portal (manage subscription)
router.post("/portal", async (req, res) => {
  const { userId } = req.body;
  if (!userId) return void res.status(400).json({ error: "userId required" });

  try {
    const user = await storage.getUserByClerkId(userId);
    if (!user?.stripe_customer_id) return void res.status(404).json({ error: "No subscription found" });

    const stripe = await getUncachableStripeClient();
    const session = await stripe.billingPortal.sessions.create({
      customer: user.stripe_customer_id,
      return_url: APP_BASE() + "/api/payment/return?status=success",
    });

    res.json({ url: session.url });
  } catch (err: any) {
    logger.error(err, "Portal creation failed");
    res.status(500).json({ error: err.message });
  }
});

// Get user subscription status.
//
// Tier is derived via computeEffectiveTier() — the single source of truth
// that layers active admin_grants over the Stripe subscription. users.tier
// is kept in sync as a cached projection so columns-direct readers (ai
// quota, export gates) don't lag behind this endpoint.
router.get("/subscription/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await storage.getUserByClerkId(userId);
    if (!user) return void res.json({ tier: "free", subscription: null });

    const subscription = user.stripe_customer_id
      ? await storage.getSubscriptionByCustomerId(user.stripe_customer_id)
      : null;

    const effective = await computeEffectiveTier(userId);
    const tier = effective.tier;

    if (tier !== (user.tier ?? "free")) {
      await storage.updateUserTier(userId, tier);
      logger.info({ userId, from: user.tier, to: tier, source: effective.source }, "Tier synced");
    }

    res.json({
      tier,
      subscription: subscription ? {
        id: (subscription as any).id,
        status: (subscription as any).status,
        currentPeriodEnd: (subscription as any).current_period_end,
      } : null,
    });
  } catch (err: any) {
    logger.error(err, "Subscription fetch failed");
    res.status(500).json({ error: err.message });
  }
});

export default router;
