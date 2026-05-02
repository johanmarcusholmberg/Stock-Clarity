# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Auth**: Clerk (email/password + verification code flow)
- **Database**: PostgreSQL (public + stripe schemas)
- **Build**: esbuild (ESM bundle)

## Artifacts

### StockClarify Mobile App (`artifacts/mobile`)
- **Type**: Expo (React Native)
- **Preview Path**: `/`
- **Description**: AI-powered investment companion for non-professional investors
- **Auth**: Clerk email/password with email verification code (`@clerk/expo`)
  - Custom sign-in/sign-up screens at `app/(auth)/sign-in.tsx` and `app/(auth)/sign-up.tsx`
  - Auth guard in `app/(tabs)/_layout.tsx` — redirects unauthenticated users to sign-in
  - `ClerkProvider` + `ClerkLoaded` wrapping root layout
- **Features**:
  - Personalized Watchlist with stock cards, mini sparkline charts, price/% change, exchange flag
  - Daily Digest tab: expandable event cards (WHAT/WHY/UNUSUAL) with AI-powered summaries
  - Alerts tab: unusual price/volume activity with plain-language explanations + unread badge
  - World Markets (Add) tab: 30+ global stocks from 11 exchanges, grouped by exchange, with search
  - Stock Detail screen: 30-day price chart, company info, event history
  - **Account tab** (6th tab): profile info, subscription plan badge, AI usage bar, manage subscription, feedback form, sign out; tap the version number (bottom) 5× to reveal hidden Dev Tools panel
  - **Dev Tools panel** (Account tab, hidden): tier switcher (Free/Pro/Premium), direct paywall launcher — changes persist in DB via `/api/dev/tier`
  - AI usage limits: Free=5/day, Pro=unlimited, Premium=unlimited (enforced in `EventCard`)
  - **PaywallSheet**: full-screen paywall modal with Pro/Premium plan cards, monthly/yearly toggle (web only), SAVE 20% badge, Restore Purchases button. On native: yearly toggle hidden (monthly-only IAP at launch), prices use store-localized `pkg.product.priceString` from RevenueCat.
- **RevenueCat IAP** (`services/PurchasesService.ts`, wired in `SubscriptionContext.tsx`): native subscription billing for iOS+Android (Apple/Google policy mandates IAP for digital goods).
  - `findPackageForTier(packages, tier, period)` — period-safe lookup. FIRST filters by RC `PACKAGE_TYPE.MONTHLY`/`ANNUAL` so a yearly product can never be picked when card says "/mo". Then: `EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP` env override (fails closed if configured-but-unmatched), then exact `<tier>_<period>` convention, then guarded substring (avoids `pro` ⊂ `premium` collision).
  - `SubscriptionContext.startCheckout(priceId)` accepts both Stripe price ids (web) and synthetic `iap:<tier>` tokens (native). On native it skips the Stripe flow entirely, looks up the RC package, and calls `purchasePackage()`. RC offerings are pre-fetched into `nativePackages` after `initPurchases` so PaywallSheet renders prices instantly; `nativePackagesLoading` exposes the cold-start state.
  - **Manage Subscription** (account.tsx): on iOS deep-links `https://apps.apple.com/account/subscriptions`; on Android `https://play.google.com/store/account/subscriptions?package=com.stockclarify.app`; web stays on Stripe portal. Apple/Google require OS-level subscription management for store-managed subs.
  - **Entitlement → tier mapping** (`entitlementsToTier`): RC entitlement IDs `pro` and `premium` map to internal tier strings; these IDs must be created in the RC dashboard.
  - **Required env vars** (still TODO): `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (mobile public keys); optional `EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP` for non-conventional product ids.
- **Contexts**:
  - `WatchlistContext`: watchlist state, alert counts, stock data
  - `SubscriptionContext`: tier (free/pro/premium), AI usage counters, checkout/portal helpers
  - `BenchmarkContext` (`@stockclarify_benchmark_v1`): user-selected market index for Insights ("auto" + 12 indices: SPX/NDX/DJI/RUT/OMXS30/STOXX/FTSE/DAX/CAC/N225/HSI/TSX); hydration is guarded by a `userTouched` ref so a late AsyncStorage read never overwrites a user's in-session choice; cleared on sign-out
- **Insights tab market selector**: pill below the portfolio picker reads "Compared to: <label> · Auto" and opens `MarketPickerSheet` (bottom-sheet modal). Drives both the "Beta vs ..." Risk Metrics row and the Benchmark Comparison section.
- **Cross-platform confirm helper** (`utils/confirm.ts`): `confirmAsync(title, msg, {confirmText, cancelText, destructive})` returns `Promise<boolean>`. Uses `window.confirm()` on web (multi-button `Alert.alert` silently no-ops on react-native-web). Used by `account.tsx` (sign-out, "no billing account" → View Plans) and `portfolio.tsx` (delete holding, free-plan-limit upgrade prompt).
- **Sentry crash + error reporting** (mobile + API):
  - **Mobile** (`lib/sentry.ts`, wired in `app/_layout.tsx`): `@sentry/react-native@~7.2.0` (pinned to Expo SDK 54's recommended version). `initSentry()` runs at module scope BEFORE the first render so it catches font-load and ClerkProvider hydration errors. `<SentryUserSync />` mirrors Clerk auth state to `Sentry.setUser({id, email})` (cleared on sign-out). `ErrorBoundary.onError` forwards to `captureSentryException`. Best-effort: silently no-ops without `EXPO_PUBLIC_SENTRY_DSN`. `beforeSend` drops `Network request failed` / `Aborted` (offline blips, already shown in OfflineBanner). `enableNative: false` on web; Expo web uses the browser SDK fallback automatically.
  - **API server** (`src/instrument.ts` + `src/lib/sentry.ts`): `@sentry/node@^9.50.0`. `instrument.ts` is imported FIRST in `src/index.ts` (before `app`) so Sentry's OTel hooks can wrap http/express as those modules load. `sentryRequestContext` middleware (mounted after `clerkMiddleware`) uses `Sentry.withIsolationScope(cb)` — AsyncLocalStorage-backed — to tag every request's scope with `req_id` + Clerk `userId`. **Critical**: must NOT use `Sentry.withScope` here (synchronously popped when callback returns, so tags would be gone before async errors fire). `setupExpressSentry(app)` (mounted after routes, before `logError`) is the SOLE error-capture path — captures once, reads the active isolation scope so request tags stick, forwards to `logError`. PII-light: `setUser({id})` only, no email; Clerk dashboard is the source of truth for `id → email` lookups.
  - **Tracing disabled at launch**: `integrations: []` in `instrument.ts` turns off OTel auto-instrumentation. Pino logs already cover request/latency observability, and OTel monkeypatching inside an esbuild bundle is fragile — silent partial-tracing is a real risk. Error capture works independently of integrations. Post-launch: drop the empty integrations array (or selectively enable `httpIntegration()` + `expressIntegration()`) to turn tracing on. `tracesSampleRate` left at `0.05` prod / `0.5` dev so flipping the switch later doesn't blow the free quota.
  - **Build fix** (`artifacts/api-server/build.mjs`): `@sentry/node` v9 eagerly imports many `@opentelemetry/*` packages at module load, but pnpm only links direct deps into a workspace package's `node_modules` — so transitive OTel deps were unresolvable at runtime (`ERR_MODULE_NOT_FOUND`). Removed `"@opentelemetry/*"` from the esbuild external list (with code comment explaining why) so they get bundled. OTel packages are pure JS (no native bindings); only `@sentry/profiling-node` stays externalized.
  - **Metro fix** (`metro.config.js`): added a blockList for `node_modules/.pnpm/*_tmp_*` paths because Sentry's install left transient extract dirs that crashed Metro's file watcher with `ENOENT`. Defends against the same class of failure for any future heavy dep install.
  - **DSNs are designed to be public** (Sentry's threat model is "anyone who has the DSN can submit events; rate-limiting and inbound filters handle abuse") so `EXPO_PUBLIC_SENTRY_DSN` baking into the JS bundle is the documented pattern.
  - **Deferred (post-launch)**: source-map upload (needs `SENTRY_AUTH_TOKEN` + EAS hook on mobile, esbuild plugin on server). Stack traces work without it but show minified names. Mobile performance tracing is enabled at low sample rate (`0.1` prod) since RN doesn't have the bundling-OTel risk.
- **Offline + network polish** (`lib/network.ts`, `components/Toast.tsx`, `components/OfflineBanner.tsx`):
  - `useOnline()` / `isOnline()` / `useOnReconnect()` exposed from `lib/network.ts`. Web path uses `window` 'online'/'offline' + `navigator.onLine` directly (NetInfo's web build pins `isInternetReachable: false` due to a background fetch to `clients3.google.com` that fails in sandboxed envs). Native path uses NetInfo + AppState→React Query `focusManager` bridging. `useSyncExternalStore` based; SSR-safe (defaults online).
  - `OfflineBanner` slides in from the top when offline (yellow/warning bg, "You're offline — showing saved data"); fully unmounts after slide-out so neither the visual banner nor the alert text remains in the DOM/AX tree when online.
  - In-house `ToastProvider` + `useToast()` — single-slot toast, 4 variants, no third-party dep. Used by pull-to-refresh and feedback submit; Alert.alert kept for destructive confirmations (delete folder/account).
  - QueryClient: `staleTime: 60_000`, `networkMode: "offlineFirst"`, `refetchOnReconnect: true`, retries skip 4xx (max 2).
- **Portfolio Export** (Premium, `components/ExportSheet.tsx` → `/api/export/...`): single "Choose format…" CTA on Insights opens a bottom-sheet with 5 options:
  - **xlsx** (recommended) — `exceljs`-built workbook with two sheets (Holdings: frozen header + autofilter + green/red color-coded change cols + percent format; Summary: portfolio aggregates + notes footer). Filename: `stockclarify-<slug>-<date>.xlsx`.
  - **csv comma** — for US/UK Excel + Google Sheets / Numbers.
  - **csv semicolon** — for EU Excel locales (Sweden, Germany, France); numerics emitted with **comma decimals** (`1234,56`) so Excel imports them as numbers, not text.
  - **tsv** — tab-separated, `.tsv` extension, `text/tab-separated-values` MIME.
  - **PDF** — printable HTML page (browser save-as-PDF).
  All CSV variants prepend a UTF-8 BOM (`\ufeff`) so Excel auto-detects encoding for non-ASCII tickers/company names, plus a 5-row preamble (portfolio name, generated time UTC, holdings count + up/down/flat split, source, blank) before the table header. Cell quoting follows RFC 4180 generalised to the active delimiter. All endpoints gated server-side via `computeEffectiveTier === "premium"` (admin grants stack on Stripe).
- **Global Stock Universe** (11 exchanges): NASDAQ/NYSE, LSE, XETRA, TSE, HKEX, TSX, ASX, SIX, Euronext, NSE

### API Server (`artifacts/api-server`)
- **Type**: Express 5 backend
- **Base path**: `/api`
- Express 5 backend at `/api`, admin dashboard at `/admin`
- Clerk proxy middleware at `/__clerk`
- Yahoo Finance crumb auth for all market data (query2.finance.yahoo.com)

**Routes:**
- `GET /api/healthz` — health check
- `GET /api/stocks/search` — search global stocks
- `GET /api/stocks/quotes` — live quotes (5-min cache)
- `GET /api/stocks/chart/:symbol` — OHLC chart data (1d/5d/1mo/3mo/6mo/1y)
- `GET /api/stocks/events/:symbol` — AI-powered news summaries (gpt-5-mini, 15-min cache)
- `GET /api/payment/plans` — Stripe subscription plans from DB
- `GET /api/payment/config` — Stripe publishable key
- `POST /api/payment/checkout` — create Stripe Checkout session
- `POST /api/payment/portal` — create Stripe Customer Portal session
- `GET /api/payment/subscription/:userId` — user subscription status
- `POST /api/stripe/webhook` — Stripe webhook (registered BEFORE express.json())
- `POST /api/webhooks/revenuecat` — RevenueCat IAP webhook. Constant-time check of the `Authorization` header against `REVENUECAT_WEBHOOK_AUTH_HEADER` (returns 503 fail-closed if secret unset). Event-id dedup via `users.iap_last_event_id`; out-of-order events rejected via `iap_last_event_at` timestamp. Updates the `iap_*` user columns then re-projects effective tier via `computeEffectiveTier`.
- `POST /api/feedback` — submit user feedback
- `GET /api/analytics/trending` — trending stocks (7-day)
- `GET /api/analytics/summary` — public stats
- `POST /api/analytics/track` — track stock views / events
- `GET /admin` — admin dashboard HTML (protected by ADMIN_SECRET_KEY); includes Users section with inline tier override buttons
- `GET /admin/stats` — aggregated metrics API
- `GET /admin/errors` — error logs API
- `GET /admin/feedback` — feedback list API
- `GET /api/admin/users` — list all users with tier info (requireAdmin)
- `PATCH /api/admin/users/:userId/tier` — override a user's tier (requireAdmin); used by admin dashboard
- `PATCH /api/dev/tier` — self-service tier override for testing (dev/staging only; blocked in production)

**Database Tables (public schema):**
- `users` — clerk_user_id, email, tier (free/pro/premium), stripe IDs, AI quota, plus IAP slot: `iap_tier`, `iap_product_id`, `iap_expires_at`, `iap_environment` (sandbox/production), `iap_last_event_id`, `iap_last_event_at`. `computeEffectiveTier` (in `lib/tierService.ts`) honors the IAP slot when `iap_expires_at > now()` with higher-tier-wins vs Stripe.
- `user_events` — event tracking (stock views, AI usage, etc.)
- `stock_views` — per-ticker view counts for trending
- `error_logs` — server error logging
- `feedback` — user feedback with categories and star ratings

**Database Tables (stripe schema):** 29 tables managed by stripe-replit-sync (products, prices, subscriptions, customers, etc.)

**Stripe Plans:**
- Free: no Stripe product (metadata only)
- Pro: $9.99/mo or $95/yr (`StockClarify Pro`)
- Premium: $19.99/mo or $189.99/yr (`StockClarify Premium`)

**Key files:**
- `src/stripeClient.ts` — Stripe SDK + StripeSync initialization via Replit Connectors
- `src/storage.ts` — DB query helpers (users, subscription lookups). `upsertUser` detects first-time inserts via `(created_at = updated_at)` and fires the welcome email.
- `src/db.ts` — raw pg pool
- `src/webhookHandlers.ts` — Stripe webhook dispatcher. Handles `invoice.payment_succeeded` (receipt) + `invoice.payment_failed` (dunning). Errors propagate so Stripe retries on 5xx.

**Transactional Email (`src/lib/email/`):**
- Provider-agnostic: `index.ts` exports `sendEmail()` against an `EmailProvider` interface. To swap providers later, replace `sendgrid.ts` with another implementation — call sites do not change.
- Current provider: SendGrid via `@sendgrid/mail`.
- Templates: `welcome`, `paymentReceipt`, `paymentFailed`, `accountDeletion`, `alertNotification` — all branded to app theme (`#0A1628`), HTML + plain-text fallback, escaped against injection.
- Best-effort by design: if `SENDGRID_API_KEY` is missing, `sendEmail()` logs WARN and returns `{ skipped: true }` without throwing — dev environments and unconfigured prod stay functional.
- Trigger points: `storage.upsertUser` (welcome), `webhookHandlers` (Stripe receipt/dunning), `routes/account.ts` (deletion confirmation, awaited before wipe), `lib/alertEvaluator.ts` (price alerts via SendGrid instead of `email:queued` stub).
- Recipient addresses are logged at DEBUG only on success (PII); ERROR path includes them for triage.

**AI Summaries:**
- Model: `gpt-4o-mini` via Replit AI Integrations proxy (`AI_INTEGRATIONS_OPENAI_BASE_URL` + `AI_INTEGRATIONS_OPENAI_API_KEY`); falls back to `OPENAI_BASE_URL`/`OPENAI_API_KEY` if proxy env not set
- Prompt: stock-specific (includes ticker + company name in user message)
- Format: WHAT / WHY / UNUSUAL sections parsed from plain-text response
- Cache: 15 minutes per ticker

**Production build env** (`scripts/build.js`): bakes `EXPO_PUBLIC_API_URL=https://${expoPublicDomain}/api` and `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` into the Metro bundle so the deployed app doesn't fall back to localhost defaults.

**Environment Variables Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — session secret
- `ADMIN_SECRET_KEY` — protects /admin dashboard (auto-generated)
- `CLERK_*` — managed by Clerk Replit integration
- Stripe credentials — managed by Stripe Replit integration
- `SENDGRID_API_KEY` — required for transactional email (welcome / payment receipt / dunning / account deletion / price alerts). Without it, `sendEmail()` logs WARN and skips gracefully — the rest of the app stays functional.
- `EMAIL_FROM_ADDRESS` (optional, default `alerts@stockclarify.app`) and `EMAIL_FROM_NAME` (optional, default `StockClarify`). The from-domain must be verified in SendGrid for delivery.
- `REVENUECAT_WEBHOOK_AUTH_HEADER` — required for the RevenueCat webhook. The exact value (no `Bearer ` prefix) configured in the RevenueCat dashboard's "Authorization header value" field. Without it, the webhook returns 503 fail-closed (intentional — silently accepting unauthenticated events would let anyone grant themselves Premium).

## Reports feature

The stock detail screen renders `<ReportSummary />`, which lists a ticker's
recent SEC 10-K and 10-Q filings and produces an AI executive summary on
demand. SEC EDGAR fetches and the Anthropic call both run server-side via
`/api/reports?ticker=…&action=filings|text|summary` so the API key never
ships in the mobile bundle and EDGAR's `User-Agent` contract is satisfied.

**Environment variable:**
- `ANTHROPIC_API_KEY` — required for `action=summary`. Without it, the
  filings list still works but `Summarize` returns 503. The data layer
  lives in `artifacts/api-server/src/lib/reports.ts`; the route in
  `artifacts/api-server/src/routes/reports.ts`.

## Scripts (`scripts/`)
- `pnpm --filter @workspace/scripts run seed-products` — create Stripe Pro/Premium plans

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/mobile run dev` — run Expo mobile app
