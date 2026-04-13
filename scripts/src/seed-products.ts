import { getUncachableStripeClient } from "./stripeClient";

async function createProducts() {
  const stripe = await getUncachableStripeClient();
  console.log("Creating StockClarify subscription plans in Stripe...");

  const plans = [
    {
      name: "StockClarify Pro",
      description: "Unlimited AI news summaries, unlimited watchlist stocks, advanced analytics",
      metadata: { tier: "pro", sort_order: "1", ai_summaries_per_day: "unlimited", watchlist_limit: "50" },
      priceMonthly: 999, // $9.99
      priceYearly: 9500, // $95.00 (~20% off)
    },
    {
      name: "StockClarify Premium",
      description: "Everything in Pro + priority support, exclusive market insights, and early access to new features",
      metadata: { tier: "premium", sort_order: "2", ai_summaries_per_day: "unlimited", watchlist_limit: "unlimited" },
      priceMonthly: 1999, // $19.99
      priceYearly: 18999, // $189.99 (~21% off)
    },
  ];

  for (const plan of plans) {
    const existing = await stripe.products.search({
      query: `name:'${plan.name}' AND active:'true'`,
    });
    if (existing.data.length > 0) {
      console.log(`✓ ${plan.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: plan.metadata,
    });
    console.log(`Created: ${product.name} (${product.id})`);

    const monthly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.priceMonthly,
      currency: "usd",
      recurring: { interval: "month" },
      metadata: { billing_period: "monthly" },
    });
    console.log(`  Monthly: $${plan.priceMonthly / 100}/mo (${monthly.id})`);

    const yearly = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.priceYearly,
      currency: "usd",
      recurring: { interval: "year" },
      metadata: { billing_period: "yearly" },
    });
    console.log(`  Yearly: $${plan.priceYearly / 100}/yr (${yearly.id})`);
  }

  console.log("\n✅ Products ready! Webhooks will sync to your database.");
}

createProducts().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
