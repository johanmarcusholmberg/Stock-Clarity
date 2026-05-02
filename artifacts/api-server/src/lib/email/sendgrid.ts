/**
 * SendGrid implementation of the EmailProvider interface.
 *
 * To swap providers later: create a sibling file (e.g. `resend.ts`) that
 * exports a class with the same shape, and change the `provider` instance
 * in `./index.ts`. No call-site changes anywhere else in the codebase.
 */
import sgMail, { type MailDataRequired } from "@sendgrid/mail";
import type { EmailAddress, EmailMessage, EmailProvider, EmailResult } from "./index";

const apiKey = process.env.SENDGRID_API_KEY;
if (apiKey) {
  sgMail.setApiKey(apiKey);
}

export class SendGridProvider implements EmailProvider {
  readonly name = "sendgrid";
  readonly isConfigured = Boolean(apiKey);

  async send(msg: EmailMessage, fromAddress: string, fromName: string): Promise<EmailResult> {
    if (!this.isConfigured) {
      return { ok: false, skipped: true, reason: "missing_api_key" };
    }

    const data: MailDataRequired = {
      to: normalizeAddresses(msg.to),
      from: { email: fromAddress, name: fromName },
      subject: msg.subject,
      content: [
        { type: "text/plain", value: msg.text },
        { type: "text/html", value: msg.html },
      ],
      ...(msg.replyTo ? { replyTo: msg.replyTo } : {}),
      ...(msg.tags && msg.tags.length > 0 ? { categories: msg.tags } : {}),
    };

    try {
      const [response] = await sgMail.send(data);
      // SendGrid returns 202 Accepted on success. Anything else is a soft fail.
      if (response.statusCode >= 200 && response.statusCode < 300) {
        return { ok: true, provider: this.name };
      }
      return {
        ok: false,
        error: `SendGrid returned status ${response.statusCode}`,
      };
    } catch (err) {
      // SendGrid attaches a `response.body.errors` array with the real reason.
      const reason = extractSendGridError(err);
      return { ok: false, error: reason };
    }
  }
}

function normalizeAddresses(addr: EmailAddress | EmailAddress[]): string | string[] {
  const list = Array.isArray(addr) ? addr : [addr];
  const flattened = list.map((a) => (typeof a === "string" ? a : a.email));
  return flattened.length === 1 ? flattened[0]! : flattened;
}

function extractSendGridError(err: unknown): string {
  if (err && typeof err === "object" && "response" in err) {
    const response = (err as { response?: { body?: unknown; statusCode?: number } }).response;
    const body = response?.body;

    // Standard v3 SDK shape: body = { errors: [{ message }] }
    if (body && typeof body === "object" && "errors" in body) {
      const errors = (body as { errors?: Array<{ message?: string }> }).errors;
      const messages = errors?.map((e) => e.message).filter(Boolean);
      if (messages && messages.length > 0) return messages.join("; ");
    }

    // WAF / proxy rejects sometimes return a plain string body.
    if (typeof body === "string" && body.length > 0) {
      return response?.statusCode ? `${response.statusCode}: ${body}` : body;
    }

    if (response?.statusCode) {
      return `SendGrid HTTP ${response.statusCode}`;
    }
  }
  return err instanceof Error ? err.message : String(err);
}
