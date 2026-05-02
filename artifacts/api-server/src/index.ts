// Sentry must initialize before ANY other import so its OpenTelemetry hooks
// can wrap http/express/etc. as they're loaded. See ./instrument.ts.
import "./instrument";

import app from "./app";
import { logger } from "./lib/logger";
import { startAlertEvaluator } from "./lib/alertEvaluator";
import { startNewsPreloadWorker } from "./lib/newsPreloadWorker";
import { startGrantExpiryWorker } from "./lib/grantExpiryWorker";
import { startGrantExpiryWarningWorker } from "./lib/grantExpiryWarningWorker";
import { startEarningsCalendarWorker } from "./lib/earningsCalendarWorker";
import { startNotifyEvaluator } from "./lib/notifyEvaluator";
import { startPortfolioSnapshotWorker } from "./lib/portfolioSnapshotWorker";
import { startDividendWorker } from "./lib/dividendWorker";
import { startReportsWorker } from "./lib/reportsWorker";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

app.listen(port, async (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }
  logger.info({ port }, "Server listening");

  // Start the alerts evaluator worker (non-blocking). Skips silently if the
  // DB isn't available — schema creation just fails and the evaluator loop
  // logs warnings on each tick.
  startAlertEvaluator().catch((e) => logger.warn(e, "Alert evaluator start error"));

  // Start the news pre-load worker. No-ops unless NEWS_PRELOAD_ENABLED=true.
  startNewsPreloadWorker().catch((e) => logger.warn(e, "News preload worker start error"));

  // Start the admin-grant expiry worker. First tick runs immediately to
  // catch grants that expired during downtime; if the DB isn't ready yet
  // the worker retries every 30s until one tick succeeds, then settles into
  // the hourly cadence.
  startGrantExpiryWorker().catch((e) => logger.warn(e, "Grant expiry worker start error"));

  // Start the 3-day expiry WARNING worker (daily). Queues a user_events
  // 'grant_expiry_warned' row per grant nearing expiry; the actual email
  // send lands when the shared email worker does (matches alertEvaluator
  // email:queued pattern).
  startGrantExpiryWarningWorker().catch((e) =>
    logger.warn(e, "Grant expiry warning worker start error"),
  );

  // Phase 3.3 PR 1 — earnings calendar refresh + notify evaluator skeleton.
  // Both no-op unless NOTIFY_ENABLED=true. The evaluator is heartbeat-only
  // until PR 2 fills in the news fan-out and PR 3 the earnings windows.
  startEarningsCalendarWorker().catch((e) =>
    logger.warn(e, "Earnings calendar worker start error"),
  );
  startNotifyEvaluator().catch((e) => logger.warn(e, "Notify evaluator start error"));

  // Phase 3.4 PR 2 — daily holdings → portfolio_snapshots writer. No-op
  // unless HOLDINGS_ENABLED=true. Aligned to 06:30 UTC after the earnings
  // calendar worker so quote fan-outs don't pile up at the same moment.
  startPortfolioSnapshotWorker().catch((e) =>
    logger.warn(e, "Portfolio snapshot worker start error"),
  );

  // Phase 3.4 PR 3 — daily Yahoo metadata refresh for held tickers. Pulls
  // upcoming dividend events and country into dividend_events / holdings.
  // Same HOLDINGS_ENABLED gate as the snapshot worker.
  startDividendWorker().catch((e) => logger.warn(e, "Dividend worker start error"));

  // Reports notification worker. Polls SEC EDGAR per subscribed symbol and
  // fans out push/email when a new 10-K / 10-Q drops. Gated on
  // REPORTS_NOTIFY_ENABLED=true so it stays dark until explicitly turned on.
  startReportsWorker().catch((e) => logger.warn(e, "Reports worker start error"));
});
