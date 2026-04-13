import { Router } from "express";
import { execute, query, queryOne } from "../db";

const router = Router();

// GET /watchlist/:userId — fetch saved folders
router.get("/:userId", async (req, res) => {
  const { userId } = req.params;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  try {
    const user = await queryOne<any>(
      "SELECT watchlist_data, display_name FROM users WHERE clerk_user_id = $1",
      [userId]
    );
    if (!user) return res.json({ folders: null, displayName: null });
    return res.json({
      folders: user.watchlist_data ?? null,
      displayName: user.display_name ?? null,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// POST /watchlist/:userId — save folders
router.post("/:userId", async (req, res) => {
  const { userId } = req.params;
  const { folders } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (!Array.isArray(folders)) return res.status(400).json({ error: "folders must be an array" });
  try {
    await execute(
      `INSERT INTO users (id, clerk_user_id, watchlist_data, created_at, updated_at)
       VALUES ($1, $1, $2, NOW(), NOW())
       ON CONFLICT (clerk_user_id) DO UPDATE
       SET watchlist_data = $2, updated_at = NOW()`,
      [userId, JSON.stringify(folders)]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

// PATCH /watchlist/:userId/name — save display name
router.patch("/:userId/name", async (req, res) => {
  const { userId } = req.params;
  const { displayName } = req.body;
  if (!userId) return res.status(400).json({ error: "Missing userId" });
  if (typeof displayName !== "string") return res.status(400).json({ error: "displayName must be a string" });
  try {
    await execute(
      `INSERT INTO users (id, clerk_user_id, display_name, created_at, updated_at)
       VALUES ($1, $1, $2, NOW(), NOW())
       ON CONFLICT (clerk_user_id) DO UPDATE
       SET display_name = $2, updated_at = NOW()`,
      [userId, displayName.trim().slice(0, 100)]
    );
    return res.json({ ok: true });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
});

export default router;
