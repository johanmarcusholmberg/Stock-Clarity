import { Router, type IRouter } from "express";

const router: IRouter = Router();

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@stockclarify.app";
const COMPANY_NAME = process.env.COMPANY_NAME ?? "StockClarify";

const today = () =>
  new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

const SHARED_CSS = `
  :root {
    --bg: #ffffff;
    --fg: #1a1a1a;
    --muted: #555;
    --accent: #0A1628;
    --border: #e5e7eb;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0A1628;
      --fg: #F7FAFC;
      --muted: #9aa5b1;
      --accent: #ffffff;
      --border: #1f2937;
    }
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    max-width: 760px;
    margin: 0 auto;
    padding: 40px 24px 80px;
    color: var(--fg);
    background: var(--bg);
    line-height: 1.65;
    font-size: 16px;
  }
  h1 { color: var(--accent); font-size: 32px; margin: 0 0 8px; }
  h2 { color: var(--accent); font-size: 20px; margin: 36px 0 12px; }
  h3 { font-size: 17px; margin: 24px 0 8px; }
  p, li { color: var(--fg); }
  ul { padding-left: 22px; }
  li { margin-bottom: 6px; }
  .meta { color: var(--muted); font-size: 14px; margin-bottom: 32px; }
  .nav { font-size: 14px; margin-bottom: 32px; }
  .nav a { color: var(--accent); text-decoration: none; margin-right: 16px; }
  .nav a:hover { text-decoration: underline; }
  .callout {
    background: var(--border);
    border-radius: 10px;
    padding: 16px 20px;
    margin: 16px 0;
    font-size: 15px;
  }
  a { color: var(--accent); }
  hr { border: none; border-top: 1px solid var(--border); margin: 40px 0; }
  footer { color: var(--muted); font-size: 13px; margin-top: 48px; }
`;

const layout = (title: string, body: string) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} – ${COMPANY_NAME}</title>
  <style>${SHARED_CSS}</style>
</head>
<body>
  <div class="nav">
    <a href="/legal/privacy">Privacy Policy</a>
    <a href="/legal/terms">Terms of Service</a>
  </div>
  ${body}
  <footer>© ${new Date().getFullYear()} ${COMPANY_NAME}. Contact: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
</body>
</html>`;

// ─── Privacy Policy ─────────────────────────────────────────────────────────
router.get("/privacy", (_req, res) => {
  res.send(
    layout(
      "Privacy Policy",
      `
  <h1>Privacy Policy</h1>
  <p class="meta">Last updated: ${today()}</p>

  <p>${COMPANY_NAME} ("we", "us", "our") provides a personal stock-watchlist
  and AI-summary application ("the Service"). This policy explains what data
  we collect, how we use it, with whom we share it, and the rights you have.</p>

  <h2>1. Information We Collect</h2>
  <h3>Account information</h3>
  <ul>
    <li>Email address (required for sign-in via Clerk).</li>
    <li>Display name (optional, set by you).</li>
    <li>OAuth identifiers if you sign in with Google or Apple (provider-supplied user ID only — we do not receive your password).</li>
  </ul>
  <h3>App usage data</h3>
  <ul>
    <li>Tickers you add to your watchlist and folders.</li>
    <li>Holdings and lot information you choose to enter (cost basis, quantity, purchase date).</li>
    <li>Alert configurations you create (price thresholds, notification preferences).</li>
    <li>Notification preferences and delivery times.</li>
    <li>Feedback you submit through the in-app form.</li>
    <li>Anonymous app analytics (screen views, feature usage) used to improve the Service.</li>
  </ul>
  <h3>Payment information</h3>
  <ul>
    <li>If you subscribe to Pro or Premium, payments are processed by <strong>Stripe</strong> (web) or <strong>Apple / Google</strong> (in-app purchase). We never see or store your full card number — we only retain the customer/subscription identifiers needed to grant access to paid features.</li>
  </ul>
  <h3>Device data</h3>
  <ul>
    <li>Push notification token (if you enable notifications), used to deliver alerts.</li>
    <li>Device locale and time zone, used to display data and schedule notifications.</li>
  </ul>

  <h2>2. How We Use Your Information</h2>
  <ul>
    <li>To authenticate you and maintain your session.</li>
    <li>To fetch market data, news, and AI summaries for the tickers you follow.</li>
    <li>To deliver push or email notifications you have subscribed to.</li>
    <li>To process subscriptions and grant entitlements to paid features.</li>
    <li>To respond to support requests and feedback.</li>
    <li>To detect, prevent, and respond to abuse, fraud, or security incidents.</li>
    <li>To improve the Service through aggregated, non-identifying analytics.</li>
  </ul>

  <h2>3. Third Parties We Share Data With</h2>
  <p>We share the minimum data necessary for each provider to deliver its function:</p>
  <ul>
    <li><strong>Clerk</strong> — authentication and session management. <a href="https://clerk.com/privacy" target="_blank" rel="noopener">clerk.com/privacy</a></li>
    <li><strong>Stripe</strong> — web subscription payments. <a href="https://stripe.com/privacy" target="_blank" rel="noopener">stripe.com/privacy</a></li>
    <li><strong>Apple App Store / Google Play</strong> — in-app subscription billing.</li>
    <li><strong>RevenueCat</strong> — reconciles in-app purchases across iOS and Android.</li>
    <li><strong>OpenAI</strong> — generates AI news and event summaries. We send only the public news content and ticker symbol; we do not send your account identifiers.</li>
    <li><strong>Market-data provider</strong> — supplies live quotes, fundamentals, and historical prices. We send only the tickers you have asked us to look up.</li>
    <li><strong>Expo / Apple APNs / Google FCM</strong> — delivers push notifications.</li>
    <li><strong>Email provider</strong> — sends transactional and digest emails.</li>
    <li><strong>Better Stack</strong> — collects server error logs (no personal data is intentionally included in log lines or stack traces).</li>
  </ul>
  <p>We do not sell your personal information. We do not run third-party advertising
  inside the app, and we do not share your data with advertisers.</p>

  <h2>4. Data Retention and Deletion</h2>
  <p>Your data is retained while your account is active. When you delete your
  account from inside the app (Account → Delete account), the following
  happens immediately:</p>
  <ul>
    <li>Your profile, watchlist, folders, holdings, lots, alerts, alert history, push tokens, notification subscriptions and history, AI usage counters, and feedback are <strong>permanently deleted</strong> from our database.</li>
    <li>Any active web (Stripe) subscription is cancelled.</li>
    <li>Your sign-in account at our authentication provider (Clerk) is deleted.</li>
  </ul>
  <p>Subscriptions purchased through the Apple App Store or Google Play
  cannot be cancelled by us; you must cancel them in the App Store or Play
  Store settings before or after deleting your account.</p>
  <p>The following limited records are <strong>retained</strong> after
  deletion, for the periods stated:</p>
  <ul>
    <li><strong>Administrative audit log</strong> — records of administrative actions taken on or by your account (no free-text personal content). Retained for security and abuse-prevention purposes for up to 24 months.</li>
    <li><strong>Payment and tax records</strong> — invoices, tax records, and dispute history held by Stripe, Apple, and Google as required by financial regulations (typically 7 years).</li>
    <li><strong>Security and operational logs</strong> — request and error logs that may contain hashed identifiers, retained for up to 90 days for security investigation.</li>
  </ul>

  <h3>Legal bases for processing (EEA / UK)</h3>
  <p>Where the GDPR or UK GDPR applies, our legal bases are:</p>
  <ul>
    <li><strong>Performance of a contract</strong> — to deliver the Service you signed up for (account, watchlist, alerts, AI summaries, billing).</li>
    <li><strong>Legitimate interests</strong> — security monitoring, fraud and abuse prevention, and product improvement through aggregated analytics, balanced against your privacy interests.</li>
    <li><strong>Consent</strong> — for optional features such as push notifications and marketing emails. You can withdraw consent at any time in the app.</li>
    <li><strong>Legal obligation</strong> — for tax, accounting, and law-enforcement requests we are required to satisfy.</li>
  </ul>

  <h2>5. Your Rights</h2>
  <p>Depending on where you live, you may have the right to: access the
  personal data we hold about you, correct it, delete it, restrict or object to
  certain processing, port it to another service, and withdraw consent. You
  can exercise most of these directly in the app. For the rest, email us at
  <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> and we will respond
  within 30 days.</p>

  <h2>6. Children</h2>
  <p>The Service is not directed to children under 13 (or under 16 in the EEA/UK).
  We do not knowingly collect personal data from children. If you believe a
  child has signed up, contact us and we will delete the account.</p>

  <h2>7. Security</h2>
  <p>We use industry-standard transport encryption (TLS) for data in transit
  and rely on managed providers (Clerk, our cloud database, Stripe) for
  encryption at rest. No system is perfectly secure — please use a strong,
  unique password and enable any available account-protection features.</p>

  <h2>8. International Transfers</h2>
  <p>Our service runs on cloud infrastructure that may process data in the
  United States and other countries. By using the Service you consent to such
  transfers, subject to the protections described in this policy.</p>

  <h2>9. Changes to This Policy</h2>
  <p>If we materially change this policy we will update the "Last updated"
  date above and, where appropriate, notify you in the app or by email.</p>

  <h2>10. Contact</h2>
  <p>Questions or requests: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
`,
    ),
  );
});

// ─── Terms of Service ───────────────────────────────────────────────────────
router.get("/terms", (_req, res) => {
  res.send(
    layout(
      "Terms of Service",
      `
  <h1>Terms of Service</h1>
  <p class="meta">Last updated: ${today()}</p>

  <div class="callout">
    <strong>Important:</strong> ${COMPANY_NAME} is an information tool, not
    a financial advisor or broker. Nothing in the app is investment advice or a
    recommendation to buy, sell, or hold any security. You make all investment
    decisions on your own and at your own risk.
  </div>

  <h2>1. Acceptance of Terms</h2>
  <p>By creating an account or using the Service you agree to these Terms.
  If you do not agree, do not use the Service.</p>

  <h2>2. Eligibility</h2>
  <p>You must be at least 13 years old (16 in the EEA/UK) to use the Service,
  and at least the age of majority in your jurisdiction to subscribe to a paid
  plan.</p>

  <h2>3. Your Account</h2>
  <p>You are responsible for keeping your sign-in credentials secure and for
  all activity on your account. Notify us immediately at
  <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> if you suspect any
  unauthorized access.</p>

  <h2>4. Subscriptions and Billing</h2>
  <ul>
    <li><strong>Tiers.</strong> The Service offers a Free tier and paid tiers (Pro and Premium). Features and quotas for each tier are described inside the app.</li>
    <li><strong>Web payments.</strong> Web subscriptions are billed by Stripe in the currency shown at checkout. Charges renew automatically each billing period unless cancelled.</li>
    <li><strong>In-app purchases.</strong> Subscriptions purchased on iOS are billed through your Apple ID; subscriptions purchased on Android are billed through Google Play. These follow Apple's and Google's standard subscription terms, including their auto-renew, cancellation, and refund policies.</li>
    <li><strong>Cancellation.</strong> You can cancel anytime: web subscribers via the Stripe billing portal in Account → Manage Subscription, iOS subscribers via Apple ID settings, Android subscribers via Google Play. Cancelling stops future charges; access continues until the end of the paid period.</li>
    <li><strong>Refunds.</strong> Web subscriptions are non-refundable except where required by law. App Store and Play Store refunds are governed by Apple and Google, respectively.</li>
    <li><strong>Price changes.</strong> We may change subscription prices with at least 30 days' notice; changes take effect at your next renewal.</li>
  </ul>

  <h2>5. Acceptable Use</h2>
  <p>You agree not to:</p>
  <ul>
    <li>Reverse-engineer, decompile, or attempt to extract our source code or AI prompts;</li>
    <li>Scrape, mirror, or resell market data or AI summaries obtained through the Service;</li>
    <li>Bypass usage quotas or share a single account among multiple people;</li>
    <li>Upload content that is unlawful, infringing, or harmful;</li>
    <li>Interfere with or disrupt the Service, its infrastructure, or other users;</li>
    <li>Use the Service to violate any applicable law or regulation, including securities and market-manipulation laws.</li>
  </ul>

  <h2>6. Market Data and AI Content — Disclaimer</h2>
  <p>Market data shown in the Service may be delayed, may contain errors,
  and is provided "as-is". AI-generated summaries are produced by large
  language models and may be inaccurate, incomplete, or out of date. Prices,
  ratings, and summaries are <strong>not</strong> investment recommendations.
  We do not guarantee any return, performance, or outcome.</p>
  <p>You should verify any information independently and consult a licensed
  financial advisor before making investment decisions. ${COMPANY_NAME} is
  not registered as an investment adviser or broker-dealer in any
  jurisdiction.</p>

  <h2>7. Intellectual Property</h2>
  <p>The Service, including its software, design, and AI-generated outputs as
  presented to you, is owned by ${COMPANY_NAME} and licensed to you on a
  limited, non-exclusive, non-transferable basis solely for personal,
  non-commercial use during your subscription.</p>

  <h2>8. Third-Party Services</h2>
  <p>The Service relies on third-party services (Clerk, Stripe, Apple, Google,
  OpenAI, our market-data provider, Better Stack, and others). Their availability
  is outside our control, and outages or changes by these providers may
  affect the Service.</p>

  <h2>9. Termination</h2>
  <p>You may delete your account at any time inside the app. We may suspend
  or terminate your access if you breach these Terms or use the Service in
  a way that creates risk for us, other users, or third parties. We will give
  you reasonable notice when we can.</p>

  <h2>10. Disclaimer of Warranties</h2>
  <p>To the maximum extent permitted by law, the Service is provided "AS IS"
  and "AS AVAILABLE", without warranties of any kind, whether express,
  implied, or statutory, including warranties of merchantability, fitness for
  a particular purpose, accuracy, or non-infringement.</p>

  <h2>11. Limitation of Liability</h2>
  <p>To the maximum extent permitted by law, ${COMPANY_NAME}'s total
  liability arising out of or in connection with the Service is limited to the
  greater of (a) the amount you paid us in the twelve months before the
  event giving rise to the claim, or (b) US$50. We are not liable for any
  indirect, incidental, special, consequential, or punitive damages, or for
  loss of profits, revenue, data, or goodwill, even if advised of the
  possibility.</p>
  <p><strong>You acknowledge that investment decisions can lead to financial
  loss and that any loss resulting from your reliance on information in the
  Service is your responsibility, not ours.</strong></p>

  <h2>12. Indemnity</h2>
  <p>You agree to indemnify and hold ${COMPANY_NAME} harmless from any
  third-party claim arising from your misuse of the Service or your breach
  of these Terms.</p>

  <h2>13. Governing Law</h2>
  <p>These Terms are governed by the laws of the jurisdiction in which
  ${COMPANY_NAME} is established, without regard to conflict-of-law rules.
  Mandatory consumer-protection rights in your country of residence are not
  affected.</p>

  <h2>14. Changes to These Terms</h2>
  <p>We may update these Terms from time to time. Material changes will be
  announced in the app or by email at least 14 days before they take effect.
  Continued use of the Service after the effective date constitutes
  acceptance.</p>

  <h2>15. Contact</h2>
  <p>Questions about these Terms: <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></p>
`,
    ),
  );
});

// Index page that just links to both
router.get("/", (_req, res) => {
  res.send(
    layout(
      "Legal",
      `
  <h1>Legal</h1>
  <ul>
    <li><a href="/legal/privacy">Privacy Policy</a></li>
    <li><a href="/legal/terms">Terms of Service</a></li>
  </ul>
`,
    ),
  );
});

export default router;
