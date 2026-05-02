import { Router } from "express";
import { execute } from "../db";
import { alertsSchemaReady } from "../lib/alertsSchema";
import { requireSelf } from "../middlewares/requireSelf";

const router = Router();

router.use(async (_req, _res, next) => {
  await alertsSchemaReady;
  next();
});

// POST /api/notifications/register
//
// Store-build push registration endpoint. Writes to the same expo_push_tokens
// table used by /api/push-tokens; the column names (`last_seen`, `timezone`)
// match the existing schema in lib/alertsSchema.ts and lib/notifySchema.ts.
router.post("/register", requireSelf, async (req, res) => {
  const { userId, token, platform } = req.body as {
    userId: string;
    token: string;
    platform: "ios" | "android";
  };

  if (!userId || !token || !platform) {
    return void res
      .status(400)
      .json({ error: "userId, token, and platform are required" });
  }

  try {
    await execute(
      `INSERT INTO expo_push_tokens (token, user_id, platform, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token)
       DO UPDATE SET user_id = EXCLUDED.user_id,
                     platform = EXCLUDED.platform,
                     last_seen = NOW()`,
      [token, userId, platform],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
