import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import adminRouter from "./routes/admin";
import { logger } from "./lib/logger";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import { logError } from "./middlewares/errorLogger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

// ── Stripe webhook MUST come before express.json() ──────────────────────────
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) return void res.status(400).json({ error: "Missing signature" });
    try {
      await WebhookHandlers.processWebhook(
        req.body as Buffer,
        Array.isArray(signature) ? signature[0] : signature
      );
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error(err, "Stripe webhook error");
      res.status(400).json({ error: err.message });
    }
  }
);

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware());

// ── Admin dashboard at /admin ────────────────────────────────────────────────
app.use("/admin", adminRouter);

// ── All other API routes ─────────────────────────────────────────────────────
app.use("/api", router);

// ── Error logging middleware ─────────────────────────────────────────────────
app.use(logError);

export default app;
