import { Router } from "express";
import { execute } from "../db";
import { alertsSchemaReady } from "../lib/alertsSchema";

const router = Router();

router.use(async (_req, _res, next) => {
  await alertsSchemaReady;
  next();
});

// Register (or touch) a device's Expo push token against a user.
// Called from the mobile client on sign-in + app launch.
router.post("/", async (req, res) => {
  const { token, userId, platform } = req.body ?? {};
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken[")) {
    return void res.status(400).json({ error: "invalid Expo push token" });
  }
  if (typeof userId !== "string" || !userId) {
    return void res.status(400).json({ error: "userId required" });
  }
  try {
    await execute(
      `INSERT INTO expo_push_tokens (token, user_id, platform, last_seen)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             last_seen = NOW()`,
      [token, userId, typeof platform === "string" ? platform.slice(0, 16) : null],
    );
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Unregister on sign-out or uninstall detection.
router.delete("/:token", async (req, res) => {
  const { token } = req.params;
  try {
    await execute("DELETE FROM expo_push_tokens WHERE token = $1", [token]);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
