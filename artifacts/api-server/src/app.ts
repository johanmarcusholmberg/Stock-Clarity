import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import pinoHttp from "pino-http";
import { clerkMiddleware, getAuth } from "@clerk/express";
import router from "./routes";
import adminRouter from "./routes/admin";
import legalRouter from "./routes/legal";
import { logger } from "./lib/logger";
import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
import { WebhookHandlers } from "./webhookHandlers";
import { logError } from "./middlewares/errorLogger";
import { sentryRequestContext, setupExpressSentry } from "./lib/sentry";

const app: Express = express();

// We sit behind the Replit reverse proxy in both dev and prod, so the real
// client IP arrives in `X-Forwarded-For`. Without trusting the proxy, all
// rate limiting collapses to "the proxy IP" and is effectively bypassed.
app.set("trust proxy", 1);

// ── Security headers ─────────────────────────────────────────────────────────
// helmet's defaults are sensible. We disable CSP because the API serves JSON
// and the legal pages render their own minimal inline-styled HTML; a strict
// CSP would have to enumerate every upstream we ever fetch from. We also
// disable Cross-Origin-Embedder-Policy because the mobile app and any future
// embeds need to load resources cross-origin.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

// ── CORS allow-list ──────────────────────────────────────────────────────────
// Build an allow-list from REPLIT_DOMAINS (set automatically on dev + prod)
// plus any extra origins added via ALLOWED_ORIGINS. We also accept any
// *.replit.dev / *.replit.app host because Replit dev URLs change per repl
// and the mobile EAS preview URLs are not known ahead of time.
//
// Reflecting `origin: true` (the previous behavior) is unsafe in production
// because it lets any third-party site drive credentialed requests against
// the API.
const buildAllowedOrigins = (): Set<string> => {
  const set = new Set<string>();
  for (const d of (process.env.REPLIT_DOMAINS ?? "").split(",")) {
    const t = d.trim();
    if (t) set.add(`https://${t}`);
  }
  const expoDomain = (process.env.REPLIT_EXPO_DEV_DOMAIN ?? "").trim();
  if (expoDomain) set.add(`https://${expoDomain}`);
  for (const o of (process.env.ALLOWED_ORIGINS ?? "").split(",")) {
    const t = o.trim();
    if (t) set.add(t);
  }
  return set;
};
const ALLOWED_ORIGINS = buildAllowedOrigins();

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
        Array.isArray(signature) ? signature[0] : signature,
        req.log,
      );
      res.status(200).json({ received: true });
    } catch (err: any) {
      logger.error(err, "Stripe webhook error");
      res.status(400).json({ error: err.message });
    }
  }
);

function isOriginAllowed(origin: string): boolean {
  if (ALLOWED_ORIGINS.has(origin)) return true;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname.endsWith(".replit.dev") ||
      hostname.endsWith(".replit.app") ||
      hostname === "localhost" ||
      hostname === "127.0.0.1"
    );
  } catch {
    return false;
  }
}

app.use(
  cors({
    credentials: true,
    origin: (origin, cb) => {
      // Allow same-origin and tools that don't send Origin (curl, native fetch).
      if (!origin) return cb(null, true);
      if (isOriginAllowed(origin)) return cb(null, true);
      // Deny WITHOUT throwing — the cors lib then simply omits the
      // Access-Control-Allow-Origin header, which the browser treats as a
      // policy violation. We additionally short-circuit below with a clean
      // 403 for visibility, instead of letting it bubble to the 500 handler.
      return cb(null, false);
    },
  }),
);
// Clean 403 for any disallowed cross-origin request so callers see a
// meaningful status code instead of a 500.
app.use((req, res, next): void => {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin && !isOriginAllowed(origin)) {
    logger.warn({ origin, path: req.path }, "CORS blocked unknown origin");
    res.status(403).json({ error: "Origin not allowed" });
    return;
  }
  next();
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(clerkMiddleware());

// Tag Sentry scope with Clerk userId + req id for every authenticated
// request. Must come AFTER clerkMiddleware so req.auth() works.
app.use(sentryRequestContext);

// ── Rate limiting on /api ────────────────────────────────────────────────────
// Layered limits so abuse on cheap endpoints can't drown out legit traffic on
// expensive ones, and write/auth endpoints are tightest. Each limiter uses the
// trust-proxy IP so behavior is per-client, not per-proxy.
const baselineLimiter = rateLimit({
  windowMs: 60_000,
  limit: 300, // 300 req / min / IP — well above legitimate use
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const expensiveLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30, // AI-spending or news-fanout endpoints
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
const writeLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20, // mutation/auth-adjacent endpoints
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
// Prefer the verified Clerk userId for the rate-limit bucket key, falling
// back to a properly-normalized IP for anonymous callers. Without this,
// users sharing a carrier-NAT IP all share one budget, and a single noisy
// device burns the limit for every other user behind the same IP.
//
// Use only on endpoints that REQUIRE a Clerk session (so the userId path
// is the common case). Don't use on /api/auth/* — pre-login traffic must
// stay IP-keyed so brute-force attempts can't escape the limit by simply
// rotating bogus userIds.
function userIdOrIpKey(req: express.Request): string {
  try {
    const uid = getAuth(req)?.userId;
    if (uid) return `u:${uid}`;
  } catch {
    // clerkMiddleware hasn't decorated this request yet — fall through.
  }
  // ipKeyGenerator handles IPv6 subnet normalization correctly. Don't
  // pass req.ip raw or express-rate-limit emits ERR_ERL_KEY_GEN_IPV6.
  return `ip:${ipKeyGenerator(req.ip ?? "")}`;
}

// AI-summary endpoints are by far our most expensive per-request cost
// (LLM tokens). Cap aggressively; legit users only call these on demand.
// Keyed by userId so one user behind a shared carrier IP can't deny
// service to another user on the same IP.
const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  keyGenerator: userIdOrIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
// Signed-URL minting limiter — also userId-keyed for the same reason.
const exportSignLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  keyGenerator: userIdOrIpKey,
  standardHeaders: "draft-7",
  legacyHeaders: false,
});
// Skip GETs so dashboard reads aren't throttled by write limits.
const writesOnly = (req: express.Request) => req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
const writeLimiterPostOnly = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skip: writesOnly,
});

app.use("/api", baselineLimiter);
// Cheap, high-volume reads — keep at expensive (30/min) since stocks/news
// hit upstream APIs we don't want to fan out.
app.use("/api/stocks", expensiveLimiter);
app.use("/api/news", expensiveLimiter);
// LLM-cost endpoints — tightest of all.
app.use("/api/reports", aiLimiter);
// Signed-URL minting: don't let anyone burn through HMAC ops.
app.use("/api/export/sign", exportSignLimiter);
// Subscription / billing surface — writes only, GETs (subscription state
// reads) stay on baseline.
app.use("/api/payment", writeLimiterPostOnly);
// User-mutating CRUD — writes only.
app.use("/api/holdings", writeLimiterPostOnly);
app.use("/api/watchlist", writeLimiterPostOnly);
app.use("/api/alerts", writeLimiterPostOnly);
app.use("/api/notifications", writeLimiterPostOnly);
app.use("/api/notify", writeLimiterPostOnly);
app.use("/api/push-tokens", writeLimiterPostOnly);
// Anonymous-friendly write endpoints — looser cap, but still capped to
// stop one bad client from spamming the analytics table.
app.use("/api/analytics", expensiveLimiter);
// Existing tight caps.
app.use("/api/feedback", writeLimiter);
app.use("/api/account", writeLimiter);
app.use("/api/auth", writeLimiter);

// ── Admin dashboard at /admin ────────────────────────────────────────────────
app.use("/admin", adminRouter);

// ── Legal pages at /legal ────────────────────────────────────────────────────
app.use("/legal", legalRouter);

// ── All other API routes ─────────────────────────────────────────────────────
app.use("/api", router);

// ── Sentry error capture (must come AFTER routes, BEFORE logError) ──────────
// This is the SOLE Sentry error path on the server — Sentry's official
// Express handler reads the active isolation scope (so the req_id +
// userId set by `sentryRequestContext` stick to the captured event),
// captures once, and forwards down the chain so `logError` still runs.
// No-op when SENTRY_DSN isn't set.
setupExpressSentry(app);

// ── Error logging middleware ─────────────────────────────────────────────────
app.use(logError);

export default app;
