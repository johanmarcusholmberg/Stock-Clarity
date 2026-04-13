import { Router } from "express";
import { query, execute } from "../db";

const router = Router();

// Submit feedback
router.post("/", async (req, res) => {
  const { userId, email, category = "general", message, rating } = req.body;
  if (!message || message.trim().length < 5) {
    return void res.status(400).json({ error: "Message must be at least 5 characters" });
  }
  if (rating && (rating < 1 || rating > 5)) {
    return void res.status(400).json({ error: "Rating must be 1–5" });
  }

  try {
    await execute(
      "INSERT INTO feedback (user_id, email, category, message, rating) VALUES ($1, $2, $3, $4, $5)",
      [userId ?? null, email ?? null, category, message.trim(), rating ?? null]
    );
    res.json({ success: true, message: "Feedback received — thank you!" });
  } catch (err: any) {
    res.status(500).json({ error: "Failed to submit feedback" });
  }
});

// List feedback (admin only)
router.get("/", async (req, res) => {
  const adminKey = req.headers["x-admin-key"];
  if (adminKey !== process.env.ADMIN_SECRET_KEY) {
    return void res.status(403).json({ error: "Forbidden" });
  }

  try {
    const rows = await query(
      "SELECT * FROM feedback ORDER BY created_at DESC LIMIT 100"
    );
    res.json({ feedback: rows });
  } catch {
    res.status(500).json({ error: "Failed to fetch feedback" });
  }
});

export default router;
