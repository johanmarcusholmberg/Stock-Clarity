import { Router } from "express";
import { execute } from "../db";
import { alertsSchemaReady } from "../lib/alertsSchema";
import { requireSelf } from "../middlewares/requireSelf";

const router = Router();

router.use(async (_req, _res, next) => {
  await alertsSchemaReady;
  next();
});

// Register (or touch) a device's Expo push token against a user.
// Called from the mobile client on sign-in + app launch.
router.post("/", requireSelf, async (req, res) => {
  const { token, userId, platform, timezone } = req.body ?? {};
  if (typeof token !== "string" || !token.startsWith("ExponentPushToken[")) {
    return void res.status(400).json({ error: "invalid Expo push token" });
  }
  if (typeof userId !== "string" || !userId) {
    return void res.status(400).json({ error: "userId required" });
  }
  // IANA zone strings are bounded but we still cap defensively. An invalid
  // timezone here is non-fatal — the evaluator falls back to UTC if it can't
  // parse the value at notification time.
  const tz =
    typeof timezone === "string" && timezone.length > 0 && timezone.length <= 64
      ? timezone
      : null;
  try {
    await execute(
      `INSERT INTO expo_push_tokens (token, user_id, platform, timezone, last_seen)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (token) DO UPDATE
         SET user_id = EXCLUDED.user_id,
             platform = EXCLUDED.platform,
             timezone = COALESCE(EXCLUDED.timezone, expo_push_tokens.timezone),
             last_seen = NOW()`,
      [token, userId, typeof platform === "string" ? platform.slice(0, 16) : null, tz],
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
