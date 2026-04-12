# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Artifacts

### StockClarify Mobile App (`artifacts/mobile`)
- **Type**: Expo (React Native)
- **Preview Path**: `/`
- **Description**: AI-powered investment companion for non-professional investors
- **Features**:
  - Personalized Watchlist with stock cards, mini sparkline charts, price/% change
  - Daily Digest tab: brief daily summaries + expandable event cards (What/Why/Unusual)
  - Alerts tab: unusual price/volume activity with plain-language explanations + unread badge
  - Add Stocks tab: searchable list with one-tap add/remove from watchlist
  - Stock Detail screen: 30-day price chart, company info, event history
  - AsyncStorage persistence for watchlist and read alert state
  - Dark navy color scheme (#0A1628) with teal accent (#00D4B8)
- **Dependencies**: react-native-svg, @react-native-async-storage/async-storage

### API Server (`artifacts/api-server`)
- Express 5 backend at `/api`

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
