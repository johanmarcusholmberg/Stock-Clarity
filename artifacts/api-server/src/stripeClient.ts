import Stripe from "stripe";

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

export function getUncachableStripeClient(): Stripe {
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"), {
    apiVersion: "2025-08-27.basil" as any,
  });
}

export function getStripePublishableKey(): string {
  return requireEnv("STRIPE_PUBLISHABLE_KEY");
}

export function getStripeSecretKey(): string {
  return requireEnv("STRIPE_SECRET_KEY");
}
