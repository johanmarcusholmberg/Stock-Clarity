import { logger } from "./logger";

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: "default";
  channelId?: string;
}

/**
 * Send a batch of messages via Expo's push service.
 * Returns the per-message receipts from Expo, or an empty array on failure.
 *
 * We fire-and-forget at the call site — failures are logged but don't
 * propagate. The evaluator proceeds regardless; delivery receipts would be
 * checked via a separate reconciliation pass (not in MVP scope).
 */
export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<any[]> {
  if (!messages.length) return [];
  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Accept-Encoding": "gzip, deflate",
      },
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "Expo push send returned non-OK");
      return [];
    }
    const data = (await res.json()) as { data?: any[] };
    return Array.isArray(data?.data) ? data.data : [];
  } catch (err: any) {
    logger.warn({ err: err?.message }, "Expo push send failed");
    return [];
  }
}
