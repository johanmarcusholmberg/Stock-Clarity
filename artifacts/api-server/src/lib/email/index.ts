/**
 * Provider-agnostic transactional email service.
 *
 * The rest of the codebase calls `sendEmail()` and never imports the provider
 * directly — to swap SendGrid for Resend / Postmark / SES, replace the
 * `provider` instance below with a different implementation that satisfies
 * `EmailProvider`. No call sites change.
 *
 * Failure semantics:
 *   - If the provider isn't configured (no SENDGRID_API_KEY), `sendEmail()`
 *     logs at WARN and returns `{ ok: false, skipped: true }`. It never
 *     throws, because email failures must not break the underlying request
 *     (a Stripe webhook still needs to ack 200, an account deletion still
 *     needs to wipe data, etc).
 *   - On real send failures the error is logged and `{ ok: false, error }`
 *     is returned. Callers should `void sendEmail(...)` unless they care
 *     about the result.
 */
import { logger } from "../logger";
import { SendGridProvider } from "./sendgrid";

export type EmailAddress = string | { email: string; name?: string };

export type EmailMessage = {
  to: EmailAddress | EmailAddress[];
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  /** Categories / tags for analytics (provider-specific support varies). */
  tags?: string[];
};

export type EmailResult =
  | { ok: true; provider: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped?: false; error: string };

export interface EmailProvider {
  readonly name: string;
  readonly isConfigured: boolean;
  send(msg: EmailMessage, fromAddress: string, fromName: string): Promise<EmailResult>;
}

const provider: EmailProvider = new SendGridProvider();

const FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? "alerts@stockclarify.app";
const FROM_NAME = process.env.EMAIL_FROM_NAME ?? "StockClarify";

export async function sendEmail(msg: EmailMessage): Promise<EmailResult> {
  if (!provider.isConfigured) {
    // No PII here — we only log that an email was skipped, not who it was to.
    logger.warn(
      { subject: msg.subject, provider: provider.name },
      "Email skipped: provider not configured (set SENDGRID_API_KEY to enable).",
    );
    return { ok: false, skipped: true, reason: "provider_not_configured" };
  }
  try {
    const result = await provider.send(msg, FROM_ADDRESS, FROM_NAME);
    if (result.ok) {
      // Recipient address is PII — keep it at debug level only. INFO-level
      // log carries just the subject / provider so we can confirm dispatch
      // happened without leaking addresses into routine production logs.
      logger.debug(
        { to: stringifyTo(msg.to), subject: msg.subject, provider: provider.name },
        "Email sent (recipient at debug)",
      );
      logger.info(
        { subject: msg.subject, provider: provider.name },
        "Email sent",
      );
    } else if (!result.skipped) {
      // Errors include the recipient because failed-delivery debugging
      // genuinely requires knowing who we tried to mail.
      logger.error(
        { to: stringifyTo(msg.to), subject: msg.subject, provider: provider.name, err: result.error },
        "Email send failed",
      );
    }
    return result;
  } catch (err) {
    logger.error(
      { err, to: stringifyTo(msg.to), subject: msg.subject, provider: provider.name },
      "Email send threw — swallowed so caller is unaffected",
    );
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function isEmailConfigured(): boolean {
  return provider.isConfigured;
}

function stringifyTo(to: EmailAddress | EmailAddress[]): string {
  const list = Array.isArray(to) ? to : [to];
  return list.map((a) => (typeof a === "string" ? a : a.email)).join(", ");
}

export * from "./templates";
