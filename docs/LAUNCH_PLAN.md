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

### 2E — Sentry crash + error reporting 🤝
- Code wiring 🤖. DSN secret 👤.

### 2F — RevenueCat IAP integration 🤝 *(biggest single item)*
- This is the BIG one. Apple/Google take 15–30% on in-app subscriptions and reject apps that bypass their billing for digital goods.
- I'll: install `react-native-purchases`, set up entitlement keys, build a unified paywall that uses RevenueCat on native + Stripe on web, and wire RevenueCat webhooks to update `computeEffectiveTier` on the backend.
- You'll: create the products in App Store Connect + Google Play Console, mirror them in RevenueCat, paste the SDK keys.
- Estimate: 4–6 days of focused work, plus tester accounts on both stores for verification.

### 2G — Push notifications 🤝
- Code: Expo Push Notifications wiring + `notification_tokens` table + alert delivery worker. 🤖
- Credentials: APNs key from Apple Developer + FCM service account from Firebase. 👤

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

### 2J — Production deployment 🤖
- Use Replit Deployments for the API server. Set production secrets. Verify webhooks land (Stripe + Clerk + RevenueCat).
- Health checks, monitoring, structured logging.

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
