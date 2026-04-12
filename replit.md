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
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### StockClarify Mobile App (`artifacts/mobile`)
- **Type**: Expo (React Native)
- **Preview Path**: `/`
- **Description**: AI-powered investment companion for non-professional investors
- **Auth**: Clerk email/password with email verification code (`@clerk/expo` v3.1.9, Core v3 API)
  - Custom sign-in/sign-up screens at `app/(auth)/sign-in.tsx` and `app/(auth)/sign-up.tsx`
  - Auth guard in `app/(tabs)/_layout.tsx` — redirects unauthenticated users to sign-in
  - Profile modal with sign-out on watchlist home screen
  - `ClerkProvider` + `ClerkLoaded` wrapping root layout
  - Publishable key injected as `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` in dev script
- **Features**:
  - Personalized Watchlist with stock cards, mini sparkline charts, price/% change, exchange flag
  - Watchlist home: personalized greeting (user first name), stats row (watching/gainers/losers), profile/sign-out modal
  - Daily Digest tab: brief daily summaries + expandable event cards (What/Why/Unusual)
  - Alerts tab: unusual price/volume activity with plain-language explanations + unread badge
  - World Markets (Add) tab: 30+ global stocks from 11 exchanges, grouped by exchange, with search
  - Stock Detail screen: 30-day price chart, company info, event history
  - AsyncStorage persistence for watchlist and read alert state
  - Dark navy color scheme (#0A1628) with teal accent (#00D4B8)
- **Global Stock Universe** (11 exchanges):
  - NASDAQ/NYSE: AAPL, NVDA, MSFT, AMZN, GOOGL, TSLA, META, JPM, V
  - LSE (UK): HSBA.L, AZN.L, SHEL.L, BP.L, ULVR.L
  - XETRA (Germany): SAP.DE, SIE.DE, ALV.DE
  - TSE (Japan): 7203.T, 6758.T, 9432.T
  - HKEX (HK): 0700.HK, 9988.HK
  - TSX (Canada): SHOP.TO, RY.TO
  - ASX (Australia): BHP.AX, CBA.AX
  - SIX (Switzerland): NESN.SW, ROG.SW
  - Euronext (France): MC.PA, AIR.PA
  - NSE (India): RELIANCE.NS, INFY.NS
- **Dependencies**: react-native-svg, @react-native-async-storage/async-storage, @clerk/expo, expo-auth-session, expo-secure-store, expo-crypto

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`
- Clerk proxy middleware at `/__clerk` (via `http-proxy-middleware` + `@clerk/express`)
- `clerkMiddleware()` mounted for session validation on protected routes

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
