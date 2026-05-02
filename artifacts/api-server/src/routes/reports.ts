import { Router } from "express";
import {
  getCIKFromTicker,
  getFilings,
  getFilingText,
  summarizeReport,
} from "../lib/reports";

const router = Router();

// Keyed by `${ticker}:${accession}` — prevents redundant EDGAR + Anthropic calls
// for the same filing within a server session.
const summaryResponseCache = new Map<string, object>();

router.get("/", async (req, res) => {
  const ticker = (req.query.ticker as string) ?? "";
  const action = (req.query.action as string) ?? "filings";

  if (!ticker) {
    res.status(400).json({ error: "Missing required query parameter: ticker" });
    return;
  }

  try {
    if (action === "filings") {
      const cik = await getCIKFromTicker(ticker);
      const filings = await getFilings(cik);
      res.json({ ticker, cik, filings });
      return;
    }

    if (action === "text") {
      const accession = (req.query.accession as string) ?? "";
      if (!accession) {
        res.status(400).json({ error: "Missing required query parameter: accession" });
        return;
      }
      const cik = await getCIKFromTicker(ticker);
      const rawText = await getFilingText(cik, accession);
      res.json({ ticker, accession, rawText });
      return;
    }

    if (action === "summary") {
      const accession = (req.query.accession as string) ?? "";
      if (!accession) {
        res.status(400).json({ error: "Missing required query parameter: accession" });
        return;
      }
      const cacheKey = `${ticker}:${accession}`;
      const cached = summaryResponseCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }
      const cik = await getCIKFromTicker(ticker);
      const filings = await getFilings(cik);
      const filing = filings.find((f) => f.accessionNumber === accession);
      if (!filing) {
        res.status(404).json({ error: `Filing ${accession} not found for ${ticker}` });
        return;
      }
      const rawText = await getFilingText(cik, accession);
      const summary = await summarizeReport(rawText, ticker, filing.type, accession);
      const response = { ticker, accession, type: filing.type, filing, summary };
      summaryResponseCache.set(cacheKey, response);
      res.json(response);
      return;
    }

    res.status(400).json({ error: `Unknown action: ${action}` });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[reports]", message);
    const status = /Unknown ticker/i.test(message)
      ? 404
      : /ANTHROPIC_API_KEY/i.test(message)
        ? 503
        : 500;
    res.status(status).json({ error: message });
  }
});

export default router;
