import { Router } from "express";
import { query } from "../db";

const router = Router();

// Track a stock view (public - called from mobile)
router.post("/track", async (req, res) => {
  const { userId, ticker, stockName, eventType = "stock_view", payload = {} } = req.body;
  if (!ticker && eventType === "stock_view") {
    return void res.status(400).json({ error: "ticker required" });
  }

  try {
    // Track in stock_views if it's a stock view
    if (eventType === "stock_view" && ticker) {
      await query(
        "INSERT INTO stock_views (user_id, ticker, stock_name, session_id) VALUES ($1, $2, $3, $4)",
        [userId ?? null, ticker, stockName ?? null, req.headers["x-session-id"] ?? null]
      );
    }

    // Always track in user_events
    await query(
      "INSERT INTO user_events (user_id, event_type, payload, ip_address, user_agent) VALUES ($1, $2, $3, $4, $5)",
      [userId ?? null, eventType, JSON.stringify(payload), req.ip, req.headers["user-agent"] ?? null]
    );

    res.json({ success: true });
  } catch {
    res.json({ success: false }); // non-blocking
  }
});

// Get trending stocks
router.get("/trending", async (_req, res) => {
  try {
    const rows = await query(`
      SELECT ticker, stock_name,
             COUNT(*) as view_count,
             COUNT(DISTINCT user_id) as unique_viewers
      FROM stock_views
      WHERE created_at > NOW() - INTERVAL '7 days'
      GROUP BY ticker, stock_name
      ORDER BY view_count DESC
      LIMIT 10
    `);
    res.json({ trending: rows });
  } catch {
    res.json({ trending: [] });
  }
});

// Get public stats summary
router.get("/summary", async (_req, res) => {
  try {
    const [events, stocks, feedback] = await Promise.all([
      query("SELECT COUNT(*) as count FROM user_events WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT COUNT(DISTINCT ticker) as count FROM stock_views WHERE created_at > NOW() - INTERVAL '24 hours'"),
      query("SELECT ROUND(AVG(rating), 1) as avg FROM feedback WHERE rating IS NOT NULL"),
    ]);
    res.json({
      eventsToday: parseInt(events[0]?.count ?? "0"),
      uniqueStocksToday: parseInt(stocks[0]?.count ?? "0"),
      avgRating: parseFloat(feedback[0]?.avg ?? "0"),
    });
  } catch {
    res.json({ eventsToday: 0, uniqueStocksToday: 0, avgRating: 0 });
  }
});

export default router;
