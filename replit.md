# Overview

This project is a pnpm workspace monorepo using TypeScript, designed to build StockClarify, an AI-powered investment companion mobile app for non-professional investors. It aims to provide personalized financial insights, stock tracking, and market analysis through an intuitive mobile interface.

The project encompasses:
- A mobile application built with Expo (React Native) offering features like personalized watchlists, daily digests with AI summaries, alerts for unusual market activity, global market exploration, and detailed stock information.
- A robust Express 5 API backend that handles data retrieval, AI processing, user authentication, subscription management, and analytics.

The core vision is to democratize investment knowledge by making complex financial data understandable and actionable for everyday users, leveraging AI for insights and a seamless user experience.

# User Preferences

I prefer iterative development, with a focus on delivering functional increments. Please ask before making major architectural changes or introducing new external dependencies. For code, I appreciate clear, self-documenting styles and well-structured modules. When explaining technical concepts, please be direct and concise, providing examples where helpful.

# System Architecture

## Monorepo Structure
The project uses pnpm workspaces for a monorepo setup, with each package managing its own dependencies.

## Technology Stack
- **Node.js**: Version 24
- **Package Manager**: pnpm
- **TypeScript**: Version 5.9
- **API Framework**: Express 5
- **Authentication**: Clerk (email/password with verification code flow)
- **Database**: PostgreSQL (with separate `public` and `stripe` schemas)
- **Build Tool**: esbuild (for ESM bundles)

## Mobile Application (`artifacts/mobile`)
- **Framework**: Expo (React Native)
- **Authentication**: Custom sign-in/sign-up flows using Clerk. Auth guard redirects unauthenticated users.
- **Onboarding**: First-launch 3-screen walkthrough that teaches the "What / Why / Unusual" framing. Gated on a per-device AsyncStorage flag (`@stockclarify_onboarding_completed_v1`); managed by `hooks/useOnboarding.ts` and rendered at `app/onboarding.tsx`.
- **Insight Sharing**: Every expanded `ExpandableEventCard` exposes a Share action that captures a branded PNG of the AI summary via `react-native-view-shot` and opens the native share sheet through `expo-sharing`. Implementation lives in `components/ShareableEventCard.tsx` and `utils/shareCard.ts`.
- **Key Features**:
    - **Personalized Watchlist**: Stock cards with mini charts, price data.
    - **Daily Digest**: AI-powered summaries of market events (WHAT/WHY/UNUSUAL).
    - **Alerts**: Notifications for unusual price/volume activity with plain-language explanations.
    - **World Markets**: Access to 30+ global stocks across 11 exchanges.
    - **Stock Detail Screen**: 30-day price charts, company info, event history.
    - **Account Management**: User profiles, subscription status, AI usage, feedback, dev tools (hidden).
    - **Paywall**: Full-screen modal for Pro/Premium plans, supporting both web (Stripe) and native (RevenueCat IAP).
- **State Management**: Uses `WatchlistContext`, `SubscriptionContext`, and `BenchmarkContext`.
- **Error Reporting**: Sentry integrated for crash and error reporting.
- **Network Handling**: Custom `useOnline()` and `OfflineBanner` for robust offline experience.
- **UI Components**: In-house `ToastProvider` for notifications.
- **Portfolio Export**: Premium feature allowing export to XLSX, CSV (comma/semicolon), TSV, and PDF formats.

## API Server (`artifacts/api-server`)
- **Framework**: Express 5
- **Base Paths**: `/api` for public API, `/admin` for dashboard, `/__clerk` for Clerk proxy.
- **Market Data**: Leverages Yahoo Finance for stock data.
- **Routes**:
    - Health checks (`/api/healthz`)
    - Stock search, quotes, charts, and AI-powered event summaries (`/api/stocks/*`)
    - Payment and subscription management (`/api/payment/*`)
    - Stripe and RevenueCat webhooks (`/api/stripe/webhook`, `/api/webhooks/revenuecat`)
    - Feedback submission (`/api/feedback`)
    - Analytics for trending stocks and user activity (`/api/analytics/*`)
    - Admin functionalities for user management and metrics (`/admin*`, `/api/admin/*`)
    - Development-only tier override (`/api/dev/tier`)
- **Database Interactions**: Manages `users`, `user_events`, `stock_views`, `error_logs`, and `feedback` tables in the `public` schema. Stripe-related tables are managed in the `stripe` schema by `stripe-replit-sync`.
- **Email Service**: Provider-agnostic transactional email system (currently SendGrid) for welcome emails, payment receipts, dunning, and account deletion confirmations.
- **AI Summaries**: Uses `gpt-4o-mini` for generating stock event summaries, with caching.
- **News Deduplication**: Two-stage pipeline. Stage 1 is the existing fast word-overlap heuristic. Stage 2 is an embedding-based pass (`text-embedding-3-small`, cosine ≥ 0.82) implemented in `lib/newsEmbedding.ts`. Stage 2 is gated behind `EMBEDDING_DEDUP_ENABLED=true` AND requires a direct `OPENAI_API_KEY` (the AI Integrations proxy does not support the embeddings endpoint). When the flag is off, behavior is unchanged.
- **Reports Feature**: Provides SEC filing lists and AI executive summaries for tickers via server-side processing to protect API keys and comply with EDGAR's `User-Agent` requirements.

## UI/UX Design
- **Mobile-first approach** with distinct tab navigation for core features.
- **Themed design** with specific color palettes (e.g., `#0A1628` for emails).
- **Interactive elements** like sparkline charts, expandable cards, and bottom-sheet modals for enhanced user experience.

# External Dependencies

- **pnpm**: Monorepo management.
- **Clerk**: User authentication and management.
- **PostgreSQL**: Primary database.
- **Express**: Web application framework for the API server.
- **Expo / React Native**: Mobile application development.
- **RevenueCat**: In-app purchase (IAP) management for native mobile subscriptions.
- **Stripe**: Payment gateway for web subscriptions and customer portal.
- **Sentry**: Error monitoring and performance tracing.
- **SendGrid**: Transactional email service.
- **OpenAI / Anthropic**: AI models for generating stock summaries and executive reports. Utilized via Replit AI Integrations proxy or direct API keys.
- **Yahoo Finance**: Source for market data (quotes, charts).
- **exceljs**: Library for generating XLSX export files.