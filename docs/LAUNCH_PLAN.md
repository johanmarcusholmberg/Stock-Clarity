# StockClarify — App Store + Google Play Launch Plan

A realistic plan to get the app from "running in Expo preview" to live on both stores.

**Legend**
- 🤖 **[Agent]** — I can do this end-to-end inside Replit. No external account or payment required.
- 👤 **[Human]** — Only you can do this: account creation, payment, legal signature, business decision, or a step that runs in a vendor's web console.
- 🤝 **[Both]** — I write the code/config; you provide the credentials, assets, or final approval.

**Realistic timeline:** 4–6 calendar weeks from a focused start, including 1–2 review cycles per store. Critical path is **Data provider → IAP → Native build → Submission**.

---

## Phase 0 — Decisions you have to make first (1–2 days)

These unblock everything else. None can be done by me.

| # | Task | Who |
|---|------|-----|
| 0.1 | Decide on a **paid market data provider** (Polygon $29+/mo, Finnhub $0–60+/mo free tier, IEX Cloud, Twelve Data $0–80+/mo). Yahoo's terms don't allow paid commercial use, and reviewers do notice. | 👤 |
| 0.2 | Decide on the **legal entity** (sole prop vs LLC). Strongly recommend an LLC for a paid finance app. | 👤 |
| 0.3 | Choose the **app name + bundle ID** (e.g. `com.stockclarify.app`). Once picked, never changes. | 👤 |
| 0.4 | Decide **launch geographies**. US-only is simplest. EU/UK/India trigger extra financial-app regulatory checks. | 👤 |
| 0.5 | Pick a **support email address** + (optional) marketing site domain. | 👤 |

---

## Phase 1 — Account setup + paid services (2–3 days, mostly waiting)

| # | Task | Who | Notes |
|---|------|-----|-------|
| 1.1 | Create Apple Developer account ($99/yr) | 👤 | Identity verification can take 24–48h |
| 1.2 | Create Google Play Console account ($25 one-time) | 👤 | Identity verification, ~1 day |
| 1.3 | Create RevenueCat account (free tier covers <$10k/mo) | 👤 | Glue between Apple/Google billing and our backend |
| 1.4 | Sign up for chosen data provider, get API key | 👤 | Paste key into Replit Secrets |
| 1.5 | Create Sentry account (free tier OK) | 👤 | Paste DSN into Replit Secrets |
| 1.6 | Create transactional email account (SendGrid/Postmark/Resend) + verify sender domain via DNS | 👤 | Required for alert emails |
| 1.7 | Switch Stripe from test → live mode keys | 👤 | Paste live keys into Replit Secrets |
| 1.8 | Buy a domain (optional but recommended for privacy/ToS hosting) | 👤 | Replit deployments give free `.replit.app` if you skip this |

**My role in Phase 1:** I'll request each secret via the proper Replit secret-management flow as we wire each service in. You never paste secrets to me directly.

---

## Phase 2 — Code work I can do without waiting on anything (~5–7 days of agent time)

These can all happen in parallel with Phase 1 account setups.

### 2A — Data provider migration 🤖
- Swap Yahoo Finance calls for the chosen provider's API.
- Wrap in a service layer so the provider can be swapped again later.
- Cache aggressively (we're already serverside) to stay under rate limits.
- Update integration tests.

### 2B — Account deletion in-app 🤖 ✅ DONE
- ✅ Two-step confirmation flow + Danger Zone in Account tab. Platform-aware copy that tells iOS/Android users to cancel their App Store / Play Store subs first (server can't cancel IAP).
- ✅ `DELETE /api/account` route: cancels Stripe sub, fail-closed wipe of all 14 user-linked DB tables (lots, holdings, alert_events, alerts, push tokens, notify_subscriptions, notification_events, admin_grants, user_events, stock_views, portfolio_snapshots, password_history, feedback, users), then deletes Clerk user. Aborts BEFORE Clerk delete if any DB delete fails, so users can safely retry.
- ✅ Auth via Clerk Bearer token; user can only delete their own account.
- ✅ Documented retention list (audit log 24mo, payment records 7yr, security logs 90d) in Privacy Policy.

### 2C — Apple Sign In 🤖 ✅ DONE *(Apple requires it if any social login is offered)*
- ✅ Installed `expo-apple-authentication` and added `usesAppleSignIn: true` + the config plugin in `app.json` so the EAS build provisions the Sign in with Apple capability.
- ✅ New `lib/appleAuth.ts` helper: availability check, `requestAppleCredential()` for the native iOS flow, and an `isUserCanceledAppleError()` helper so canceled prompts don't surface as errors.
- ✅ Both sign-in and sign-up screens now use the **official `AppleAuthentication.AppleAuthenticationButton`** (App Store HIG-compliant — Apple rejects custom Apple buttons). The placeholder "smartphone" icon button is gone.
- ✅ Native flow + Clerk token-exchange via `signIn.create({ strategy: "oauth_token_apple", token })` — no in-app browser hop. First-time Apple users get auto-transferred to `signUp.create({ transfer: true })` so they land in `(tabs)` without bouncing.
- ✅ Button is hidden on Android/web automatically (the helper returns `false` for `Platform.OS !== "ios"` and on simulators where Apple auth isn't available).
- 👤 **Still required before launch:** in the Clerk dashboard, configure the Apple OAuth provider with the bundle ID `com.stockclarify.app` and an Apple Services ID + key from Apple Developer. Without this, the token exchange will return an OAuth misconfiguration error. (This is a one-time dashboard setup, no code change.)

### 2D — Production polish 🤖 ✅ DONE
- ✅ Dev Tools panel: server `/api/dev/*` already gated by `ENABLE_DEV_TOOLS && NODE_ENV !== "production"`; no UI panel exists.
- ✅ Fixed pre-existing TS errors (`alerts.tsx` route literal; `PurchasesService.ts` was a missing pnpm install).
- ✅ Global ErrorBoundary with Sentry-ready `onError` hook (in `_layout.tsx`).
- ✅ About & Legal section in Account tab: Privacy + Terms + Support email + Version + plain-language disclaimer.
- ✅ **Server hardening (added 2026-05-02):**
  - `helmet` security headers (HSTS, X-Content-Type-Options, X-Frame-Options, Referrer-Policy).
  - CORS locked to allow-list (REPLIT_DOMAINS + `*.replit.dev/.app` + `ALLOWED_ORIGINS` env). Unknown origins get a clean 403, not a 500.
  - `express-rate-limit` layered: 300/min baseline on `/api`, 30/min on AI/news endpoints (`/api/stocks`, `/api/news`), 20/min on write/auth endpoints (`/api/feedback`, `/api/account`, `/api/auth`). `trust proxy` enabled so limits are per-client, not per-proxy.
  - `console.log` in `webhookHandlers.ts` replaced with structured `pino` log.
  - Two silently-swallowed `catch {}` blocks in `admin.ts` now log the error.
- ✅ **Mobile API URL hardening (added 2026-05-02):**
  - All 14 mobile files that previously fell back to `http://localhost:8080/api` now route through a single `getApiBase()` helper that throws loudly if `EXPO_PUBLIC_API_URL` is missing — no more silent failures on real devices.
- ✅ **app.json cleanup for App Store (added 2026-05-02):**
  - Removed misleading "we don't use the camera/photos" purpose strings (Apple rejects these). They'll only be added back if a real dependency needs them, with a real purpose string.
  - Removed `NSUserTrackingUsageDescription` since we don't use App Tracking Transparency.
  - Added `ITSAppUsesNonExemptEncryption: false` to skip the export-compliance prompt at every TestFlight build.

- ✅ **Offline + network-error polish (added 2026-05-02):**
  - New `lib/network.ts` exports `useOnline()`, `isOnline()`, `useOnReconnect()`, `initNetwork()`. Web path listens directly to `window` `online`/`offline` + `navigator.onLine` (NetInfo's web build does a background fetch to `clients3.google.com/generate_204` that fails in sandboxed envs and pins `isInternetReachable: false`). Native path uses NetInfo + AppState→React Query focusManager bridging.
  - New `components/Toast.tsx` (in-house ToastProvider+useToast, no third-party dep): single-slot, 4 variants (success/error/info/warning), auto-dismiss, conditionally rendered.
  - New `components/OfflineBanner.tsx`: animated top banner ("You're offline — showing saved data"). Fully **unmounts** after slide-out so neither the banner nor its alert text is in the DOM/screen-reader tree when online.
  - QueryClient defaults: `staleTime: 60_000`, `networkMode: "offlineFirst"`, `refetchOnReconnect: true`, retries skip 4xx (max 2). Mutations: `networkMode: "offlineFirst"`, no retry.
  - Patched silent failures: `WatchlistContext.refreshQuotes` now returns `Promise<boolean>`; pull-to-refresh + feedback submit show toasts on offline/error (was silent). Destructive flows (delete folder/account) intentionally kept Alert.alert — confirmation modal is the right UX.
  - **Verified by e2e**: banner appears within ~2s of going offline, fully unmounts within ~2.5s of going online, multiple toggles pass.

### 2E — Observability: Better Stack server logs (Sentry fully removed) ✅ DONE

- ✅ **Decision (2026-05-03):** dropped Sentry entirely on both server and mobile. Server-side logs go to Better Stack via the `@logtail/pino` transport; mobile ships without a crash reporter at launch (revisit post-launch if needed).
- ✅ **Server pipeline (`pino` + `@logtail/pino` + `pino-pretty`):**
  - `src/lib/logger.ts` — singleton pino logger with two transport targets: `pino-pretty` (stdout, dev-friendly) and `@logtail/pino` (Better Stack, gated on `BETTER_STACK_SOURCE_TOKEN`). Default endpoint `https://in.logs.betterstack.com` works for the EU region.
  - All route code uses `req.log` / module loggers — never `console.log`.
- ✅ **esbuild build hardening (`build.mjs`):** worked around two `esbuild-plugin-pino` quirks that surfaced after the Sentry removal:
  - The plugin uses a one-shot flag and only injects `__bundlerPathsOverrides` into the FIRST bundle that imports pino during a build. Across rebuilds, esbuild's parallel processing makes "first" non-deterministic — sometimes it lands in `index.mjs`, sometimes in `@logtail/pino.mjs`. When the main bundle missed out, pino's `transport.js` fell back to `join(__dirname, 'worker.js')` and crashed with `Cannot find module .../dist/worker.js`. Fix: inject the override map ourselves in the esbuild banner, walking up from `__dirname` to find the dist root (handles both top-level bundles and the nested `dist/@logtail/pino.mjs`). Idempotent — spreads any existing override the plugin set.
  - Belt-and-suspenders: also mirror `dist/thread-stream-worker.mjs` to `dist/lib/worker.js` so any code path that bypasses the override still resolves to a working worker file.
- ✅ **Smoke-tested (2026-05-03):** ad-hoc `pino + @logtail/pino` script flushed cleanly to Better Stack with `BETTER_STACK_SOURCE_TOKEN`. Server boots clean, `/api/healthz` returns 200, request logs flow through pino-pretty + Better Stack in parallel.
- ✅ **Sentry removal scope:**
  - Mobile: deleted `lib/sentry.ts`, uninstalled `@sentry/react-native`, removed `initSentry()` / `<SentryUserSync />` / `captureSentryException` from `app/_layout.tsx`, dropped Sentry bullet from privacy screen, simplified `<ErrorBoundary onError>` to `console.error`.
  - Server: removed `src/instrument.ts`, `src/lib/sentry.ts`, all Sentry middleware and Express handlers, `@sentry/node` + `@sentry/profiling-node` deps, every Sentry mention in `routes/legal.ts` (privacy section + section 8), and the now-unused `@sentry/profiling-node` external + OTel-bundling comment from `build.mjs`.
  - Codebase scan: zero remaining `sentry`/`@sentry` references in source.
- ✅ **Metro fix retained:** the `node_modules/.pnpm/*_tmp_*` blockList in `metro.config.js` stays — useful protection against any future hot-install tearing down Metro's file watcher.
- ⏭️ **Deferred:** mobile crash reporting. If post-launch crash data becomes a need, evaluate Sentry / Bugsnag / Better Stack mobile when they ship a first-class RN tile.

### 2F — RevenueCat IAP integration 🤝 *(biggest single item)* ✅ CODE DONE *(2026-05-02)*
- This is the BIG one. Apple/Google take 15–30% on in-app subscriptions and reject apps that bypass their billing for digital goods.
- ✅ **Server**: `POST /api/webhooks/revenuecat` with constant-time auth-header check, event-id dedup, out-of-order rejection. Six new `users` columns (`iap_tier`, `iap_product_id`, `iap_expires_at`, `iap_environment`, `iap_last_event_id`, `iap_last_event_at`) added via `adminSchema.ts` ALTER TABLE. `computeEffectiveTier` now honors IAP slot when `iap_expires_at > now()`, with higher-tier-wins vs Stripe. Webhook returns 503 fail-closed when `REVENUECAT_WEBHOOK_AUTH_HEADER` secret is unset.
- ✅ **Mobile**:
  - `PurchasesService.findPackageForTier(packages, tier, period)` — period-safe lookup via RC `PACKAGE_TYPE` filter (so a yearly product can never be picked when card says "/mo"). Strategies: `EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP` env override (fails closed if configured-but-unmatched), then exact `<tier>_<period>` convention, then guarded substring (pro vs premium collision).
  - `SubscriptionContext` pre-fetches RC offerings into `nativePackages` after `initPurchases`, exposes `nativePackagesLoading` for cold-start UX, and routes `iap:<tier>` synthetic priceIds straight to RevenueCat without walking Stripe plans.
  - `PaywallSheet` on native: hides yearly toggle (we ship monthly-only IAP at launch), shows store-localized `pkg.product.priceString` (`$9.99`, `9,99 €`, `£7.99`) instead of formatting Stripe `unit_amount`, and uses `nativePackagesLoading` to avoid dead "Pricing unavailable" cards during cold start.
  - `account.tsx` "Manage Subscription" deep-links to `https://apps.apple.com/account/subscriptions` on iOS and `https://play.google.com/store/account/subscriptions?package=com.stockclarify.app` on Android (Apple/Google policy requires OS-level subscription management for store-managed subs). Web stays on Stripe portal.
  - Restore Purchases button on PaywallSheet wired through `restorePurchases()` + `refresh()`.
- 👤 **Still required before launch (depends on store accounts, can't be coded around):**
  1. Apple Developer enrollment ($99/yr) + App Store Connect product creation: `pro_monthly` ($9.99) + `premium_monthly` ($19.99) auto-renewing subscriptions.
  2. Google Play Console enrollment ($25 one-time) + same two product IDs as Play subscriptions.
  3. RevenueCat dashboard: import the products from each store, create entitlements with IDs `pro` and `premium` (must match `entitlementsToTier` in `PurchasesService.ts`), attach products to entitlements, create offering named `default`.
  4. Set RevenueCat webhook URL → `https://<replit-domain>/api/webhooks/revenuecat`, copy the auth header value into `REVENUECAT_WEBHOOK_AUTH_HEADER` server secret.
  5. Set `EXPO_PUBLIC_REVENUECAT_IOS_KEY` + `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (mobile public keys from RevenueCat → API keys).
  6. (Optional) Set `EXPO_PUBLIC_IAP_PRODUCT_TIER_MAP` JSON only if final product ids don't follow the `<tier>_monthly` convention.
- 🧪 **Verification flow** (after store products live + webhook secret set): App Store sandbox tester or Play closed-testing track → buy in PaywallSheet → confirm webhook arrives at server (logs show `revenuecat.webhook` event-id), users.iap_tier updates, app `tier` reflects within ~5s via `refresh()`.

### 2G — Push notifications 🤝 ✅ CODE DONE *(audited 2026-05-03)*

- ✅ **Mobile registration** (`services/pushRegistration.ts`): asks permission on auth, fetches Expo push token via `Notifications.getExpoPushTokenAsync({ projectId })`, sets up the Android `default` channel with MAX importance + vibration pattern, POSTs to `/api/notifications/register`. Wired into `_layout.tsx` (line 135) — fires on every authed launch, idempotent server-side.
- ✅ **Server token storage**: `expo_push_tokens` table in `lib/alertsSchema.ts` with `token` PK, `user_id`, `platform`, `timezone`, `last_seen` columns. Two upsert routes (`POST /api/push-tokens` and `POST /api/notifications/register`) both use `ON CONFLICT (token) DO UPDATE` — slight redundancy but functionally equivalent. `DELETE /api/push-tokens/:token` available for unregister.
- ✅ **Push send** (`lib/pushDelivery.ts`): `sendExpoPush()` posts directly to `https://exp.host/--/api/v2/push/send` with 10s timeout. No `expo-server-sdk` dep needed for our scale. Error-tolerant — failures logged via pino, never thrown.
- ✅ **Price-alert delivery worker** (`lib/alertEvaluator.ts`): per-tick fetches active alerts, fires when threshold hit, fans out to all of a user's tokens via `sendExpoPush`, records `delivered_via` (`push` | `push:failed` | `push:no_token`) in `alert_events`. Started in `index.ts` line 28.
- ✅ **News notify evaluator** (`lib/notifyEvaluator.ts`): more advanced — daily-cap suppression per user, per-user IANA-timezone-aware quiet hours, dedup via `UNIQUE (subscription_id, source_kind, source_id, kind)` on `notification_events`, full telemetry into `user_events`. Insert-then-send-then-update-on-downgrade pattern keeps things idempotent. Started in `index.ts` line 53.
- ✅ **Reports worker** (`lib/reportsWorker.ts`): polls SEC EDGAR per subscribed ticker, fans out push/email when 10-K/10-Q drops. Gated on `REPORTS_NOTIFY_ENABLED=true` (set in `[userenv.production]`).
- ✅ **Privacy + permissions**: push token usage and APNs/FCM processors disclosed in `routes/legal.ts` privacy policy. iOS Info.plist purpose strings handled by `expo-notifications` plugin in `app.json`.

- ⏭️ **Deferred (not MVP scope, comment in `pushDelivery.ts`):** DeviceNotRegistered receipt reconciliation. If a user uninstalls, their token sits in `expo_push_tokens` until the row TTL kicks them out. Cost is a few wasted Expo API calls per dead device — acceptable at launch. Add a daily cleanup worker post-launch if it becomes a signal.

- 👤 **Still required before launch (no code change, store-credential work only):**
  1. Apple Developer → Certificates, Identifiers & Profiles → Keys → create an APNs Auth Key (.p8) for the bundle ID `com.stockclarify.app`. Download once.
  2. Firebase Console → create project → add Android app with package name `com.stockclarify.app` → download `google-services.json` and grab the FCM v1 service account JSON.
  3. EAS dashboard (or `eas credentials`) → upload the APNs key + FCM service account so the production build can deliver pushes via Expo's gateway.

### 2H — Email delivery 🤝 ✅ DONE *(2026-05-02 — code only; secret + sender verification still required)*
- ✅ Provider-agnostic email service at `src/lib/email/` so SendGrid can be swapped for Resend/Postmark/SES later by replacing one file (`sendgrid.ts`) — no call-site changes.
- ✅ SendGrid implementation (`@sendgrid/mail`) installed. Sends via SendGrid's v3 API with category tags for analytics.
- ✅ Five branded HTML+text templates matching app theme (dark navy `#0A1628`, accent green/red): **welcome**, **payment receipt**, **payment failed (dunning)**, **account deletion confirmation**, **alert notification**.
- ✅ **Welcome email** wired into `storage.upsertUser` using the Postgres `xmax = 0` trick to detect first-time inserts only — no welcome on every login.
- ✅ **Payment receipt + dunning** wired into `webhookHandlers.processWebhook`: handles `invoice.payment_succeeded` (receipt with hosted invoice URL) and `invoice.payment_failed` (dunning with payment-update CTA). Tier inferred from line description, falls back to amount threshold. Each handler is isolated in try/catch so one failure can't poison Stripe retries.
- ✅ **Account deletion confirmation** wired into `DELETE /api/account` BEFORE the wipe (after deletion we lose the email address). Fire-and-forget — delivery failure must not block the deletion.
- ✅ **Price alert emails** in `alertEvaluator.deliver()` — replaced the `email:queued` stub with real SendGrid send. Reports `email`, `email:no_address`, `email:not_configured`, or `email:failed` per attempt for observability.
- ✅ Fully best-effort: if `SENDGRID_API_KEY` isn't set, `sendEmail()` logs at WARN and returns `{ skipped: true }` — never throws, so dev environments and unconfigured production stay functional.
- 👤 **Still required before launch:**
  - Provide `SENDGRID_API_KEY` secret (request will be sent).
  - In SendGrid: verify the sender domain via DNS (CNAME records for SPF/DKIM) — without this, mail lands in spam.
  - Optionally set `EMAIL_FROM_ADDRESS` (default `alerts@stockclarify.app`) and `EMAIL_FROM_NAME` (default `StockClarify`).

### 2I — Privacy Policy + Terms of Service 🤝 ✅ DRAFTED (lawyer review still required)
- ✅ Privacy Policy at `/legal/privacy`: 10+ sections including data retention/deletion specifics, GDPR lawful bases, retention timelines for retained records, all third-party processors named (Stripe, OpenAI, Apple, Google, RevenueCat, Clerk, Replit).
- ✅ Terms of Service at `/legal/terms`: 15 sections including prominent "not a financial advisor" disclaimer, IAP/Stripe billing terms, limitation of liability appropriate for a finance app.
- ✅ artifact.toml routes `/legal` to API server (not Expo).
- 👤 **Still required:** lawyer review before submission — especially the financial-app disclaimers and data-controller identity details.

### 2J — Production deployment 🤖 ✅ DECISIONS LOCKED *(2026-05-03)*

- ✅ **Deployment type chosen: Reserved VM (always-on), smallest tier.** Autoscale would scale the server to zero when idle, which silently stops the six background workers (`alertEvaluator`, `notifyEvaluator`, `earningsCalendarWorker`, `dividendWorker`, `portfolioSnapshotWorker`, `reportsWorker`) — all of them are `setTimeout` loops that need a long-lived process. Reserved VM keeps them running 24/7. Pick "Reserved VM" in the Publishing UI at first deploy (~$7/mo); geography setting also locks at first publish, so pick the right region (EU recommended given Nordic user base) before clicking Publish.
- ✅ **Health check** at `/api/healthz` already wired in `artifacts/api-server/.replit-artifact/artifact.toml` under `[services.production.health.startup]`.
- ✅ **Production build/run** already in `artifact.toml` (`pnpm --filter @workspace/api-server run build` → `node --enable-source-maps dist/index.mjs`). esbuild produces a single-file bundle with the @logtail/pino transports correctly externalized (see 2E hardening).
- ✅ **Structured logging** already wired via pino + Better Stack (see 2E).
- ✅ **Production env-flag defaults** already set in `.replit` `[userenv.production]`: `NEWS_PRELOAD_ENABLED`, `NOTIFY_ENABLED`, `HOLDINGS_ENABLED`, `REPORTS_NOTIFY_ENABLED` all `true`. Workers auto-no-op in dev unless these are flipped on.

- 👤 **Production-secrets checklist** (set these in the Publishing UI Secrets tab before first deploy):
  - **Auth & DB:** `CLERK_SECRET_KEY` (prod), `CLERK_PUBLISHABLE_KEY` (prod), `DATABASE_URL` (prod Postgres).
  - **Payments:** `STRIPE_SECRET_KEY` (live), `STRIPE_WEBHOOK_SECRET` (live), `REVENUECAT_WEBHOOK_AUTH_HEADER`.
  - **Email:** `SENDGRID_API_KEY`, optionally `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`.
  - **Logging:** `BETTER_STACK_SOURCE_TOKEN`.
  - **Misc:** `ADMIN_SECRET_KEY`, `EXPORT_SIGNING_SECRET`, `ALLOWED_ORIGINS` (CORS allow-list for prod).
  - **Mobile build secrets** (set on EAS, not Replit): `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, `EXPO_PUBLIC_API_URL` pointing at the prod replit.app domain.

- 👤 **Webhook URL updates after first deploy** (one-time dashboard work):
  - Stripe: update webhook endpoint to `https://<prod-domain>/api/webhooks/stripe`.
  - Clerk: update redirect URLs and webhook to prod domain.
  - RevenueCat: update webhook to `https://<prod-domain>/api/webhooks/revenuecat` and confirm the auth header value matches `REVENUECAT_WEBHOOK_AUTH_HEADER`.

- 🧪 **Smoke test after deploy:** hit `/api/healthz`, sign in via mobile build pointed at prod, fire a test push (set a price alert just above current price on a watched ticker), verify the alert evaluator log line appears in Better Stack within ~60s.

---

## Phase 3 — Native build + assets (3–5 days)

| # | Task | Who |
|---|------|-----|
| 3.1 | Set up EAS Build (`eas.json`, `app.json` with bundle IDs, version code) | 🤖 |
| 3.2 | Generate icon set (1024×1024 master, adaptive Android, iOS variants) and splash screens — I can generate these via image tools | 🤝 |
| 3.3 | Write the App Store + Google Play metadata: short description, long description, keywords, category, age rating | 🤝 (I draft, you approve) |
| 3.4 | Take screenshots in every required size: iPhone 6.7"/6.5"/5.5", iPad 12.9"/13", Android phone/tablet | 👤 (or 🤝 — I can guide you through simulator captures) |
| 3.5 | Create privacy nutrition label (Apple) and Data Safety form (Google) — describe every piece of collected data | 🤝 (I draft text, you submit in console) |
| 3.6 | Run a real EAS build and download the IPA + AAB | 🤝 (I trigger; needs your Apple/Google credentials in EAS) |

---

## Phase 4 — Beta testing (1–2 weeks, mostly review wait time)

| # | Task | Who |
|---|------|-----|
| 4.1 | Upload IPA to TestFlight; invite 5–10 testers | 👤 |
| 4.2 | Upload AAB to Google Play Internal Testing track | 👤 |
| 4.3 | Run through key flows on real devices: sign up, add stocks, view insights, purchase Premium, receive alerts, delete account | 👤 |
| 4.4 | Fix bugs surfaced by beta | 🤖 |
| 4.5 | Review crash reports in Sentry, fix top issues | 🤖 |

---

## Phase 5 — Submission + review (1–3 weeks of waiting + back-and-forth)

| # | Task | Who |
|---|------|-----|
| 5.1 | Submit to App Store Review | 👤 |
| 5.2 | Submit to Google Play Review | 👤 |
| 5.3 | Respond to reviewer questions / rejections — finance apps often get 1–2 rejections asking for clarification on data sources, disclaimers, or IAP | 🤝 (I help draft responses, you submit) |
| 5.4 | Set release date and pricing tiers in each store | 👤 |
| 5.5 | 🚀 Public launch | — |

---

## Critical path (the order that minimizes total time)

```
Week 1:  Phase 0 decisions  →  Phase 1 accounts (run in background)
Week 2:  Phase 2A (data provider)  +  Phase 2F (RevenueCat) start in parallel
Week 3:  Phase 2F finish  +  Phase 2B/2C/2D/2I  (most polish in parallel)
Week 4:  Phase 2E/2G/2H + Phase 2J (deploy)  +  Phase 3 (native build + assets)
Week 5:  Phase 4 (beta) — start uploads, fix issues from real devices
Week 6:  Phase 5 (submission) — file with both stores
Week 7+: Review iteration, then launch
```

---

## What's most likely to go wrong (and how I'll de-risk it)

1. **Apple rejects for using Stripe instead of IAP for Premium.** Mitigation: Phase 2F — RevenueCat-backed IAP on native, Stripe only on web.
2. **Apple rejects for missing account deletion.** Mitigation: Phase 2B.
3. **Apple rejects for missing Apple Sign In when Google login exists.** Mitigation: Phase 2C.
4. **Reviewer asks "where does your stock data come from? do you have permission?"** Mitigation: Phase 0.1 + Phase 2A — switch off Yahoo before submission.
5. **App crashes during reviewer testing on a flow we never thought to test.** Mitigation: Phase 2E (Sentry) + Phase 4 beta on real devices.
6. **Push notifications don't fire in the reviewer's environment.** Mitigation: Phase 2G done early so it bakes in TestFlight for a week before submission.
7. **Privacy policy doesn't match the actual data collected.** Mitigation: I generate the privacy/data-safety text from the same source list used by the code, so they stay in sync.

---

## Things I deliberately did NOT put in scope

- Watch app, widgets, App Clips, Wear OS — defer to v1.1.
- Tablet-optimized layouts — current responsive layout is fine for review.
- Multi-language support — ship English first; translate post-launch based on signups.
- Advanced charting (TradingView-grade) — current Insights tab is enough for launch.
- Apple Vision Pro / Android XR — not relevant.

---

## Your immediate next step

Pick a data provider (Phase 0.1). That single decision unblocks ~70% of the remaining work. If you'd like, I can:
- Compare the top 3 providers side-by-side (free quotas, pricing tiers, EU coverage, news, fundamentals, websocket support).
- Or just start on the items that don't depend on the data provider — account deletion, Apple Sign In, production polish, Sentry wiring — while you decide.

Tell me which path you want and I'll start.
