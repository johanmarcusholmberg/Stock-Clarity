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
  - **PaywallSheet**: full-screen paywall modal with Pro/Premium plan cards, monthly/yearly toggle, SAVE 20% badge
- **Contexts**:
  - `WatchlistContext`: watchlist state, alert counts, stock data
  - `SubscriptionContext`: tier (free/pro/premium), AI usage counters, checkout/portal helpers
  - `BenchmarkContext` (`@stockclarify_benchmark_v1`): user-selected market index for Insights ("auto" + 12 indices: SPX/NDX/DJI/RUT/OMXS30/STOXX/FTSE/DAX/CAC/N225/HSI/TSX); hydration is guarded by a `userTouched` ref so a late AsyncStorage read never overwrites a user's in-session choice; cleared on sign-out
- **Insights tab market selector**: pill below the portfolio picker reads "Compared to: <label> · Auto" and opens `MarketPickerSheet` (bottom-sheet modal). Drives both the "Beta vs ..." Risk Metrics row and the Benchmark Comparison section.
- **Cross-platform confirm helper** (`utils/confirm.ts`): `confirmAsync(title, msg, {confirmText, cancelText, destructive})` returns `Promise<boolean>`. Uses `window.confirm()` on web (multi-button `Alert.alert` silently no-ops on react-native-web). Used by `account.tsx` (sign-out, "no billing account" → View Plans) and `portfolio.tsx` (delete holding, free-plan-limit upgrade prompt).
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
- `users` — clerk_user_id, email, tier (free/pro/premium), stripe IDs, AI quota
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
