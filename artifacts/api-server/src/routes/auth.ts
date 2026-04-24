import { Router } from "express";
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { query, execute } from "../db";
import { logger } from "../lib/logger";

const router = Router();

// Ensure the password_history table exists on first load
const ensureTablePromise = execute(`
  CREATE TABLE IF NOT EXISTS password_history (
    id SERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).then(() =>
  execute(`CREATE INDEX IF NOT EXISTS idx_password_history_user_id ON password_history (user_id)`)
).catch((err) => {
  logger.error(err, "Failed to ensure password_history table");
});

const HASH_KEY_LEN = 64;
const SALT_LEN = 16;
const PASSWORD_HISTORY_LIMIT = 10;

function hashPassword(password: string, salt?: Buffer): { salt: Buffer; hash: Buffer } {
  const s = salt ?? randomBytes(SALT_LEN);
  const h = scryptSync(password, s, HASH_KEY_LEN);
  return { salt: s, hash: h };
}

function encodeHash(salt: Buffer, hash: Buffer): string {
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

function decodeHash(encoded: string): { salt: Buffer; hash: Buffer } {
  const [saltHex, hashHex] = encoded.split(":");
  return { salt: Buffer.from(saltHex, "hex"), hash: Buffer.from(hashHex, "hex") };
}

function verifyPassword(password: string, encoded: string): boolean {
  const { salt, hash: storedHash } = decodeHash(encoded);
  const { hash: candidateHash } = hashPassword(password, salt);
  return timingSafeEqual(storedHash, candidateHash);
}

/**
 * POST /api/auth/check-password-history
 * Body: { email: string, password: string }
 * Checks if the password was used in the last 10 passwords for this user.
 */
router.post("/check-password-history", async (req, res) => {
  await ensureTablePromise;
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return void res.status(400).json({ error: "Email and password are required." });
    }

    // Look up user by email
    const user = await query<{ clerk_user_id: string }>(
      "SELECT clerk_user_id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!user.length) {
      // No user found — no history to check, allow the password
      return void res.status(200).json({ ok: true });
    }

    const userId = user[0].clerk_user_id;

    // Fetch last N password hashes
    const history = await query<{ password_hash: string }>(
      `SELECT password_hash FROM password_history
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [userId, PASSWORD_HISTORY_LIMIT]
    );

    for (const entry of history) {
      if (verifyPassword(password, entry.password_hash)) {
        return void res.status(409).json({
          error: "You cannot reuse your last 10 passwords. Please choose a different password.",
        });
      }
    }

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(err, "check-password-history error");
    res.status(500).json({ error: "Internal server error." });
  }
});

/**
 * POST /api/auth/record-password
 * Body: { email: string, password: string }
 * Records a password hash in the user's password history.
 */
router.post("/record-password", async (req, res) => {
  await ensureTablePromise;
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return void res.status(400).json({ error: "Email and password are required." });
    }

    // Look up user by email
    const user = await query<{ clerk_user_id: string }>(
      "SELECT clerk_user_id FROM users WHERE email = $1 LIMIT 1",
      [email]
    );
    if (!user.length) {
      // User doesn't exist yet — they may be signing up; allow and skip recording
      return void res.status(200).json({ ok: true });
    }

    const userId = user[0].clerk_user_id;
    const { salt, hash } = hashPassword(password);
    const encoded = encodeHash(salt, hash);

    await execute(
      "INSERT INTO password_history (user_id, password_hash, created_at) VALUES ($1, $2, NOW())",
      [userId, encoded]
    );

    // Prune old entries beyond the limit
    await execute(
      `DELETE FROM password_history
       WHERE id NOT IN (
         SELECT id FROM password_history
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2
       ) AND user_id = $1`,
      [userId, PASSWORD_HISTORY_LIMIT]
    );

    res.status(200).json({ ok: true });
  } catch (err) {
    logger.error(err, "record-password error");
    res.status(500).json({ error: "Internal server error." });
  }
});

export default router;
