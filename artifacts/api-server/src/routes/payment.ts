import { Router } from "express";
import { getUncachableStripeClient, getStripePublishableKey } from "../stripeClient";
import { storage } from "../storage";
import { logger } from "../lib/logger";

const router = Router();

const APP_BASE = () => {
  const domain = process.env.REPLIT_DOMAINS?.split(",")[0];
  return domain ? `https://${domain}` : "http://localhost:3000";
};

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
      success_url: `${base}/mobile?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/mobile?checkout=cancelled`,
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
      return_url: APP_BASE() + "/mobile",
    });

    res.json({ url: session.url });
  } catch (err: any) {
    logger.error(err, "Portal creation failed");
    res.status(500).json({ error: err.message });
  }
});

// Get user subscription status
router.get("/subscription/:userId", async (req, res) => {
  const { userId } = req.params;
  try {
    const user = await storage.getUserByClerkId(userId);
    if (!user) return void res.json({ tier: "free", subscription: null });

    let subscription = null;
    if (user.stripe_customer_id) {
      subscription = await storage.getSubscriptionByCustomerId(user.stripe_customer_id);
    }

    res.json({
      tier: user.tier ?? "free",
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
