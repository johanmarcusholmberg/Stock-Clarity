import type Stripe from "stripe";
import type { Logger } from "pino";
import { getUncachableStripeClient } from "./stripeClient";
import { logger as defaultLogger } from "./lib/logger";

export class WebhookHandlers {
  static async processWebhook(
    payload: Buffer,
    signature: string,
    log: Logger = defaultLogger,
  ): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "STRIPE WEBHOOK ERROR: Payload must be a Buffer. " +
        "This usually means express.json() parsed the body before this handler. " +
        "FIX: Register webhook route BEFORE app.use(express.json())."
      );
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    }

    const stripe = getUncachableStripeClient();
    const event: Stripe.Event = stripe.webhooks.constructEvent(
      payload,
      signature,
      webhookSecret,
    );

    // Hand the verified event off to whatever downstream handlers need it.
    // The server's existing storage/sync layer (`storage.ts`) is the source
    // of truth for users + subscriptions, so emit a structured log here and
    // let domain-specific handlers be added as they're implemented.
    log.info({ stripeEventId: event.id, stripeEventType: event.type }, "stripe.webhook.received");
  }
}
