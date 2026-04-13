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
- `src/storage.ts` — DB query helpers (users, subscription lookups)
- `src/db.ts` — raw pg pool
- `src/webhookHandlers.ts` — Stripe webhook processing

**AI Summaries:**
- Model: `gpt-5-mini` via Replit AI proxy
- Prompt: stock-specific (includes ticker + company name in user message)
- Format: WHAT / WHY / UNUSUAL sections parsed from plain-text response
- Cache: 15 minutes per ticker

**Environment Variables Required:**
- `DATABASE_URL` — PostgreSQL connection string
- `SESSION_SECRET` — session secret
- `ADMIN_SECRET_KEY` — protects /admin dashboard (auto-generated)
- `CLERK_*` — managed by Clerk Replit integration
- Stripe credentials — managed by Stripe Replit integration

## Scripts (`scripts/`)
- `pnpm --filter @workspace/scripts run seed-products` — create Stripe Pro/Premium plans

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/mobile run dev` — run Expo mobile app
