import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./stripeClient";
import { startAlertEvaluator } from "./lib/alertEvaluator";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set — Stripe sync skipped");
    return;
  }
  try {
    logger.info("Running Stripe migrations...");
    await runMigrations({ databaseUrl });

    logger.info("Connecting to Stripe...");
    const stripeSync = await getStripeSync();

    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);

    logger.info("Syncing Stripe data...");
    await stripeSync.syncBackfill();

    logger.info("Stripe initialized successfully");
  } catch (err: any) {
    logger.warn({ err: err.message }, "Stripe initialization failed — continuing without Stripe");
  }
}

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Initialize Stripe in background (non-blocking)
  initStripe().catch((e) => logger.warn(e, "Stripe init error"));

  // Start the alerts evaluator worker (non-blocking). Skips silently if the
  // DB isn't available — schema creation just fails and the evaluator loop
  // logs warnings on each tick.
  startAlertEvaluator().catch((e) => logger.warn(e, "Alert evaluator start error"));
});
