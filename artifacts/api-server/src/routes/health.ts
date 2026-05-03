import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { getPool } from "../db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Liveness: process is up. Cheap, no I/O. Used by Replit's deployment
// health probe to decide whether to restart the container.
router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Readiness: process is up AND the DB pool is reachable. Returns 503 on
// failure so an orchestrator can route traffic away (or keep the container
// out of the load-balancer pool) without killing it. Kept deliberately
// minimal — single SELECT 1 with a 2s timeout so a slow DB doesn't pile
// up requests on this endpoint.
router.get("/readyz", async (_req, res) => {
  const started = Date.now();
  try {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await Promise.race([
        client.query("SELECT 1"),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("db ping timeout")), 2000),
        ),
      ]);
    } finally {
      client.release();
    }
    res.json({ status: "ok", db: "ok", durationMs: Date.now() - started });
  } catch (err) {
    logger.warn({ err }, "readyz db ping failed");
    res
      .status(503)
      .json({ status: "degraded", db: "fail", durationMs: Date.now() - started });
  }
});

export default router;
