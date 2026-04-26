import { Router } from "express";
import Stripe from "stripe";
import { execute, query, queryOne } from "../db";
import { storage } from "../storage";
import { getUncachableStripeClient } from "../stripeClient";
import {
  computeEffectiveTier,
  resolveSubscriptionSource,
  writeAdminAudit,
} from "../lib/tierService";
import { canUseSubscriptionTools } from "../lib/adminFeatureFlag";
import { checkAndRecordAdminAction } from "../lib/adminRateLimit";

const router = Router();

// ── Admin email list ──────────────────────────────────────────────────────────
// Default admin emails (hardcoded). Override via ADMIN_EMAILS env var.
const DEFAULT_ADMIN_EMAILS = ["johanmarcusholmberg@gmail.com"];

function getAdminEmails(): string[] {
  if (process.env.ADMIN_EMAILS) {
    return process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase());
  }
  return DEFAULT_ADMIN_EMAILS.map((e) => e.toLowerCase());
}

function isAdminEmail(email: string): boolean {
  return getAdminEmails().includes(email.toLowerCase().trim());
}

// ── Premium feature → tier (mirror of FEATURE_TIER_REQUIREMENT) ──────────────
// Source of truth: artifacts/mobile/components/PremiumGate.tsx. Mirrored here
// so the admin conversion dashboard can annotate each feature row with its
// tier without reaching across packages. Drift risk is low — the map rarely
// changes — but if a new PremiumFeature is added there, add it here too.
// Unknown keys render as "—" in the dashboard, no errors.
const FEATURE_TIER_LOOKUP: Record<string, "pro" | "premium"> = {
  performance_rankings: "pro",
  sector_breakdown: "pro",
  fifty_two_week_range: "pro",
  risk_metrics: "premium",
  benchmark_comparison: "premium",
  export_pdf_csv: "premium",
  dividend_calendar: "premium",
  correlation_matrix: "premium",
  scenario_analysis: "premium",
  monte_carlo: "premium",
  tax_lot_view: "premium",
  geo_currency_exposure: "premium",
  rebalancing_suggestions: "premium",
  full_brief_archive: "premium",
};

// ── Check if a userId is an admin (by email) ─────────────────────────────────
// GET /api/admin/check?userId=...&email=...
// The email from Clerk (verified by auth) is used to check admin status.
// We also upsert the user into our DB if not yet present.
router.get("/check", async (req, res) => {
  const { userId, email } = req.query as { userId?: string; email?: string };
  if (!userId || !email) {
    return void res.json({ isAdmin: false });
  }
  try {
    // Upsert user so they're always in our DB
    await storage.upsertUser(userId, email);
    const admin = isAdminEmail(email);
    // Subscription-tools flag state — non-admins always get {false,false}
    // so the client can't deduce feature existence from this endpoint.
    // PR 5a: piggybacked here so mobile SubscriptionContext gets it on the
    // same mount fetch it already does; no extra round trip.
    const subscriptionTools = admin
      ? canUseSubscriptionTools()
      : { enabled: false, allowed: false };
    res.json({
      isAdmin: admin,
      email,
      adminEmails: admin ? getAdminEmails() : [],
      subscriptionTools,
    });
  } catch {
    res.json({ isAdmin: false });
  }
});

// ── Override a user's tier (admin only by email) ──────────────────────────────
// POST /api/admin/override-tier  body: { requesterId, requesterEmail, targetUserId?, tier }
// If targetUserId is omitted, sets the requester's own tier.
router.post("/override-tier", async (req, res) => {
  const { requesterId, requesterEmail, targetUserId, tier } = req.body;
  if (!requesterId || !requesterEmail) {
    return void res.status(400).json({ error: "requesterId and requesterEmail required" });
  }
  if (!isAdminEmail(requesterEmail)) {
    return void res.status(403).json({ error: "Access denied — not an admin email" });
  }
  if (!["free", "pro", "premium"].includes(tier)) {
    return void res.status(400).json({ error: "tier must be free, pro, or premium" });
  }
  const target = targetUserId || requesterId;
  try {
    // Upsert requester so they're in our DB
    await storage.upsertUser(requesterId, requesterEmail);
    // If setting own tier, upsert is enough; otherwise ensure target exists
    const targetUser = target === requesterId
      ? await storage.getUserByClerkId(requesterId)
      : await storage.getUserByClerkId(target);
    if (!targetUser) return void res.status(404).json({ error: "Target user not found" });
    const previousTier = targetUser.tier ?? "free";
    await storage.updateUserTier(target, tier as "free" | "pro" | "premium");
    await writeAdminAudit({
      adminEmail: requesterEmail.toLowerCase().trim(),
      userId: target,
      action: "tier_flip",
      source: "manual",
      previousState: { tier: previousTier },
      newState: { tier },
    });
    res.json({ success: true, targetUserId: target, tier });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── List all users (admin only by email) ─────────────────────────────────────
router.post("/users", async (req, res) => {
  const { requesterEmail } = req.body;
  if (!isAdminEmail(requesterEmail ?? "")) {
    return void res.status(403).json({ error: "Access denied" });
  }
  try {
    const users = await query(`
      SELECT
        u.clerk_user_id,
        u.email,
        u.tier,
        u.stripe_customer_id,
        u.created_at,
        u.updated_at,
        COALESCE(jsonb_array_length(u.watchlist_data), 0) AS folder_count,
        COALESCE((
          SELECT SUM(jsonb_array_length(f->'tickers'))
          FROM jsonb_array_elements(COALESCE(u.watchlist_data, '[]'::jsonb)) AS f
        ), 0) AS watchlist_count,
        COALESCE((
          SELECT COUNT(*) FROM user_events ue WHERE ue.user_id = u.clerk_user_id
        ), 0) AS events_total,
        COALESCE((
          SELECT COUNT(DISTINCT DATE(ue.created_at)) FROM user_events ue WHERE ue.user_id = u.clerk_user_id
        ), 0) AS days_active,
        GREATEST(1, DATE_PART('day', NOW() - u.created_at)::int) AS days_since_joined
      FROM users u
      ORDER BY u.created_at DESC
      LIMIT 100
    `);
    res.json({ users });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Middleware: require admin key for web dashboard routes.
// Fails CLOSED — returns 503 if secret is unset.
function requireAdmin(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) {
    return void res.status(503).json({ error: "Admin access not configured — set ADMIN_SECRET_KEY" });
  }
  const key = req.headers["x-admin-key"] ?? req.query.key;
  if (key === secret) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

// ── Admin Dashboard HTML ──────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const key = req.query.key as string;
  const secret = process.env.ADMIN_SECRET_KEY;
  const isAuth = !!secret && key === secret;

  if (!isAuth) {
    return void res.send(`<!DOCTYPE html>
<html><head><title>StockClarify Admin</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:system-ui,sans-serif;background:#0a0f1e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}
.card{background:#111827;border:1px solid #1e293b;border-radius:16px;padding:40px;width:100%;max-width:380px;text-align:center}
h1{font-size:24px;margin-bottom:8px;color:#14b8a6}p{color:#94a3b8;margin-bottom:24px}
input{width:100%;padding:12px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#fff;font-size:14px;margin-bottom:12px}
button{width:100%;padding:12px;border-radius:8px;border:none;background:#14b8a6;color:#000;font-weight:700;font-size:14px;cursor:pointer}
</style></head>
<body><div class="card">
  <h1>StockClarify</h1>
  <p>Admin Dashboard — Enter your admin key</p>
  <form onsubmit="event.preventDefault();window.location='?key='+document.getElementById('k').value">
    <input id="k" type="password" placeholder="Admin key" required>
    <button type="submit">Access Dashboard</button>
  </form>
</div></body></html>`);
  }

  // Fetch stats and users
  let stats = { users: 0, events_today: 0, errors_today: 0, feedback_new: 0, avg_rating: 0 };
  let trending: any[] = [];
  let recentErrors: any[] = [];
  let recentFeedback: any[] = [];
  let users: any[] = [];
  // Phase 3.3 PR 6 — notify telemetry (last 7 days). Sourced from user_events
  // rows the notify evaluator writes (news_alert_sent / earnings_alert_sent /
  // notification_suppressed_*). CTR is intentionally not tracked yet — see
  // notifyEvaluator.ts header.
  let notifyTotals = { news_sent: 0, earnings_sent: 0 };
  let notifySuppressed: any[] = [];
  // Phase 3.4 PR 1 — premium gate conversion telemetry (last 30 days). Per-
  // feature totals + daily impression series for the Unicode sparkline.
  // Drives Phase 3.4 PR-order decisions; see docs/proposals/premium-insights.md.
  let conversionRows: Array<{
    feature: string;
    impressions: number;
    cta_clicks: number;
    paywall_opens: number;
    first_uses: number;
  }> = [];
  // feature → 30-day daily impression counts (oldest → newest, zero-filled).
  const conversionSparklines = new Map<string, number[]>();

  try {
    const [
      usersRes,
      eventsRes,
      errorsRes,
      feedbackRes,
      trendingRes,
      recentErrorsRes,
      recentFeedbackRes,
      usersListRes,
      notifySentRes,
      notifySuppressedRes,
      conversionTotalsRes,
      conversionDailyRes,
    ] = await Promise.all([
      query("SELECT COUNT(*) as c FROM users"),
      query("SELECT COUNT(*) as c FROM user_events WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(*) as c FROM error_logs WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(*) as c FROM feedback WHERE status = 'new'"),
      query(`SELECT ticker, stock_name, COUNT(*) as views FROM stock_views WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY ticker, stock_name ORDER BY views DESC LIMIT 5`),
      query("SELECT id, error_type, message, endpoint, created_at FROM error_logs ORDER BY created_at DESC LIMIT 10"),
      query("SELECT id, category, message, rating, email, status, created_at FROM feedback ORDER BY created_at DESC LIMIT 10"),
      query(`
        SELECT
          u.clerk_user_id, u.email, u.tier, u.stripe_customer_id, u.created_at,
          COALESCE(jsonb_array_length(u.watchlist_data), 0) AS folder_count,
          COALESCE((SELECT SUM(jsonb_array_length(f->'tickers')) FROM jsonb_array_elements(COALESCE(u.watchlist_data,'[]'::jsonb)) f), 0) AS watchlist_count,
          COALESCE((SELECT COUNT(*) FROM user_events ue WHERE ue.user_id = u.clerk_user_id), 0) AS events_total,
          COALESCE((SELECT COUNT(DISTINCT DATE(ue.created_at)) FROM user_events ue WHERE ue.user_id = u.clerk_user_id), 0) AS days_active,
          GREATEST(1, DATE_PART('day', NOW() - u.created_at)::int) AS days_since_joined
        FROM users u ORDER BY u.created_at DESC LIMIT 50
      `),
      query(`
        SELECT
          COUNT(*) FILTER (WHERE event_type = 'news_alert_sent')     AS news_sent,
          COUNT(*) FILTER (WHERE event_type = 'earnings_alert_sent') AS earnings_sent
        FROM user_events
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND event_type IN ('news_alert_sent','earnings_alert_sent')
      `),
      query(`
        SELECT event_type, COUNT(*) AS c
        FROM user_events
        WHERE created_at > NOW() - INTERVAL '7 days'
          AND event_type LIKE 'notification_suppressed_%'
        GROUP BY event_type
        ORDER BY c DESC
      `),
      // Phase 3.4 PR 1 — per-feature gate conversion totals, last 30 days.
      // Excludes paywall opens with no feature (manual triggers) since we
      // group by feature; manual opens would otherwise become a phantom row.
      query(`
        SELECT
          payload->>'feature' AS feature,
          COUNT(*) FILTER (WHERE event_type = 'premium_lock_impression')   AS impressions,
          COUNT(*) FILTER (WHERE event_type = 'premium_lock_cta_click')    AS cta_clicks,
          COUNT(*) FILTER (WHERE event_type = 'premium_paywall_opened')    AS paywall_opens,
          COUNT(*) FILTER (WHERE event_type = 'premium_feature_first_use') AS first_uses
        FROM user_events
        WHERE created_at > NOW() - INTERVAL '30 days'
          AND event_type IN (
            'premium_lock_impression',
            'premium_lock_cta_click',
            'premium_paywall_opened',
            'premium_feature_first_use'
          )
          AND payload->>'feature' IS NOT NULL
        GROUP BY 1
        ORDER BY cta_clicks DESC, impressions DESC
      `),
      // Daily impression counts per feature for the sparkline. Bounded:
      // ~14 features × 30 days = ≤420 rows. Days with zero impressions
      // are absent from the result and zero-filled in JS.
      query(`
        SELECT
          payload->>'feature' AS feature,
          DATE(created_at)    AS day,
          COUNT(*)            AS c
        FROM user_events
        WHERE event_type = 'premium_lock_impression'
          AND created_at > NOW() - INTERVAL '30 days'
          AND payload->>'feature' IS NOT NULL
        GROUP BY 1, 2
      `),
    ]);
    stats.users = parseInt(usersRes[0]?.c ?? "0");
    stats.events_today = parseInt(eventsRes[0]?.c ?? "0");
    stats.errors_today = parseInt(errorsRes[0]?.c ?? "0");
    stats.feedback_new = parseInt(feedbackRes[0]?.c ?? "0");
    const ratingRes = await query("SELECT ROUND(AVG(rating), 1) as avg FROM feedback WHERE rating IS NOT NULL");
    stats.avg_rating = parseFloat(ratingRes[0]?.avg ?? "0");
    trending = trendingRes;
    recentErrors = recentErrorsRes;
    recentFeedback = recentFeedbackRes;
    users = usersListRes;
    notifyTotals.news_sent = parseInt(notifySentRes[0]?.news_sent ?? "0");
    notifyTotals.earnings_sent = parseInt(notifySentRes[0]?.earnings_sent ?? "0");
    notifySuppressed = notifySuppressedRes;

    conversionRows = conversionTotalsRes.map((r: any) => ({
      feature: String(r.feature),
      impressions: parseInt(r.impressions ?? "0"),
      cta_clicks: parseInt(r.cta_clicks ?? "0"),
      paywall_opens: parseInt(r.paywall_opens ?? "0"),
      first_uses: parseInt(r.first_uses ?? "0"),
    }));

    // Build a feature → 30-element daily-count array. We anchor on UTC
    // midnight today and walk back 29 days so day index 0 = 29 days ago,
    // index 29 = today. Server-local timezone differences from the DB's
    // DATE() truncation are acceptable for a sparkline trend display.
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const dayIndex = new Map<string, number>();
    for (let i = 0; i < 30; i++) {
      const d = new Date(today);
      d.setUTCDate(d.getUTCDate() - (29 - i));
      dayIndex.set(d.toISOString().slice(0, 10), i);
    }
    for (const row of conversionDailyRes as any[]) {
      const feature = String(row.feature);
      const dayKey = (row.day instanceof Date)
        ? row.day.toISOString().slice(0, 10)
        : String(row.day).slice(0, 10);
      const idx = dayIndex.get(dayKey);
      if (idx === undefined) continue;
      let arr = conversionSparklines.get(feature);
      if (!arr) {
        arr = new Array(30).fill(0);
        conversionSparklines.set(feature, arr);
      }
      arr[idx] = parseInt(row.c ?? "0");
    }
  } catch {}

  const style = `<style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0f1e;color:#e2e8f0;min-height:100vh;padding:24px}
    .header{display:flex;align-items:center;gap:12px;margin-bottom:32px}
    .logo{width:40px;height:40px;background:#14b8a6;border-radius:10px;display:flex;align-items:center;justify-content:center;font-weight:900;color:#000;font-size:18px}
    h1{font-size:24px;font-weight:700}p.sub{color:#64748b;font-size:14px}
    .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:16px;margin-bottom:32px}
    .stat{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:20px}
    .stat .val{font-size:32px;font-weight:800;color:#14b8a6}
    .stat .lbl{font-size:12px;color:#64748b;margin-top:4px}
    .section{background:#111827;border:1px solid #1e293b;border-radius:12px;padding:20px;margin-bottom:20px}
    h2{font-size:16px;font-weight:600;margin-bottom:16px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;font-size:12px}
    table{width:100%;border-collapse:collapse}
    th{text-align:left;padding:8px 12px;font-size:11px;color:#64748b;border-bottom:1px solid #1e293b;text-transform:uppercase}
    td{padding:10px 12px;font-size:13px;border-bottom:1px solid #0f172a;vertical-align:middle}
    tr:last-child td{border-bottom:none}
    .badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600}
    .badge-new{background:#14b8a622;color:#14b8a6}
    .badge-bug{background:#ef444422;color:#ef4444}
    .badge-feature{background:#8b5cf622;color:#8b5cf6}
    .badge-billing{background:#f59e0b22;color:#f59e0b}
    .badge-error{background:#ef444422;color:#ef4444}
    .badge-free{background:#64748b22;color:#94a3b8}
    .badge-pro{background:#14b8a622;color:#14b8a6}
    .badge-premium{background:#f59e0b22;color:#f59e0b}
    .error-msg{color:#ef4444;max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .stars{color:#f59e0b}
    .manage-link{color:#14b8a6;text-decoration:none;font-size:12px;font-weight:600}
    .manage-link:hover{text-decoration:underline}
    .uid{font-family:monospace;font-size:11px;color:#475569;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    @media(max-width:600px){.grid{grid-template-columns:1fr 1fr}}
  </style>`;

  const starsHtml = (r: number) => r ? "★".repeat(r) + "☆".repeat(5 - r) : "—";

  // Friendly label for the suppressed-by-reason rows (event_type → display).
  const suppressedLabel = (eventType: string): string => {
    if (eventType === "notification_suppressed_cap") return "Daily cap (5/24h)";
    if (eventType === "notification_suppressed_quiet_hours") return "Quiet hours";
    return eventType.replace(/^notification_suppressed_/, "").replace(/_/g, " ");
  };
  const suppressedRows = notifySuppressed.length
    ? notifySuppressed.map(s => `<tr><td>${suppressedLabel(s.event_type)}</td><td style="text-align:right">${s.c}</td></tr>`).join("")
    : '<tr><td colspan="2" style="color:#64748b;padding:20px">No suppressions in the last 7 days</td></tr>';

  const usersRows = users.length
    ? users.map(u => `<tr>
        <td>${u.email ?? "—"}</td>
        <td><span class="badge badge-${u.tier ?? 'free'}">${u.tier ?? 'free'}</span></td>
        <td style="text-align:center">${u.watchlist_count ?? 0}</td>
        <td style="text-align:center">${u.folder_count ?? 0}</td>
        <td style="text-align:center">${u.events_total ?? 0}</td>
        <td style="text-align:center">${u.days_active ?? 0} / ${u.days_since_joined ?? 1}</td>
        <td><a class="manage-link" href="stockclarify://admin-panel/user/${encodeURIComponent(u.clerk_user_id)}">manage ▸</a></td>
        <td style="color:#64748b">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>`).join("")
    : '<tr><td colspan="8" style="color:#64748b;padding:20px">No users yet</td></tr>';

  // Phase 3.4 PR 1 — premium gate conversion rows + Unicode sparkline.
  // Sparkline uses 9 chars (zero = "·" for visibility, then ▁..█ for 8
  // non-zero levels). Each row is independently scaled to its own per-
  // feature max — see column header + subtitle for the reader-facing note.
  const sparkChars = ["·", "▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  const sparkline = (arr: number[]): string => {
    const max = arr.reduce((m, v) => Math.max(m, v), 0);
    if (max === 0) return "·".repeat(30);
    return arr
      .map(v => {
        if (v === 0) return "·";
        const lvl = Math.min(8, Math.max(1, Math.ceil((v / max) * 8)));
        return sparkChars[lvl];
      })
      .join("");
  };
  const conversionRowsHtml = conversionRows.length
    ? conversionRows.map(r => {
        const tier = FEATURE_TIER_LOOKUP[r.feature];
        const tierBadge = tier
          ? `<span class="badge badge-${tier}">${tier}</span>`
          : '<span style="color:#64748b">—</span>';
        const series = conversionSparklines.get(r.feature) ?? new Array(30).fill(0);
        const peak = series.reduce((m, v) => Math.max(m, v), 0);
        const sparkTitle = peak > 0
          ? `Daily impressions, last 30 days. Peak day: ${peak}. Scale is relative to this feature only.`
          : "No daily impressions in the last 30 days.";
        return `<tr>
          <td><code style="font-size:12px;color:#e2e8f0">${r.feature}</code></td>
          <td>${tierBadge}</td>
          <td style="text-align:right">${r.impressions}</td>
          <td style="text-align:right;font-weight:600;color:#14b8a6">${r.cta_clicks}</td>
          <td style="text-align:right">${r.paywall_opens}</td>
          <td style="text-align:right">${r.first_uses}</td>
          <td title="${sparkTitle}"><span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:1px;color:#14b8a6">${sparkline(series)}</span></td>
        </tr>`;
      }).join("")
    : '<tr><td colspan="7" style="color:#64748b;padding:20px">No premium gate impressions in the last 30 days</td></tr>';

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockClarify Admin</title>${style}</head>
<body>
  <div class="header">
    <div class="logo">SC</div>
    <div><h1>StockClarify Admin</h1><p class="sub">Dashboard · ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p></div>
  </div>

  <div class="grid">
    <div class="stat"><div class="val">${stats.users}</div><div class="lbl">Total Users</div></div>
    <div class="stat"><div class="val">${stats.events_today}</div><div class="lbl">Events Today</div></div>
    <div class="stat"><div class="val">${stats.errors_today}</div><div class="lbl">Errors Today</div></div>
    <div class="stat"><div class="val">${stats.feedback_new}</div><div class="lbl">New Feedback</div></div>
    <div class="stat"><div class="val">${stats.avg_rating > 0 ? stats.avg_rating + "★" : "—"}</div><div class="lbl">Avg Rating</div></div>
  </div>

  <div class="section">
    <h2>👥 Users &amp; Subscriptions</h2>
    <div style="overflow-x:auto">
      <table>
        <tr><th>Email</th><th>Tier</th><th>Watchlist</th><th>Folders</th><th>Events</th><th>Days Active / Since Join</th><th>Actions</th><th>Joined</th></tr>
        ${usersRows}
      </table>
    </div>
  </div>

  <div class="section">
    <h2>📈 Trending Stocks (7d)</h2>
    <table>
      <tr><th>Ticker</th><th>Name</th><th>Views</th></tr>
      ${trending.length ? trending.map(t => `<tr><td><b>${t.ticker}</b></td><td>${t.stock_name ?? "—"}</td><td>${t.views}</td></tr>`).join("") : '<tr><td colspan="3" style="color:#64748b;padding:20px">No data yet</td></tr>'}
    </table>
  </div>

  <div class="section">
    <h2>🔔 Notify Alerts (7d)</h2>
    <div class="grid" style="margin-bottom:16px">
      <div class="stat"><div class="val">${notifyTotals.news_sent}</div><div class="lbl">News Sent</div></div>
      <div class="stat"><div class="val">${notifyTotals.earnings_sent}</div><div class="lbl">Earnings Sent</div></div>
      <div class="stat"><div class="val">${notifyTotals.news_sent + notifyTotals.earnings_sent}</div><div class="lbl">Total Sent</div></div>
    </div>
    <table>
      <tr><th>Suppressed (reason)</th><th style="text-align:right">Count</th></tr>
      ${suppressedRows}
    </table>
  </div>

  <div class="section">
    <h2>🔓 Premium Insights Conversion (30d)</h2>
    <p style="color:#64748b;font-size:12px;margin:-8px 0 16px 0">Which locked features users tried to open. Drives Phase 3.4 PR-order decisions. Sparkline trend is <b>relative per feature</b> — heights are not comparable across rows.</p>
    <div style="overflow-x:auto">
      <table>
        <tr>
          <th>Feature</th>
          <th>Tier</th>
          <th style="text-align:right">Impressions</th>
          <th style="text-align:right">CTA Clicks</th>
          <th style="text-align:right">Paywall Opens</th>
          <th style="text-align:right">First Uses</th>
          <th title="Daily impressions over the last 30 days. Each row is scaled to its own peak — do not compare heights across rows.">Trend (30d, relative per feature)</th>
        </tr>
        ${conversionRowsHtml}
      </table>
    </div>
  </div>

  <div class="section">
    <h2>💬 Recent Feedback</h2>
    <table>
      <tr><th>Category</th><th>Message</th><th>Rating</th><th>Status</th><th>Date</th></tr>
      ${recentFeedback.length ? recentFeedback.map(f => `<tr>
        <td><span class="badge badge-${f.category}">${f.category}</span></td>
        <td style="max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.message}</td>
        <td class="stars">${starsHtml(f.rating)}</td>
        <td><span class="badge badge-new">${f.status}</span></td>
        <td style="color:#64748b">${new Date(f.created_at).toLocaleDateString()}</td>
      </tr>`).join("") : '<tr><td colspan="5" style="color:#64748b;padding:20px">No feedback yet</td></tr>'}
    </table>
  </div>

  <div class="section">
    <h2>⚠️ Recent Errors</h2>
    <table>
      <tr><th>Type</th><th>Message</th><th>Endpoint</th><th>Date</th></tr>
      ${recentErrors.length ? recentErrors.map(e => `<tr>
        <td><span class="badge badge-bug">${e.error_type ?? "error"}</span></td>
        <td class="error-msg">${e.message}</td>
        <td style="color:#64748b;font-size:12px">${e.endpoint ?? "—"}</td>
        <td style="color:#64748b">${new Date(e.created_at).toLocaleDateString()}</td>
      </tr>`).join("") : '<tr><td colspan="4" style="color:#64748b;padding:20px">No errors logged</td></tr>'}
    </table>
  </div>

  <p style="text-align:center;color:#1e293b;margin-top:24px;font-size:12px">StockClarify Admin Dashboard · Auto-refreshes every 5 minutes</p>
  <script>
    setTimeout(() => location.reload(), 300000);
  </script>
</body></html>`);
});

// ── Stats API ─────────────────────────────────────────────────────────────────
router.get("/stats", requireAdmin, async (_req, res) => {
  try {
    const [users, events, errors, feedback, tierBreakdown, eventTypes] = await Promise.all([
      query("SELECT COUNT(*) as total, COUNT(CASE WHEN tier='pro' THEN 1 END) as pro, COUNT(CASE WHEN tier='premium' THEN 1 END) as premium FROM users"),
      query("SELECT DATE(created_at) as date, COUNT(*) as count FROM user_events WHERE created_at > NOW() - INTERVAL '30 days' GROUP BY date ORDER BY date"),
      query("SELECT COUNT(*) as total, COUNT(CASE WHEN created_at > NOW() - INTERVAL '24 hours' THEN 1 END) as today FROM error_logs"),
      query("SELECT COUNT(*) as total, ROUND(AVG(rating), 1) as avg_rating FROM feedback"),
      query("SELECT tier, COUNT(*) as count FROM users GROUP BY tier"),
      query("SELECT event_type, COUNT(*) as count FROM user_events WHERE created_at > NOW() - INTERVAL '7 days' GROUP BY event_type ORDER BY count DESC"),
    ]);

    res.json({
      users: users[0],
      eventHistory: events,
      errors: errors[0],
      feedback: feedback[0],
      tierBreakdown,
      popularEvents: eventTypes,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── User List API ─────────────────────────────────────────────────────────────
router.get("/users", requireAdmin, async (_req, res) => {
  try {
    const rows = await query(
      "SELECT clerk_user_id, email, tier, stripe_customer_id, stripe_subscription_id, created_at, updated_at FROM users ORDER BY created_at DESC"
    );
    res.json({ users: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Override User Tier ────────────────────────────────────────────────────────
// requireAdmin authenticates via ADMIN_SECRET_KEY, not a specific email — so
// the audit row is stamped with the 'x-admin-key' sentinel. When the mobile
// admin UI lands in Phase 3.2 PR 5 it will go through the email-authed
// override-tier endpoint above and get a real admin email in the audit.
router.patch("/users/:userId/tier", requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { tier } = req.body;
  if (!["free", "pro", "premium"].includes(tier)) {
    return void res.status(400).json({ error: "tier must be free, pro, or premium" });
  }
  try {
    const targetUser = await storage.getUserByClerkId(userId);
    const previousTier = targetUser?.tier ?? "free";
    await storage.updateUserTier(userId, tier as "free" | "pro" | "premium");
    await writeAdminAudit({
      adminEmail: "x-admin-key",
      userId,
      action: "tier_flip",
      source: "manual",
      previousState: { tier: previousTier },
      newState: { tier },
    });
    res.json({ success: true, userId, tier });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Admin Grants API (Phase 3.2 PR 2) ─────────────────────────────────────────
//
// Dual auth on every grants route: either a valid `x-admin-key` header (the
// existing dashboard/curl pattern) OR `requesterEmail` in the body / query
// matching an admin email (the mobile admin-panel pattern). The first form
// stamps 'x-admin-key' as admin_email in the audit; the second stamps the
// real email. Both are accepted from day one so PR 5 (mobile UI) doesn't
// need a parallel route.
function resolveAdminEmail(req: any): string | null {
  const secret = process.env.ADMIN_SECRET_KEY;
  const key = req.headers["x-admin-key"] ?? req.query.key;
  if (secret && key === secret) return "x-admin-key";
  const candidate =
    (typeof req.body?.requesterEmail === "string" && req.body.requesterEmail) ||
    (typeof req.query?.requesterEmail === "string" && (req.query.requesterEmail as string)) ||
    (typeof req.headers["x-admin-email"] === "string" && (req.headers["x-admin-email"] as string)) ||
    "";
  const normalised = candidate.toLowerCase().trim();
  if (normalised && isAdminEmail(normalised)) return normalised;
  return null;
}

// Access gate for the subscription-tools surface area (PR 5a). Resolves the
// admin, rejects if missing/not-allowed-by-feature-flag. Returns the email
// on success or null after sending the appropriate error response. Use on
// READ routes (overview, audit, GET grants) — no rate limit bump here.
async function requireSubscriptionToolsAccess(req: any, res: any): Promise<string | null> {
  const adminEmail = resolveAdminEmail(req);
  if (!adminEmail) {
    res.status(401).json({ error: "Unauthorized" });
    return null;
  }
  const flag = canUseSubscriptionTools();
  if (!flag.allowed) {
    res.status(403).json({
      error: "Admin subscription tools are not enabled for this account",
      subscriptionTools: flag,
    });
    return null;
  }
  return adminEmail;
}

// MUTATION gate: access check + bump the per-email rate limit window. Use on
// every write route in the subscription-tools surface (grants create/extend/
// revoke, cancel, refund, IAP stubs). IAP stubs count even though they
// return 501 — they still write admin_audit rows, so the rate limit is
// doing its job of dampening audit-log noise from a runaway client.
//
// On a 429 reject we set Retry-After so the client's back-off has a
// meaningful hint (rough — it's the age of the oldest in-window hit).
async function requireSubscriptionToolsMutation(req: any, res: any): Promise<string | null> {
  const adminEmail = await requireSubscriptionToolsAccess(req, res);
  if (!adminEmail) return null;
  const rl = await checkAndRecordAdminAction(adminEmail);
  if (!rl.allowed) {
    res.set("Retry-After", String(rl.retryAfterSec ?? 3600));
    res.status(429).json({
      error: "Admin action rate limit exceeded (10/hour)",
      retryAfterSec: rl.retryAfterSec,
      count: rl.count,
    });
    return null;
  }
  return adminEmail;
}

// Parse positive integer days, cap at a sane ceiling. 3650 = ~10 years;
// beyond that is almost certainly a typo (365000 instead of 365).
function parseDays(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : (v as number);
  if (!Number.isFinite(n) || n <= 0 || n > 3650) return null;
  return Math.floor(n);
}

type GrantRow = {
  id: string;
  user_id: string;
  tier: "pro" | "premium";
  expires_at: Date | string;
  reason: string;
  granted_by_admin: string;
  status: "active" | "revoked" | "expired";
  revoked_at: Date | string | null;
  created_at: Date | string;
};

// POST /api/admin/users/:userId/grants  body: { tier, days, reason, requesterEmail? }
// Creates an admin_grants row. If the new grant's tier outranks the user's
// current effective tier, we also bump the users.tier projection so quota
// checks / gates read correctly immediately. Audit is written with
// action='grant'.
router.post("/users/:userId/grants", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  const { tier, reason } = req.body ?? {};
  const days = parseDays(req.body?.days);

  if (!["pro", "premium"].includes(tier)) {
    return void res.status(400).json({ error: "tier must be pro or premium" });
  }
  if (days === null) {
    return void res.status(400).json({ error: "days must be a positive integer ≤ 3650" });
  }
  if (typeof reason !== "string" || reason.trim().length === 0) {
    return void res.status(400).json({ error: "reason is required" });
  }

  try {
    const targetUser = await storage.getUserByClerkId(userId);
    if (!targetUser) return void res.status(404).json({ error: "User not found" });

    const beforeEffective = await computeEffectiveTier(userId);
    const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    const inserted = await queryOne<GrantRow>(
      `INSERT INTO admin_grants (user_id, tier, expires_at, reason, granted_by_admin)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at`,
      [userId, tier, expiresAt, reason.trim(), adminEmail],
    );
    if (!inserted) return void res.status(500).json({ error: "Failed to create grant" });

    // Projection: update users.tier only if the new effective tier changes.
    // computeEffectiveTier runs grants through the same priority logic used
    // at read time, so this is guaranteed consistent with /subscription.
    const afterEffective = await computeEffectiveTier(userId);
    if (afterEffective.tier !== beforeEffective.tier) {
      await storage.updateUserTier(userId, afterEffective.tier);
    }

    await writeAdminAudit({
      adminEmail,
      userId,
      action: "grant",
      source: "manual",
      previousState: { tier: beforeEffective.tier, source: beforeEffective.source },
      newState: { tier: afterEffective.tier, source: afterEffective.source, grantId: inserted.id },
      reason: reason.trim(),
      metadata: { grantId: inserted.id, grantTier: tier, days, expiresAt: expiresAt.toISOString() },
    });

    res.json({ success: true, grant: inserted, effectiveTier: afterEffective });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /api/admin/grants/:grantId  body: { extendDays, requesterEmail? }
// Bumps expires_at by N days on an active grant. Refuses to extend a
// revoked/expired grant — admins should create a fresh grant instead so the
// audit log reflects intent clearly.
router.patch("/grants/:grantId", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return;

  const { grantId } = req.params;
  const extendDays = parseDays(req.body?.extendDays);
  if (extendDays === null) {
    return void res.status(400).json({ error: "extendDays must be a positive integer ≤ 3650" });
  }

  try {
    const current = await queryOne<GrantRow>(
      `SELECT id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at
         FROM admin_grants WHERE id = $1`,
      [grantId],
    );
    if (!current) return void res.status(404).json({ error: "Grant not found" });
    if (current.status !== "active") {
      return void res
        .status(409)
        .json({ error: `Cannot extend a ${current.status} grant — create a new one instead` });
    }

    const previousExpires =
      current.expires_at instanceof Date ? current.expires_at : new Date(current.expires_at);
    const newExpires = new Date(previousExpires.getTime() + extendDays * 24 * 60 * 60 * 1000);

    // PR 5a: reset warn_sent_at so an extended grant re-enters the 3-day
    // warning pool. If an admin extends a grant from 2d → 30d, we've
    // already warned but the user isn't about to expire anymore — we want
    // the warning worker to fire again when they approach the new expiry.
    const updated = await queryOne<GrantRow>(
      `UPDATE admin_grants SET expires_at = $1, warn_sent_at = NULL
        WHERE id = $2
        RETURNING id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at`,
      [newExpires, grantId],
    );

    await writeAdminAudit({
      adminEmail,
      userId: current.user_id,
      action: "extend",
      source: "manual",
      previousState: { expiresAt: previousExpires.toISOString() },
      newState: { expiresAt: newExpires.toISOString() },
      reason: typeof req.body?.reason === "string" ? req.body.reason : undefined,
      metadata: { grantId, extendDays },
    });

    res.json({ success: true, grant: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/admin/grants/:grantId  body: { reason?, requesterEmail? }
// Soft-revoke: status='revoked' + revoked_at=NOW(). Recomputes the user's
// effective tier and writes the projection if it changed (the user may drop
// back to Stripe or to free). Audit action='revoke'.
router.delete("/grants/:grantId", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return;

  const { grantId } = req.params;
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : undefined;

  try {
    const current = await queryOne<GrantRow>(
      `SELECT id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at
         FROM admin_grants WHERE id = $1`,
      [grantId],
    );
    if (!current) return void res.status(404).json({ error: "Grant not found" });
    if (current.status !== "active") {
      return void res.status(409).json({ error: `Grant already ${current.status}` });
    }

    const beforeEffective = await computeEffectiveTier(current.user_id);

    // Guard against a race with the expiry worker flipping the same row to
    // 'expired' between the SELECT above and this UPDATE. The AND clause
    // makes the transition idempotent; if no row comes back we bail rather
    // than writing a misleading 'revoke' audit on an already-expired grant.
    const revokedRow = await queryOne<{ id: string }>(
      `UPDATE admin_grants SET status = 'revoked', revoked_at = NOW()
        WHERE id = $1 AND status = 'active'
        RETURNING id`,
      [grantId],
    );
    if (!revokedRow) {
      return void res.status(409).json({ error: "Grant is no longer active" });
    }

    const afterEffective = await computeEffectiveTier(current.user_id);
    if (afterEffective.tier !== beforeEffective.tier) {
      await storage.updateUserTier(current.user_id, afterEffective.tier);
    }

    await writeAdminAudit({
      adminEmail,
      userId: current.user_id,
      action: "revoke",
      source: "manual",
      previousState: { tier: beforeEffective.tier, source: beforeEffective.source, grantId },
      newState: { tier: afterEffective.tier, source: afterEffective.source },
      reason,
      metadata: { grantId, grantTier: current.tier },
    });

    res.json({ success: true, grantId, effectiveTier: afterEffective });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:userId/grants?status=active|all
// Powers the PR 5 audit panel. Defaults to all statuses, newest first. Kept
// unpaginated because a single user will realistically have <100 grants
// ever; revisit if that stops being true.
router.get("/users/:userId/grants", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsAccess(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  const statusFilter =
    typeof req.query.status === "string" && req.query.status !== "all"
      ? (req.query.status as string)
      : null;
  if (statusFilter !== null && !["active", "revoked", "expired"].includes(statusFilter)) {
    return void res.status(400).json({ error: "status must be active, revoked, expired, or all" });
  }

  try {
    const rows = statusFilter
      ? await query<GrantRow>(
          `SELECT id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at
             FROM admin_grants WHERE user_id = $1 AND status = $2
            ORDER BY created_at DESC`,
          [userId, statusFilter],
        )
      : await query<GrantRow>(
          `SELECT id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at
             FROM admin_grants WHERE user_id = $1
            ORDER BY created_at DESC`,
          [userId],
        );
    res.json({ grants: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Subscription Overview + Audit (Phase 3.2 PR 5a) ──────────────────────────
//
// One-shot endpoint that bundles everything the mobile admin detail screen
// needs to render its header, actions drawer, and active-grants list.
// Centralising the per-source classification here means the client doesn't
// reimplement resolveSubscriptionSource; a single switch on
// `resolvedSource.source` picks which cancel/refund endpoint to hit.
//
// Audit is a separate endpoint rather than a field on the overview because
// 50 rows of JSONB per refresh would bloat a call that runs after every
// mutation.

// Shape of the stripe.subscriptions row we surface to the client. We cast
// fields off an `any` because the synced table mirrors Stripe's API which
// moves columns between releases (see PR 3 comment on current_period_end
// and the basil API version).
interface OverviewStripeSubscription {
  id: string;
  status: string;
  cancel_at_period_end: boolean;
  current_period_end: number | null;
}

// GET /api/admin/users/:userId/subscription-overview
router.get("/users/:userId/subscription-overview", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsAccess(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  try {
    const user = await storage.getUserByClerkId(userId);
    if (!user) return void res.status(404).json({ error: "User not found" });

    const [effective, resolved, activeGrants] = await Promise.all([
      computeEffectiveTier(userId),
      resolveSubscriptionSource(userId),
      query<GrantRow>(
        `SELECT id, user_id, tier, expires_at, reason, granted_by_admin, status, revoked_at, created_at
           FROM admin_grants
          WHERE user_id = $1 AND status = 'active' AND expires_at > NOW()
          ORDER BY expires_at ASC`,
        [userId],
      ),
    ]);

    // Stripe sub lookup happens AFTER resolved so we only hit Stripe for
    // users who actually have a customer id. Saves one DB query for the
    // grant-only and free-tier paths that hit this endpoint regularly.
    let stripeSubscription: OverviewStripeSubscription | null = null;
    if (user.stripe_customer_id) {
      const raw = (await storage.getSubscriptionByCustomerId(
        user.stripe_customer_id,
      )) as any;
      if (raw) {
        const periodEndRaw = raw.current_period_end;
        const periodEnd =
          typeof periodEndRaw === "number" && Number.isFinite(periodEndRaw)
            ? periodEndRaw
            : typeof periodEndRaw === "string" && periodEndRaw !== ""
              ? Number(periodEndRaw)
              : null;
        stripeSubscription = {
          id: String(raw.id),
          status: String(raw.status ?? "unknown"),
          cancel_at_period_end: !!raw.cancel_at_period_end,
          current_period_end: Number.isFinite(periodEnd) ? (periodEnd as number) : null,
        };
      }
    }

    res.json({
      user: {
        clerkUserId: user.clerk_user_id,
        email: user.email,
        tier: user.tier,
        stripeCustomerId: user.stripe_customer_id,
        createdAt: user.created_at,
      },
      effectiveTier: effective,
      resolvedSource: resolved,
      stripeSubscription,
      activeGrants,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/users/:userId/audit?limit=50&offset=0
// Paginated admin_audit rows for the detail-screen audit panel. Paginated
// rather than bundled into overview because 50 JSONB rows on every refresh
// adds up — and the panel is a tab the admin opens sometimes, not always.
router.get("/users/:userId/audit", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsAccess(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  const limit = Math.min(Math.max(1, parseInt(req.query.limit as string) || 50), 200);
  const offset = Math.max(0, parseInt(req.query.offset as string) || 0);

  try {
    const rows = await query(
      `SELECT id, admin_email, user_id, action, source,
              previous_state, new_state, reason, metadata, created_at
         FROM admin_audit WHERE user_id = $1
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3`,
      [userId, limit, offset],
    );
    const totalRow = await queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM admin_audit WHERE user_id = $1`,
      [userId],
    );
    res.json({
      audit: rows,
      total: parseInt(totalRow?.total ?? "0", 10),
      limit,
      offset,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Stripe Cancel + Refund (Phase 3.2 PR 3) ───────────────────────────────────
//
// Two endpoints, Stripe-only. No IAP handling yet — that's PR 4.
//
// Auth: same dual pattern as the grants routes (x-admin-key OR admin email).
//
// Idempotency: the key is derived from stable inputs — userId + subscription/
// charge id + action/mode/amount. The same admin double-click within Stripe's
// 24h idempotency window collapses to one Stripe operation; a later, distinct
// action (same endpoint but different mode/amount) gets its own key and runs.
// Using a random UUID per request would make retries unsafe, so we don't.
//
// Audit rows are written AFTER Stripe returns success — never before. A Stripe
// failure must not leave a "we did it" trail in admin_audit.

// Stripe exports `errors.StripeError` as a class value but the type-level name
// for the instance isn't in the namespace tree, so we bridge with InstanceType.
type StripeSdkError = InstanceType<typeof Stripe.errors.StripeError>;

function isStripeError(err: unknown): err is StripeSdkError {
  return err instanceof Stripe.errors.StripeError;
}

// Consistent shape for surfacing Stripe failures back to the admin: a 502 with
// the original code and message. 502 rather than 500 because the upstream that
// failed is Stripe, not us — this keeps the distinction readable in logs.
function sendStripeError(res: any, err: StripeSdkError, fallbackMsg: string) {
  res.status(502).json({
    error: err.message || fallbackMsg,
    stripeCode: err.code ?? err.type ?? null,
  });
}

// POST /api/admin/users/:userId/cancel
//   body: { mode?: 'immediate' | 'period_end', reason, requesterEmail? }
//
// Default mode is 'immediate' (the design review decided: cancel-immediate,
// no-refund is the safe default — refund is a separate, explicit step).
//
// Interaction with admin grants: this endpoint only touches the Stripe sub.
// If the user has an active Premium grant stacked on top of a cancelled Pro
// sub, computeEffectiveTier still returns Premium from the grant — the
// grant stacking in tierService.ts covers this without a special case here.
router.post("/users/:userId/cancel", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  const modeRaw = typeof req.body?.mode === "string" ? req.body.mode : "immediate";
  if (!["immediate", "period_end"].includes(modeRaw)) {
    return void res.status(400).json({ error: "mode must be 'immediate' or 'period_end'" });
  }
  const mode = modeRaw as "immediate" | "period_end";
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : null;
  if (!reason) {
    return void res.status(400).json({ error: "reason is required" });
  }

  try {
    const targetUser = await storage.getUserByClerkId(userId);
    if (!targetUser) return void res.status(404).json({ error: "User not found" });
    if (!targetUser.stripe_customer_id) {
      return void res.status(400).json({ error: "User has no Stripe customer — nothing to cancel" });
    }

    const sub = (await storage.getSubscriptionByCustomerId(targetUser.stripe_customer_id)) as any;
    if (!sub) {
      return void res
        .status(400)
        .json({ error: "No active Stripe subscription found for this user" });
    }
    const subscriptionId: string = sub.id;
    const previousStatus: string = sub.status;
    const alreadyMarkedPeriodEnd: boolean = !!sub.cancel_at_period_end;

    // Short-circuit a no-op period_end cancel so the admin gets a clear
    // signal rather than a silent "success" that did nothing.
    if (mode === "period_end" && alreadyMarkedPeriodEnd) {
      return void res.status(409).json({
        error: "Subscription is already set to cancel at period end",
      });
    }

    const stripe = await getUncachableStripeClient();
    const idempotencyKey = `admin-cancel-${userId}-${subscriptionId}-${mode}`;

    let stripeResult: Stripe.Subscription;
    try {
      if (mode === "immediate") {
        stripeResult = await stripe.subscriptions.cancel(
          subscriptionId,
          undefined,
          { idempotencyKey },
        );
      } else {
        stripeResult = await stripe.subscriptions.update(
          subscriptionId,
          { cancel_at_period_end: true },
          { idempotencyKey },
        );
      }
    } catch (err: unknown) {
      if (isStripeError(err)) {
        return void sendStripeError(res, err, "Stripe cancel failed");
      }
      throw err;
    }

    // Projection: immediate cancel drops the user to whatever tier they have
    // without Stripe (free, or an admin grant if one stacks on top).
    // period_end keeps the sub active, so tier doesn't change yet — the
    // recompute is still safe, it just won't update users.tier.
    const beforeEffective = await computeEffectiveTier(userId);
    const afterEffective = await computeEffectiveTier(userId);
    if (afterEffective.tier !== (targetUser.tier ?? "free")) {
      await storage.updateUserTier(userId, afterEffective.tier);
    }

    // current_period_end moved off Subscription to SubscriptionItem in the
    // 2025-08-27.basil API version, but the synced stripe.subscriptions row
    // still carries it as a column. Cast to any here, same pattern as the
    // read in tierService.ts:64.
    const cancelAt =
      mode === "period_end"
        ? ((stripeResult as any).current_period_end ?? null)
        : (stripeResult.canceled_at ?? null);

    await writeAdminAudit({
      adminEmail,
      userId,
      action: "cancel",
      source: "stripe",
      previousState: {
        tier: beforeEffective.tier,
        source: beforeEffective.source,
        stripeStatus: previousStatus,
        cancelAtPeriodEnd: alreadyMarkedPeriodEnd,
      },
      newState: {
        tier: afterEffective.tier,
        source: afterEffective.source,
        stripeStatus: stripeResult.status,
        cancelAtPeriodEnd: !!stripeResult.cancel_at_period_end,
      },
      reason,
      metadata: {
        mode,
        stripeSubscriptionId: subscriptionId,
        cancelAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
      },
    });

    res.json({
      success: true,
      mode,
      subscriptionId,
      status: stripeResult.status,
      cancelAtPeriodEnd: !!stripeResult.cancel_at_period_end,
      cancelAt: cancelAt ? new Date(cancelAt * 1000).toISOString() : null,
      effectiveTier: afterEffective,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:userId/refund
//   body: { amountCents?, reason, requesterEmail? }
//
// Full refund of the latest paid invoice's charge when amountCents is omitted;
// partial refund when it's provided. No tier impact — refunds reimburse past
// periods, not current access. computeEffectiveTier is intentionally not
// called here.
//
// 400 messages are specific enough for the admin to act on:
//   - "No paid invoice found for this customer"
//   - "Latest paid invoice has no associated charge"
//   - "Charge already fully refunded"
//   - "Refund amount exceeds remaining refundable balance (X cents available)"
router.post("/users/:userId/refund", async (req, res) => {
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return;

  const { userId } = req.params;
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : null;
  if (!reason) {
    return void res.status(400).json({ error: "reason is required" });
  }

  // amountCents is optional (omit = full refund). When present, must be a
  // positive integer number of cents — Stripe rejects fractional cents.
  let amountCents: number | undefined;
  if (req.body?.amountCents !== undefined && req.body?.amountCents !== null) {
    const n =
      typeof req.body.amountCents === "string"
        ? Number(req.body.amountCents)
        : (req.body.amountCents as number);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
      return void res
        .status(400)
        .json({ error: "amountCents must be a positive integer (cents)" });
    }
    amountCents = n;
  }

  try {
    const targetUser = await storage.getUserByClerkId(userId);
    if (!targetUser) return void res.status(404).json({ error: "User not found" });
    if (!targetUser.stripe_customer_id) {
      return void res
        .status(400)
        .json({ error: "User has no Stripe customer — nothing to refund" });
    }

    const stripe = await getUncachableStripeClient();

    // Ask Stripe directly for the latest paid invoice. Querying the synced
    // stripe.* tables would be faster but could miss an invoice paid in the
    // last few seconds before the webhook caught up. For refunds, being
    // authoritative matters more than latency.
    let latestPaidInvoice: Stripe.Invoice | undefined;
    try {
      const invoices = await stripe.invoices.list({
        customer: targetUser.stripe_customer_id,
        status: "paid",
        limit: 1,
      });
      latestPaidInvoice = invoices.data[0];
    } catch (err: unknown) {
      if (isStripeError(err)) {
        return void sendStripeError(res, err, "Stripe invoice lookup failed");
      }
      throw err;
    }

    if (!latestPaidInvoice) {
      return void res
        .status(400)
        .json({ error: "No paid invoice found for this customer" });
    }

    const chargeRef = (latestPaidInvoice as any).charge;
    const chargeId: string | null =
      typeof chargeRef === "string" ? chargeRef : chargeRef?.id ?? null;
    if (!chargeId) {
      return void res
        .status(400)
        .json({ error: "Latest paid invoice has no associated charge" });
    }

    let charge: Stripe.Charge;
    try {
      charge = await stripe.charges.retrieve(chargeId);
    } catch (err: unknown) {
      if (isStripeError(err)) {
        return void sendStripeError(res, err, "Stripe charge lookup failed");
      }
      throw err;
    }

    const alreadyRefunded = charge.amount_refunded ?? 0;
    const refundable = Math.max(0, charge.amount - alreadyRefunded);
    if (refundable === 0) {
      return void res.status(400).json({ error: "Charge already fully refunded" });
    }
    if (amountCents !== undefined && amountCents > refundable) {
      return void res.status(400).json({
        error: `Refund amount exceeds remaining refundable balance (${refundable} cents available)`,
      });
    }

    // Idempotency key — stable across retries. A full refund and a partial
    // refund for the same amount of the same charge collapse to one
    // operation; different amounts get different keys.
    const amountKey = amountCents === undefined ? "full" : String(amountCents);
    const idempotencyKey = `admin-refund-${userId}-${chargeId}-${amountKey}`;

    let refund: Stripe.Refund;
    try {
      refund = await stripe.refunds.create(
        {
          charge: chargeId,
          ...(amountCents !== undefined ? { amount: amountCents } : {}),
          metadata: {
            admin_email: adminEmail,
            user_id: userId,
            reason,
          },
        },
        { idempotencyKey },
      );
    } catch (err: unknown) {
      if (isStripeError(err)) {
        return void sendStripeError(res, err, "Stripe refund failed");
      }
      throw err;
    }

    await writeAdminAudit({
      adminEmail,
      userId,
      action: "refund",
      source: "stripe",
      previousState: {
        chargeId,
        chargeAmount: charge.amount,
        previouslyRefunded: alreadyRefunded,
      },
      newState: {
        stripeRefundId: refund.id,
        refundAmount: refund.amount,
        refundStatus: refund.status,
      },
      reason,
      metadata: {
        stripeRefundId: refund.id,
        amountCents: refund.amount,
        chargeId,
        invoiceId: latestPaidInvoice.id,
      },
    });

    res.json({
      success: true,
      refund: {
        id: refund.id,
        amount: refund.amount,
        currency: refund.currency,
        status: refund.status,
        chargeId,
        invoiceId: latestPaidInvoice.id,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Apple/Google IAP Stubs (Phase 3.2 PR 4) ──────────────────────────────────
//
// Four endpoints that always return 501. Their purpose is an evidence trail:
// the day IAP integration lands we want to already see, from admin_audit,
// every time an admin *tried* to cancel or refund an Apple/Google sub. The
// 501 response is deliberately minimal — no UI copy, no "guidance" fields.
// PR 5's mobile admin UI branches on platform + attemptedAction to render
// the right instructions to the admin; putting that copy in the API
// response would couple backend to UI.
//
// All four routes:
//   - dual auth via resolveAdminEmail (same pattern as Stripe endpoints)
//   - require a non-empty `reason`
//   - 404 if the user doesn't exist (so bogus userIds don't leave ghost
//     audit rows)
//   - write the audit row BEFORE responding 501. The audit is the whole
//     point of this PR — if it fails, the 501 still lands (writeAdminAudit
//     swallows errors by design), but the primary work is the insert.
//   - record `newState: null` to be honest — nothing changed.
//
// Source gating: we do NOT reject when resolveSubscriptionSource disagrees
// with the endpoint (e.g., /iap/apple/cancel on a Stripe-only user). The
// mismatch is itself useful evidence captured in metadata; post-facto we can
// spot "admin kept clicking Apple cancel on Stripe users" without losing the
// audit trail to a 400.

type IapPlatform = "apple" | "google";
type IapAction = "cancel" | "refund";
type IapNotImplementedReason =
  | "apple_cancel_user_self_service"
  | "apple_refund_integration_pending"
  | "google_cancel_integration_pending"
  | "google_refund_integration_pending";

// Strips fields already captured in dedicated audit columns (admin email)
// before echoing the request body into metadata. Keeps the row greppable but
// avoids storing the same value in two places.
function sanitizeIapBody(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object") return {};
  const { requesterEmail, ...rest } = body as Record<string, unknown>;
  void requesterEmail;
  return rest;
}

async function writeIapStubAndRespond(args: {
  res: any;
  adminEmail: string;
  userId: string;
  platform: IapPlatform;
  action: IapAction;
  reason: string;
  attemptedAmountCents: number | null;
  notImplementedReason: IapNotImplementedReason;
  requestBody: Record<string, unknown>;
}): Promise<void> {
  const {
    res,
    adminEmail,
    userId,
    platform,
    action,
    reason,
    attemptedAmountCents,
    notImplementedReason,
    requestBody,
  } = args;

  const source = platform === "apple" ? "apple_iap" : "google_play";
  const [effective, resolved] = await Promise.all([
    computeEffectiveTier(userId),
    resolveSubscriptionSource(userId),
  ]);

  await writeAdminAudit({
    adminEmail,
    userId,
    action,
    source,
    previousState: { tier: effective.tier, source: effective.source },
    // Deliberately null: no mutation happened, echoing previousState would
    // misrepresent the audit trail.
    newState: null,
    reason,
    metadata: {
      platform,
      attemptedAction: action,
      userSourceAtAttempt: resolved.source,
      userIapSource: resolved.iapSource,
      userIapOriginalTransactionId: resolved.iapOriginalTransactionId,
      stripeCustomerId: resolved.stripeCustomerId,
      attemptedAmountCents,
      notImplementedReason,
      requestBody,
    },
  });

  res.status(501).json({
    error: "IAP action not implemented",
    platform,
    attemptedAction: action,
    audit: { logged: true },
  });
}

// Shared request validation for the four routes. Returns null on failure
// after sending the response, so the caller can early-return.
async function parseIapRequest(
  req: any,
  res: any,
  opts: { allowAmount: boolean },
): Promise<{ adminEmail: string; userId: string; reason: string; amountCents: number | null } | null> {
  // PR 5a: IAP stubs count as mutations for rate-limit purposes — they
  // still write admin_audit rows even though the response is 501, and we
  // want to throttle audit-log noise the same way as a real cancel.
  const adminEmail = await requireSubscriptionToolsMutation(req, res);
  if (!adminEmail) return null;
  const { userId } = req.params;
  const reason =
    typeof req.body?.reason === "string" && req.body.reason.trim().length > 0
      ? req.body.reason.trim()
      : null;
  if (!reason) {
    res.status(400).json({ error: "reason is required" });
    return null;
  }

  let amountCents: number | null = null;
  if (opts.allowAmount && req.body?.amountCents !== undefined && req.body?.amountCents !== null) {
    const raw =
      typeof req.body.amountCents === "string"
        ? Number(req.body.amountCents)
        : (req.body.amountCents as number);
    if (!Number.isFinite(raw) || !Number.isInteger(raw) || raw <= 0) {
      res.status(400).json({ error: "amountCents must be a positive integer (cents)" });
      return null;
    }
    amountCents = raw;
  }

  const targetUser = await storage.getUserByClerkId(userId);
  if (!targetUser) {
    res.status(404).json({ error: "User not found" });
    return null;
  }

  return { adminEmail, userId, reason, amountCents };
}

// POST /api/admin/users/:userId/iap/apple/cancel  body: { reason, requesterEmail? }
// 501 — Apple has no server-side subscription cancellation; the user must
// cancel in App Store settings. PR 5's UI renders the send-instructions
// flow; this endpoint just records the intent.
router.post("/users/:userId/iap/apple/cancel", async (req, res) => {
  try {
    const parsed = await parseIapRequest(req, res, { allowAmount: false });
    if (!parsed) return;
    await writeIapStubAndRespond({
      res,
      adminEmail: parsed.adminEmail,
      userId: parsed.userId,
      platform: "apple",
      action: "cancel",
      reason: parsed.reason,
      attemptedAmountCents: null,
      notImplementedReason: "apple_cancel_user_self_service",
      requestBody: sanitizeIapBody(req.body),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:userId/iap/apple/refund  body: { amountCents?, reason, requesterEmail? }
// 501 — Apple's refund-request API is not yet integrated. Full refund when
// amountCents is omitted; partial when provided. The amount is recorded in
// metadata for when integration lands.
router.post("/users/:userId/iap/apple/refund", async (req, res) => {
  try {
    const parsed = await parseIapRequest(req, res, { allowAmount: true });
    if (!parsed) return;
    await writeIapStubAndRespond({
      res,
      adminEmail: parsed.adminEmail,
      userId: parsed.userId,
      platform: "apple",
      action: "refund",
      reason: parsed.reason,
      attemptedAmountCents: parsed.amountCents,
      notImplementedReason: "apple_refund_integration_pending",
      requestBody: sanitizeIapBody(req.body),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:userId/iap/google/cancel  body: { reason, requesterEmail? }
// 501 — Play Developer API cancel call not yet integrated.
router.post("/users/:userId/iap/google/cancel", async (req, res) => {
  try {
    const parsed = await parseIapRequest(req, res, { allowAmount: false });
    if (!parsed) return;
    await writeIapStubAndRespond({
      res,
      adminEmail: parsed.adminEmail,
      userId: parsed.userId,
      platform: "google",
      action: "cancel",
      reason: parsed.reason,
      attemptedAmountCents: null,
      notImplementedReason: "google_cancel_integration_pending",
      requestBody: sanitizeIapBody(req.body),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/users/:userId/iap/google/refund  body: { amountCents?, reason, requesterEmail? }
// 501 — Play Console / API refund call not yet integrated. Same amount
// handling as the Apple refund stub.
router.post("/users/:userId/iap/google/refund", async (req, res) => {
  try {
    const parsed = await parseIapRequest(req, res, { allowAmount: true });
    if (!parsed) return;
    await writeIapStubAndRespond({
      res,
      adminEmail: parsed.adminEmail,
      userId: parsed.userId,
      platform: "google",
      action: "refund",
      reason: parsed.reason,
      attemptedAmountCents: parsed.amountCents,
      notImplementedReason: "google_refund_integration_pending",
      requestBody: sanitizeIapBody(req.body),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Error Logs API ────────────────────────────────────────────────────────────
router.get("/errors", requireAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit as string || "50"), 200);
  try {
    const rows = await query(
      "SELECT * FROM error_logs ORDER BY created_at DESC LIMIT $1",
      [limit]
    );
    res.json({ errors: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── All Feedback API ──────────────────────────────────────────────────────────
router.get("/feedback", requireAdmin, async (req, res) => {
  const status = req.query.status as string;
  try {
    const rows = await query(
      `SELECT * FROM feedback ${status ? "WHERE status = $1" : ""} ORDER BY created_at DESC LIMIT 100`,
      status ? [status] : []
    );
    res.json({ feedback: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update feedback status
router.patch("/feedback/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!["new", "in_review", "resolved"].includes(status)) {
    return void res.status(400).json({ error: "Invalid status" });
  }
  try {
    await query("UPDATE feedback SET status = $1 WHERE id = $2", [status, id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── Premium Conversion Funnel ────────────────────────────────────────────────
// Aggregates lock impressions, CTA clicks, and checkouts per feature over the
// requested window (default 30 days). Powers the Phase 2 conversion dashboard
// that tells us which Premium features to prioritise in Phase 3.
//
// Public (no admin secret required) so the mobile admin panel can read it
// using the same email-based isAdmin check the rest of the app uses. We still
// require a valid admin email via the ?email query param.
router.get("/premium-funnel", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email : "";
  if (!email || !isAdminEmail(email)) {
    return void res.status(403).json({ error: "Admin only" });
  }
  const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365));
  try {
    const rows = await query(
      `
      SELECT
        payload->>'feature' AS feature,
        COUNT(*) FILTER (WHERE event_type = 'premium_lock_impression')        AS impressions,
        COUNT(*) FILTER (WHERE event_type = 'premium_lock_cta_click')          AS cta_clicks,
        COUNT(*) FILTER (WHERE event_type = 'premium_paywall_opened')          AS paywall_opens,
        COUNT(*) FILTER (WHERE event_type = 'premium_paywall_checkout_started') AS checkouts,
        COUNT(*) FILTER (WHERE event_type = 'premium_feature_first_use')       AS first_uses
      FROM user_events
      WHERE created_at > NOW() - ($1 || ' days')::interval
        AND payload->>'feature' IS NOT NULL
      GROUP BY 1
      ORDER BY cta_clicks DESC, impressions DESC
      `,
      [days],
    );
    res.json({ funnel: rows, days });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
