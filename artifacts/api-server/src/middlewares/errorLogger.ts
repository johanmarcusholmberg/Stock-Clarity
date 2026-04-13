import { Request, Response, NextFunction } from "express";
import { execute } from "../db";

export async function logError(
  err: Error,
  req: Request,
  _res: Response,
  next: NextFunction
) {
  try {
    await execute(
      "INSERT INTO error_logs (error_type, message, stack, endpoint, user_id, request_body) VALUES ($1, $2, $3, $4, $5, $6)",
      [
        err.name ?? "Error",
        err.message?.slice(0, 1000) ?? "Unknown error",
        err.stack?.slice(0, 3000) ?? null,
        req.path,
        (req as any).auth?.userId ?? null,
        JSON.stringify(req.body ?? {}),
      ]
    );
  } catch {
    // Don't crash on logging errors
  }
  next(err);
}
