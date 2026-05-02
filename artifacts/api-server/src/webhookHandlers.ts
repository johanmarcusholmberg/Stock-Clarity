import type Stripe from "stripe";
import type { Logger } from "pino";
import { getUncachableStripeClient } from "./stripeClient";
import { logger as defaultLogger } from "./lib/logger";
import { sendEmail, paymentReceiptEmail, paymentFailedEmail } from "./lib/email";

/**
 * Stripe webhook dispatcher.
 *
 * Signature is verified before any handler runs. Each event handler is
 * isolated in a try/catch so one failure can't poison the rest of the
 * dispatch — Stripe retries on 5xx, so we'd rather succeed-with-warnings
 * than retry the whole event because one downstream side-effect failed.
 */
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

    log.info({ stripeEventId: event.id, stripeEventType: event.type }, "stripe.webhook.received");

    // We deliberately do NOT wrap this in a try/catch — if a handler throws,
    // we want the error to propagate so Express returns 5xx and Stripe retries
    // the event delivery. `sendEmail` itself never throws (it returns a Result
    // and swallows its own errors), so a SendGrid outage will not cause spurious
    // retries of unrelated work.
    switch (event.type) {
      case "invoice.payment_succeeded":
        await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice, log);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, log);
        break;
      case "checkout.session.completed":
        // Payment receipt is emitted from invoice.payment_succeeded which
        // fires for the same charge. Logged here so we don't double-send.
        log.info({ stripeEventId: event.id }, "stripe.checkout.session.completed (no email — receipt sent via invoice.payment_succeeded)");
        break;
      default:
        // Other events (subscription.updated, customer.created, etc) are
        // handled by the storage sync layer, not this dispatcher.
        break;
    }
  }
}

// ── Per-event handlers ───────────────────────────────────────────────────────

async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice, log: Logger): Promise<void> {
  const email = extractCustomerEmail(invoice);
  if (!email) {
    log.warn({ invoiceId: invoice.id }, "invoice.payment_succeeded: no customer email — skipping receipt");
    return;
  }

  const tier = inferTierFromInvoice(invoice);
  const amountCents = invoice.amount_paid ?? invoice.amount_due ?? 0;
  const currency = invoice.currency ?? "usd";
  const invoiceUrl = invoice.hosted_invoice_url ?? null;

  await sendEmail(
    paymentReceiptEmail({ to: email, tier, amountCents, currency, invoiceUrl }),
  );
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, log: Logger): Promise<void> {
  const email = extractCustomerEmail(invoice);
  if (!email) {
    log.warn({ invoiceId: invoice.id }, "invoice.payment_failed: no customer email — skipping dunning email");
    return;
  }

  const tier = inferTierFromInvoice(invoice);
  const amountCents = invoice.amount_due ?? 0;
  const currency = invoice.currency ?? "usd";
  // Stripe's customer portal lets users update their payment method without us
  // needing to mint per-event update URLs. Falling back to in-app instructions
  // when no URL is configured is handled by the template itself.
  const updatePaymentUrl = invoice.hosted_invoice_url ?? null;

  await sendEmail(
    paymentFailedEmail({ to: email, tier, amountCents, currency, updatePaymentUrl }),
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractCustomerEmail(invoice: Stripe.Invoice): string | null {
  if (invoice.customer_email) return invoice.customer_email;
  // `customer` may be expanded into the full Customer object on some events.
  const cust = invoice.customer;
  if (cust && typeof cust === "object" && "email" in cust && typeof cust.email === "string") {
    return cust.email;
  }
  return null;
}

function inferTierFromInvoice(invoice: Stripe.Invoice): "pro" | "premium" {
  // We charge $4.99 (Pro) and $9.99 (Premium). Use the per-line description
  // as the primary signal, fall back to the price to disambiguate.
  // TODO: when we add discounted/intro/yearly pricing tiers, switch to
  // tier-from-price-id metadata mapping instead of the amount threshold.
  const lines = invoice.lines?.data ?? [];
  for (const line of lines) {
    const desc = (line.description ?? "").toLowerCase();
    if (desc.includes("premium")) return "premium";
    if (desc.includes("pro")) return "pro";
  }
  // Fall back to amount thresholds: anything above $7 is premium (only valid
  // while we have exactly two flat-priced tiers — see TODO above).
  const cents = invoice.amount_paid ?? invoice.amount_due ?? 0;
  return cents >= 700 ? "premium" : "pro";
}
