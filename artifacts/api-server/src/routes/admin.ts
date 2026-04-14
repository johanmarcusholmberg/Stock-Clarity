import { Router } from "express";
import { query } from "../db";
import { storage } from "../storage";

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
    res.json({ isAdmin: admin, email, adminEmails: admin ? getAdminEmails() : [] });
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
    if (target !== requesterId) {
      const targetUser = await storage.getUserByClerkId(target);
      if (!targetUser) return void res.status(404).json({ error: "Target user not found" });
    }
    await storage.updateUserTier(target, tier as "free" | "pro" | "premium");
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

  try {
    const [usersRes, eventsRes, errorsRes, feedbackRes, trendingRes, recentErrorsRes, recentFeedbackRes, usersListRes] = await Promise.all([
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
    .tier-form{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    .tier-btn{padding:4px 10px;border-radius:6px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;font-size:12px;cursor:pointer;transition:background 0.15s}
    .tier-btn:hover{background:#334155}
    .tier-btn.active-free{border-color:#64748b;background:#64748b33;color:#94a3b8;font-weight:700}
    .tier-btn.active-pro{border-color:#14b8a6;background:#14b8a633;color:#14b8a6;font-weight:700}
    .tier-btn.active-premium{border-color:#f59e0b;background:#f59e0b33;color:#f59e0b;font-weight:700}
    .uid{font-family:monospace;font-size:11px;color:#475569;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .toast{position:fixed;bottom:24px;right:24px;background:#14b8a6;color:#000;padding:12px 20px;border-radius:10px;font-weight:600;font-size:13px;opacity:0;transition:opacity 0.3s;pointer-events:none;z-index:999}
    @media(max-width:600px){.grid{grid-template-columns:1fr 1fr}}
  </style>`;

  const starsHtml = (r: number) => r ? "★".repeat(r) + "☆".repeat(5 - r) : "—";
  const keyParam = key ? `&key=${encodeURIComponent(key)}` : "";

  const usersRows = users.length
    ? users.map(u => `<tr>
        <td>${u.email ?? "—"}</td>
        <td><span class="badge badge-${u.tier ?? 'free'}">${u.tier ?? 'free'}</span></td>
        <td style="text-align:center">${u.watchlist_count ?? 0}</td>
        <td style="text-align:center">${u.folder_count ?? 0}</td>
        <td style="text-align:center">${u.events_total ?? 0}</td>
        <td style="text-align:center">${u.days_active ?? 0} / ${u.days_since_joined ?? 1}</td>
        <td>
          <div class="tier-form">
            <button class="tier-btn ${(u.tier ?? 'free') === 'free' ? 'active-free' : ''}" onclick="setTier('${u.clerk_user_id}','free',this)">Free</button>
            <button class="tier-btn ${u.tier === 'pro' ? 'active-pro' : ''}" onclick="setTier('${u.clerk_user_id}','pro',this)">Pro</button>
            <button class="tier-btn ${u.tier === 'premium' ? 'active-premium' : ''}" onclick="setTier('${u.clerk_user_id}','premium',this)">Premium</button>
          </div>
        </td>
        <td style="color:#64748b">${new Date(u.created_at).toLocaleDateString()}</td>
      </tr>`).join("")
    : '<tr><td colspan="8" style="color:#64748b;padding:20px">No users yet</td></tr>';

  res.send(`<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>StockClarify Admin</title>${style}</head>
<body>
  <div id="toast" class="toast"></div>
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
        <tr><th>Email</th><th>Tier</th><th>Watchlist</th><th>Folders</th><th>Events</th><th>Days Active / Since Join</th><th>Override Tier</th><th>Joined</th></tr>
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

    function showToast(msg, ok) {
      const t = document.getElementById('toast');
      t.textContent = msg;
      t.style.background = ok ? '#14b8a6' : '#ef4444';
      t.style.opacity = '1';
      setTimeout(() => t.style.opacity = '0', 2500);
    }

    async function setTier(userId, tier, btn) {
      const key = new URLSearchParams(location.search).get('key') || '';
      try {
        const res = await fetch('/api/admin/users/' + encodeURIComponent(userId) + '/tier', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-key': key },
          body: JSON.stringify({ tier })
        });
        if (res.ok) {
          // Update active button styles in this row
          const row = btn.closest('tr');
          row.querySelectorAll('.tier-btn').forEach(b => {
            b.className = 'tier-btn';
          });
          btn.className = 'tier-btn active-' + tier;
          // Update the badge in column 3
          const badge = row.querySelector('.badge');
          badge.className = 'badge badge-' + tier;
          badge.textContent = tier;
          showToast('Tier updated to ' + tier, true);
        } else {
          showToast('Failed to update tier', false);
        }
      } catch {
        showToast('Network error', false);
      }
    }
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
router.patch("/users/:userId/tier", requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { tier } = req.body;
  if (!["free", "pro", "premium"].includes(tier)) {
    return void res.status(400).json({ error: "tier must be free, pro, or premium" });
  }
  try {
    await storage.updateUserTier(userId, tier as "free" | "pro" | "premium");
    res.json({ success: true, userId, tier });
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

export default router;
