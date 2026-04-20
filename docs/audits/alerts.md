# Alerts — Audit (2026-04-20)

Scope: what the Alerts feature *actually does today* before we start Phase 2. Everything below was verified against the current code on `claude/nifty-northcutt-8c6cd1` (branched from `main` after Phase 1 polish).

Tracked files:
- [artifacts/mobile/app/(tabs)/alerts.tsx](artifacts/mobile/app/(tabs)/alerts.tsx) — Alerts tab screen
- [artifacts/mobile/components/AlertCard.tsx](artifacts/mobile/components/AlertCard.tsx) — single-alert row
- [artifacts/mobile/context/WatchlistContext.tsx:33](artifacts/mobile/context/WatchlistContext.tsx:33) — `Alert` type + mock data
- [artifacts/mobile/services/NotificationService.ts](artifacts/mobile/services/NotificationService.ts) — digest-only push scheduler
- [artifacts/mobile/app/(tabs)/index.tsx:382](artifacts/mobile/app/(tabs)/index.tsx:382) — the home-screen bell icon

TL;DR — **there is no real alert system today.** The Alerts tab is a UI shell driven entirely by three hardcoded objects in `WatchlistContext`. No DB table, no evaluator, no per-stock "set alert" affordance, no push delivery for alerts. Phase 2 is a ground-up build, not a refactor.

---

## 1. What the bell/alert button currently fires

Two different "bell" affordances exist; neither creates an alert:

| Affordance | Location | What it does |
|---|---|---|
| Header bell icon | [app/(tabs)/index.tsx:382](artifacts/mobile/app/(tabs)/index.tsx:382) | `router.push("/(tabs)/alerts")` — navigates to the Alerts tab. Shows a count badge of unread mock alerts. |
| Alerts tab filter chip labelled "All" | [app/(tabs)/alerts.tsx:20](artifacts/mobile/app/(tabs)/alerts.tsx:20) | Cosmetic — filters the mock list by `type`. |
| Per-stock bell on `/stock/[ticker]` | — | **Does not exist.** Grep for `bell` under `artifacts/mobile/app/stock` returns zero matches. |

**Conclusion:** no UI path currently allows a user to *set* an alert on a specific stock at a specific threshold.

## 2. What data is captured

The shape:
```ts
// WatchlistContext.tsx:33
interface Alert {
  id: string;
  ticker: string;
  stockName: string;
  type: "price_spike" | "volume_surge" | "gap_up" | "gap_down" | "breakout";
  title: string;
  explanation: string;
  magnitude: string;
  timestamp: string;
  read: boolean;
}
```

What's actually persisted:
- **Alert definitions:** none. `MOCK_ALERTS` is three seeded rows, hardcoded ([WatchlistContext.tsx:122](artifacts/mobile/context/WatchlistContext.tsx:122)). They are shown only if the mock row's `ticker` is in one of the user's folders ([WatchlistContext.tsx:575](artifacts/mobile/context/WatchlistContext.tsx:575)).
- **Read state:** AsyncStorage key `@stockclarify_alerts_read` — a `Set<string>` of alert IDs ([WatchlistContext.tsx:179](artifacts/mobile/context/WatchlistContext.tsx:179), `markAlertRead` at line 557). Local-only, not synced to backend.
- **User id / delivery channel / threshold:** not captured anywhere. The `Alert` type has no `userId`, no `threshold`, no `deliveryChannel`.
- **Alert types vs Phase 2 MVP:** the existing five types (`price_spike`, `volume_surge`, `gap_up`, `gap_down`, `breakout`) are all *reactive pattern detectors* — not the user-set thresholds the MVP requires (`price >= X`, `price <= X`, `|dayΔ%| >= X`). None map cleanly.

## 3. How alerts are actually triggered server-side

**They aren't.**

- Grep for `alert` under `artifacts/api-server/src/` returns zero matches.
- No `alerts` table exists. The only `CREATE TABLE IF NOT EXISTS` in the server is `password_history` ([routes/auth.ts:10](artifacts/api-server/src/routes/auth.ts:10)).
- No cron job, no scheduler, no streaming price feed, no webhook endpoint touches anything called "alert."

The only price feed we have today is the 15-minute client-side poll during market hours ([WatchlistContext.tsx:390](artifacts/mobile/context/WatchlistContext.tsx:390)) and the `/api/stocks/quote` endpoint ([api-server/src/routes/stocks.ts:266](artifacts/api-server/src/routes/stocks.ts:266)), which itself caches Yahoo chart results for 5 minutes. Any real alert evaluator will need its own server-side polling loop — the mobile clients can't be trusted to fire alerts (users close the app).

## 4. Notification delivery path

`NotificationService.ts` ([services/NotificationService.ts](artifacts/mobile/services/NotificationService.ts)) is the only push-notification wiring we have today. It is **digest-only**:

- Handles a `NotificationPrefs` blob stored in AsyncStorage (`@stockclarify_notification_prefs`).
- `scheduleWatchlistNotification()` schedules a *local* recurring push (daily/weekly/monthly) via `expo-notifications` with a body like "Today's update for your watchlist: AAPL, NVDA …".
- No remote push (Expo Push Service / APNs / FCM) tokens are registered anywhere. Grep for `ExpoPushToken` / `getExpoPushTokenAsync` → zero matches.
- The `AlertType` enum in this file (`price_target | market_open_close | large_movement | volume_spike`) is a *third* unrelated taxonomy used only by the Account-screen notification-preferences panel; it doesn't influence any alert logic.

**Conclusion:** no server-to-device push path exists. Phase 2 needs to add Expo push-token registration end-to-end before server-driven alerts can reach the device.

## 5. Where the user views / manages existing alerts

- **View:** `/(tabs)/alerts` — mock-alerts feed, filterable by type. Read-only. Tap an alert → `markAlertRead` + navigate to stock detail.
- **Manage (edit / pause / delete):** not possible. No UI exists.
- **Create:** not possible (see §1).

The screen treats alerts as a passive inbox, not a configurable service.

---

## Gap analysis for the Phase 2 MVP

| Phase 2 requirement | Today | Gap |
|---|---|---|
| `alerts` table (id, user_id, symbol, type, threshold, status, created_at, last_fired_at, delivery_channel) | ∅ | Build from scratch. |
| User can set price-above / price-below / %-change alert | ∅ | Add per-stock bell → action sheet flow on `/stock/[ticker]`. |
| Global Alerts screen grouped by symbol, showing status + last fired | Flat mock feed | Rework `/(tabs)/alerts` list to group by ticker and show per-row alert status, not just unread dot. |
| Server-side evaluator (event-driven or 1-min cron) | ∅ | New worker that reads `alerts WHERE status='active'`, fetches current quotes, evaluates predicates, writes firings, enqueues delivery. |
| Dead-man switch — banner if evaluator stopped >10 min | ∅ | Heartbeat table/Redis key + client-side banner. |
| Firing cooldown (≥15 min, reset on re-cross) | ∅ | `last_fired_at` + threshold-crossed state machine. |
| Push delivery | Digest-only, local push | Expo push-token registration + server push (or fallback email). |
| Email fallback | ∅ | Either reuse Stripe transactional sender or add one (Resend/Postmark). |
| Feature-flag rollout to 10% | ∅ | No feature-flag infra. Cheapest path: hash `user_id` → bucket 0–99, check against env var `ALERTS_ROLLOUT_PCT`. |

## Open questions before we start coding

1. **Where does the evaluator run?** Current API server is a stateless Express app (`artifacts/api-server`). Options: (a) add a worker process in the same repo started by a second entrypoint, (b) use a scheduled task runner (Replit cron / external). Recommendation: (a) — keep ops surface small, share `db.ts`.
2. **How close to event-driven do we need to be?** The spec says "price >= X crosses → push within 60s." Yahoo quote caching is 5 min. To meet 60s we either shorten that cache, or call Yahoo directly from the evaluator on its own polling cadence (~30s). Recommendation: let the evaluator bypass the HTTP cache and call Yahoo once per minute for the set of tickers with active alerts.
3. **Do we keep the existing 5 "pattern detector" alert types?** They are unused today (mock data only). Proposal: mark deprecated, hide from UI, do not port to the new table. We can always bring back detection-style alerts later — they belong to Phase 3 anyway (spike / news / earnings).
4. **Read-state migration:** the current `@stockclarify_alerts_read` key will be dead code once mock alerts are removed. Either clear it on next launch or leave the orphan key — it's 3 IDs, harmless.
5. **Push tokens across sign-ins:** Clerk user id is stable, but an `expo_push_tokens` row should live per-device, not per-user. One user may have multiple devices.
6. **Email for email-channel alerts:** we already have `users.email` via Clerk — same plumbing as digest.

## Proposed shape of the alerts table (for review)

```sql
CREATE TABLE alerts (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT NOT NULL,                  -- Clerk user id
  symbol           TEXT NOT NULL,
  type             TEXT NOT NULL CHECK (type IN ('price_above','price_below','pct_change_day')),
  threshold        NUMERIC NOT NULL,               -- price for above/below; abs pct (e.g. 3.0) for pct_change_day
  status           TEXT NOT NULL DEFAULT 'active'  -- active | snoozed | triggered | disabled
                   CHECK (status IN ('active','snoozed','triggered','disabled')),
  delivery_channel TEXT NOT NULL DEFAULT 'push'    -- push | email | both
                   CHECK (delivery_channel IN ('push','email','both')),
  last_fired_at    TIMESTAMPTZ,
  last_side        TEXT,                           -- 'above' | 'below' — for re-cross detection
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX alerts_user_symbol_idx ON alerts (user_id, symbol);
CREATE INDEX alerts_active_idx     ON alerts (status) WHERE status = 'active';

CREATE TABLE expo_push_tokens (
  token       TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  platform    TEXT,                                -- ios | android
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX expo_push_tokens_user_idx ON expo_push_tokens (user_id);

CREATE TABLE alert_events (
  id            BIGSERIAL PRIMARY KEY,
  alert_id      UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  fired_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price_at_fire NUMERIC NOT NULL,
  delivered_via TEXT                              -- push | email | both | failed:<reason>
);
```

`alert_events` is optional for MVP but cheap and gives us the "last fired" row on the Alerts screen plus a cooldown audit trail.

## MVP scope (for explicit sign-off)

The spec says: **price_above, price_below, pct_change_day — nothing else.** I will defer volume_spike, news alerts, and earnings alerts to Phase 3, and the existing 5 mock "pattern detector" types will not be ported. Confirm before I start cutting code.

---

*Stop here for team review. No implementation in this PR.*
