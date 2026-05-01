import { Router } from "express";

const router = Router();

router.get("/privacy", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Privacy Policy – StockClarify</title>
  <style>
    body { font-family: -apple-system, sans-serif; max-width: 720px;
           margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
    h1 { color: #0A1628; } h2 { margin-top: 2em; }
  </style>
</head>
<body>
  <h1>Privacy Policy</h1>
  <p><strong>Last updated:</strong> ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</p>

  <h2>Information We Collect</h2>
  <p>We collect your email address for account creation via Clerk authentication.
  We collect stock tickers you add to your watchlist to provide personalised
  market data and AI-generated summaries. We do not collect location data,
  contacts, or any sensitive personal information.</p>

  <h2>How We Use Your Information</h2>
  <p>Your email is used to authenticate your account and send transactional
  messages (e.g. subscription receipts). Watchlist data is used solely to
  fetch market data and generate AI summaries for the stocks you follow.</p>

  <h2>Third-Party Services</h2>
  <ul>
    <li><strong>Clerk</strong> — authentication (clerk.com/privacy)</li>
    <li><strong>Stripe / Apple / Google</strong> — payment processing</li>
    <li><strong>OpenAI</strong> — AI-generated news summaries</li>
    <li><strong>Yahoo Finance</strong> — market data</li>
  </ul>

  <h2>Data Retention</h2>
  <p>Your data is retained while your account is active. You may request
  deletion by emailing [SUPPORT_EMAIL].</p>

  <h2>Contact</h2>
  <p>[SUPPORT_EMAIL]</p>
</body>
</html>`);
});

export default router;
