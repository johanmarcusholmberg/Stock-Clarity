import { Router } from "express";
import { storage } from "../storage";
import { writeAdminAudit } from "../lib/tierService";

const router = Router();

// ── Guard: only active when ENABLE_DEV_TOOLS=true AND not in production ───────
// Both conditions must hold. If ADMIN_SECRET_KEY is unset, this endpoint is
// still only reachable by someone with local/dev network access.
router.use((_req, res, next) => {
  const enabled = process.env.ENABLE_DEV_TOOLS === "true";
  const isProd = process.env.NODE_ENV === "production";
  if (!enabled || isProd) {
    return void res.status(404).json({ error: "Not found" });
  }
  next();
});

// Optional admin key guard: if ADMIN_SECRET_KEY is configured, enforce it here too.
function optionalAdminKey(req: any, res: any, next: any) {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) return next(); // No secret configured — dev convenience mode
  const key = req.headers["x-admin-key"] ?? req.query.key;
  if (key === secret) return next();
  res.status(401).json({ error: "Unauthorized — provide x-admin-key header" });
}

// ── Override a user's subscription tier for testing ──────────────────────────
// PATCH /api/dev/tier   body: { userId: string, tier: "free"|"pro"|"premium" }
// Requires: ENABLE_DEV_TOOLS=true + NODE_ENV≠production. If ADMIN_SECRET_KEY
// is set, the x-admin-key header must match it.
router.patch("/tier", optionalAdminKey, async (req, res) => {
  const { userId, tier } = req.body;
  if (!userId) return void res.status(400).json({ error: "userId required" });
  if (!["free", "pro", "premium"].includes(tier)) {
    return void res.status(400).json({ error: "tier must be free, pro, or premium" });
  }
  try {
    // Verify user exists before modifying (prevents blind writes)
    const user = await storage.getUserByClerkId(userId);
    if (!user) return void res.status(404).json({ error: "User not found" });
    const previousTier = user.tier ?? "free";
    await storage.updateUserTier(userId, tier as "free" | "pro" | "premium");
    await writeAdminAudit({
      adminEmail: "dev-tools",
      userId,
      action: "tier_flip",
      source: "manual",
      previousState: { tier: previousTier },
      newState: { tier },
      reason: "dev-tools endpoint",
    });
    res.json({ success: true, userId, tier });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
