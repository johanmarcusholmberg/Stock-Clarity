/**
 * Transactional email templates for StockClarify.
 *
 * Each template returns the full `EmailMessage` ready to hand to `sendEmail()`.
 * HTML is hand-written with inline styles (no template engine needed for this
 * volume of templates) and matches the app's brand:
 *   - dark navy background  #0A1628
 *   - bright text           #F7FAFC
 *   - positive (green)      #0A8C63
 *   - negative (red)        #DC2030
 *
 * Every template includes a plain-text fallback. Several email clients
 * (older Outlook, accessibility tools, search-result previews) render the
 * text version, so it must be intelligible on its own.
 */
import type { EmailMessage } from "./index";

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@stockclarify.app";
const APP_NAME = "StockClarify";

// Shared HTML wrapper so brand styling stays in one place.
function wrap(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#F7FAFC;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A1628;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#11253D;border-radius:14px;overflow:hidden;">
        <tr><td style="padding:28px 32px 8px 32px;">
          <div style="font-size:20px;font-weight:700;letter-spacing:0.2px;color:#F7FAFC;">${escapeHtml(APP_NAME)}</div>
        </td></tr>
        <tr><td style="padding:8px 32px 28px 32px;color:#F7FAFC;font-size:15px;line-height:1.55;">
          ${bodyHtml}
        </td></tr>
        <tr><td style="padding:18px 32px 24px 32px;border-top:1px solid #2F3A40;color:#9AA8B6;font-size:12px;line-height:1.5;">
          You're receiving this because you have a ${escapeHtml(APP_NAME)} account.
          Need help? Reply to this email or write to
          <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}" style="color:#9AA8B6;">${escapeHtml(SUPPORT_EMAIL)}</a>.
          <br /><br />
          <span style="color:#7A8896;">${escapeHtml(APP_NAME)} provides general financial information only. Nothing in this email is investment advice. Always do your own research.</span>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ── Welcome ──────────────────────────────────────────────────────────────────

export function welcomeEmail(opts: { to: string; firstName?: string | null }): EmailMessage {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Welcome!";
  const subject = `Welcome to ${APP_NAME}`;
  const html = wrap(
    subject,
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#F7FAFC;">${escapeHtml(greeting)}</h2>
    <p style="margin:0 0 12px 0;">Thanks for joining ${escapeHtml(APP_NAME)}. You're set up and ready to go.</p>
    <p style="margin:0 0 12px 0;">A few things you can do right now:</p>
    <ul style="margin:0 0 16px 20px;padding:0;color:#F7FAFC;">
      <li style="margin-bottom:6px;">Add stocks to your watchlist and organize them into folders</li>
      <li style="margin-bottom:6px;">Read the daily Brief — a plain-English summary of what moved your watchlist</li>
      <li style="margin-bottom:6px;">Set price and news alerts so you only check in when something changes</li>
    </ul>
    <p style="margin:0;color:#9AA8B6;font-size:13px;">If you didn't sign up for ${escapeHtml(APP_NAME)}, please reply to this email and we'll remove your account.</p>
    `,
  );
  const text = `${greeting}

Thanks for joining ${APP_NAME}. You're set up and ready to go.

A few things you can do right now:
- Add stocks to your watchlist and organize them into folders
- Read the daily Brief — a plain-English summary of what moved your watchlist
- Set price and news alerts so you only check in when something changes

If you didn't sign up for ${APP_NAME}, please reply to this email and we'll remove your account.

— The ${APP_NAME} team`;
  return { to: opts.to, subject, html, text, tags: ["welcome"] };
}

// ── Payment receipt ──────────────────────────────────────────────────────────

export function paymentReceiptEmail(opts: {
  to: string;
  tier: "pro" | "premium";
  amountCents: number;
  currency: string;
  invoiceUrl?: string | null;
}): EmailMessage {
  // tierLabel and amount are constructed from trusted internal values today,
  // but we still escape them defensively so a future change that lets user
  // input flow into either field can't introduce HTML injection.
  const tierLabel = escapeHtml(opts.tier === "premium" ? "Premium" : "Pro");
  const amount = escapeHtml(formatMoney(opts.amountCents, opts.currency));
  const subject = `${APP_NAME} ${opts.tier === "premium" ? "Premium" : "Pro"} — payment received`;
  const invoiceLine = opts.invoiceUrl
    ? `<p style="margin:0 0 12px 0;"><a href="${escapeHtml(opts.invoiceUrl)}" style="color:#0A8C63;font-weight:600;">View your invoice</a></p>`
    : "";
  const html = wrap(
    subject,
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#F7FAFC;">Thanks for the payment</h2>
    <p style="margin:0 0 12px 0;">We've received your ${amount} payment for ${escapeHtml(APP_NAME)} ${tierLabel}.</p>
    <p style="margin:0 0 12px 0;">Your subscription is active and all ${tierLabel} features are unlocked.</p>
    ${invoiceLine}
    <p style="margin:0;color:#9AA8B6;font-size:13px;">Manage your subscription anytime from the Account tab in the app.</p>
    `,
  );
  const text = `Thanks for the payment

We've received your ${amount} payment for ${APP_NAME} ${tierLabel}.

Your subscription is active and all ${tierLabel} features are unlocked.${opts.invoiceUrl ? `\n\nInvoice: ${opts.invoiceUrl}` : ""}

Manage your subscription anytime from the Account tab in the app.

— The ${APP_NAME} team`;
  return { to: opts.to, subject, html, text, tags: ["payment-receipt"] };
}

// ── Payment failed (dunning) ─────────────────────────────────────────────────

export function paymentFailedEmail(opts: {
  to: string;
  tier: "pro" | "premium";
  amountCents: number;
  currency: string;
  updatePaymentUrl?: string | null;
}): EmailMessage {
  const tierLabel = escapeHtml(opts.tier === "premium" ? "Premium" : "Pro");
  const amount = escapeHtml(formatMoney(opts.amountCents, opts.currency));
  const subject = `${APP_NAME} ${opts.tier === "premium" ? "Premium" : "Pro"} — payment didn't go through`;
  const ctaLine = opts.updatePaymentUrl
    ? `<p style="margin:0 0 16px 0;"><a href="${escapeHtml(opts.updatePaymentUrl)}" style="display:inline-block;background:#0A8C63;color:#F7FAFC;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;">Update payment method</a></p>`
    : `<p style="margin:0 0 16px 0;">Open the Account tab in the app to update your payment method.</p>`;
  const html = wrap(
    subject,
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#DC2030;">Payment didn't go through</h2>
    <p style="margin:0 0 12px 0;">We tried to charge ${amount} for your ${escapeHtml(APP_NAME)} ${tierLabel} subscription, but the payment was declined.</p>
    <p style="margin:0 0 16px 0;">Your subscription is still active for now — we'll retry automatically over the next few days. To avoid losing access, please update your payment method:</p>
    ${ctaLine}
    <p style="margin:0;color:#9AA8B6;font-size:13px;">If you no longer want to subscribe, you can cancel from the Account tab and ignore this email.</p>
    `,
  );
  const text = `Payment didn't go through

We tried to charge ${amount} for your ${APP_NAME} ${tierLabel} subscription, but the payment was declined.

Your subscription is still active for now — we'll retry automatically over the next few days. To avoid losing access, please update your payment method${opts.updatePaymentUrl ? `:\n\n${opts.updatePaymentUrl}` : " from the Account tab in the app."}

If you no longer want to subscribe, you can cancel from the Account tab and ignore this email.

— The ${APP_NAME} team`;
  return { to: opts.to, subject, html, text, tags: ["payment-failed"] };
}

// ── Account deletion confirmation ────────────────────────────────────────────

export function accountDeletionEmail(opts: { to: string; firstName?: string | null }): EmailMessage {
  const greeting = opts.firstName ? `Hi ${opts.firstName},` : "Hi,";
  const subject = `Your ${APP_NAME} account has been deleted`;
  const html = wrap(
    subject,
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#F7FAFC;">${escapeHtml(greeting)}</h2>
    <p style="margin:0 0 12px 0;">Your ${escapeHtml(APP_NAME)} account and all associated data have been deleted as requested.</p>
    <p style="margin:0 0 12px 0;">As described in our Privacy Policy, a small number of records are retained for legal and compliance reasons:</p>
    <ul style="margin:0 0 16px 20px;padding:0;color:#F7FAFC;">
      <li style="margin-bottom:6px;">Payment records (kept by our payment processor for 7 years for tax purposes)</li>
      <li style="margin-bottom:6px;">Security audit logs (kept for 90 days)</li>
      <li style="margin-bottom:6px;">Administrative action logs (kept for 24 months)</li>
    </ul>
    <p style="margin:0 0 12px 0;">If your subscription was billed through the App Store or Play Store, please remember to cancel it there as well — those subscriptions can't be cancelled from our side.</p>
    <p style="margin:0;color:#9AA8B6;font-size:13px;">If you didn't request this deletion, please contact ${escapeHtml(SUPPORT_EMAIL)} immediately.</p>
    `,
  );
  const text = `${greeting}

Your ${APP_NAME} account and all associated data have been deleted as requested.

As described in our Privacy Policy, a small number of records are retained for legal and compliance reasons:
- Payment records (kept by our payment processor for 7 years for tax purposes)
- Security audit logs (kept for 90 days)
- Administrative action logs (kept for 24 months)

If your subscription was billed through the App Store or Play Store, please remember to cancel it there as well — those subscriptions can't be cancelled from our side.

If you didn't request this deletion, please contact ${SUPPORT_EMAIL} immediately.

— The ${APP_NAME} team`;
  return { to: opts.to, subject, html, text, tags: ["account-deletion"] };
}

// ── Alert notification (price / news) ────────────────────────────────────────

export function alertNotificationEmail(opts: {
  to: string;
  title: string;
  body: string;
  symbol?: string | null;
}): EmailMessage {
  const subject = opts.symbol ? `${opts.symbol}: ${opts.title}` : opts.title;
  const html = wrap(
    subject,
    `
    <h2 style="margin:0 0 12px 0;font-size:20px;color:#F7FAFC;">${escapeHtml(opts.title)}</h2>
    <p style="margin:0 0 16px 0;font-size:15px;color:#F7FAFC;">${escapeHtml(opts.body)}</p>
    <p style="margin:0;color:#9AA8B6;font-size:13px;">Open ${escapeHtml(APP_NAME)} to see the full chart, news, and AI summary.</p>
    `,
  );
  const text = `${opts.title}

${opts.body}

Open ${APP_NAME} to see the full chart, news, and AI summary.

— The ${APP_NAME} team`;
  return { to: opts.to, subject, html, text, tags: ["alert", opts.symbol ? `symbol:${opts.symbol}` : "no-symbol"] };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(amountCents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() })
      .format(amountCents / 100);
  } catch {
    return `${(amountCents / 100).toFixed(2)} ${currency.toUpperCase()}`;
  }
}
