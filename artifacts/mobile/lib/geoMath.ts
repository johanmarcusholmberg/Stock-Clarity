// Geo / currency exposure — pure functions over holdings + live quotes.
//
// Inputs come from existing places: HoldingsContext supplies holdings (with
// country denormalised onto each row by the server's dividendWorker), and
// stockApi.getQuotes supplies the live quote map (currency + price). The
// caller passes both in; this module never fetches.
//
// Output is two records keyed by country / currency, each value a percentage
// of total portfolio value (0-100). Holdings whose country isn't yet known
// (worker hasn't ticked since the row was added) bucket into "Unknown" so
// the UI can show coverage explicitly rather than dropping rows silently.

interface ExposureHolding {
  ticker: string;
  currency: string;
  country: string | null;
  lots: { qty: string }[];
}

interface ExposureQuote {
  regularMarketPrice: number;
  currency?: string;
}

export interface ExposureBreakdown {
  byCountry: Record<string, number>;
  byCurrency: Record<string, number>;
}

const UNKNOWN_BUCKET = "Unknown";

function totalQty(lots: { qty: string }[]): number {
  let sum = 0;
  for (const l of lots) {
    const n = Number(l.qty);
    if (Number.isFinite(n)) sum += n;
  }
  return sum;
}

// Pie / bar chart data. Quote currency is treated as authoritative when
// present (matches portfolioSnapshotWorker — if the user mistyped currency on
// add we trust Yahoo). Empty input or no quoted holdings → empty maps.
export function computeExposure(
  holdings: ExposureHolding[],
  quotes: Map<string, ExposureQuote>,
): ExposureBreakdown {
  const byCountry: Record<string, number> = {};
  const byCurrency: Record<string, number> = {};
  let total = 0;

  for (const h of holdings) {
    const quote = quotes.get(h.ticker.toUpperCase());
    if (!quote || !Number.isFinite(quote.regularMarketPrice)) continue;
    const qty = totalQty(h.lots);
    if (qty <= 0) continue;
    const value = qty * quote.regularMarketPrice;
    if (!Number.isFinite(value) || value <= 0) continue;

    const country = h.country?.trim() || UNKNOWN_BUCKET;
    const currency = (quote.currency || h.currency || "USD").toUpperCase();

    byCountry[country] = (byCountry[country] ?? 0) + value;
    byCurrency[currency] = (byCurrency[currency] ?? 0) + value;
    total += value;
  }

  if (total <= 0) return { byCountry: {}, byCurrency: {} };

  for (const k of Object.keys(byCountry)) byCountry[k] = (byCountry[k] / total) * 100;
  for (const k of Object.keys(byCurrency)) byCurrency[k] = (byCurrency[k] / total) * 100;

  return { byCountry, byCurrency };
}
