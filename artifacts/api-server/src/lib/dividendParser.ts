// Pure parser for Yahoo's quoteSummary response. Handles the three modules
// the dividendWorker requests in a single call: calendarEvents (ex/pay
// dates), summaryDetail (last dividend amount + currency), summaryProfile
// (country). Kept dependency-free so unit tests can exercise it without
// touching DB / network / logger imports.

export interface ParsedDividendEvent {
  exDate: string; // YYYY-MM-DD UTC
  payDate: string | null;
  amount: number | null;
  currency: string | null;
}

export interface ParsedTickerMeta {
  country: string | null;
  events: ParsedDividendEvent[];
}

// Yahoo returns timestamps as either { raw, fmt } objects or bare numbers
// depending on the module. Accept both, reject zero/negative.
function tsValue(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) && raw > 0 ? raw : null;
  if (typeof raw === "object" && "raw" in raw) {
    const n = Number((raw as any).raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

function numValue(raw: any): number | null {
  if (raw == null) return null;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "object" && "raw" in raw) {
    const n = Number((raw as any).raw);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Pull dividend ex/pay dates from calendarEvents, the most recent amount
// from summaryDetail, and country from summaryProfile. Emits zero or one
// upcoming event per ticker — Yahoo's calendarEvents only ever lists the
// next forecast.
export function parseDividendsAndMeta(quoteSummaryResult: any): ParsedTickerMeta {
  const calendar = quoteSummaryResult?.calendarEvents ?? {};
  const detail = quoteSummaryResult?.summaryDetail ?? {};
  const profile = quoteSummaryResult?.summaryProfile ?? {};

  const exTs = tsValue(calendar.exDividendDate);
  const payTs = tsValue(calendar.dividendDate);
  const exDate = exTs != null ? new Date(exTs * 1000).toISOString().slice(0, 10) : null;
  const payDate = payTs != null ? new Date(payTs * 1000).toISOString().slice(0, 10) : null;

  const amount = numValue(detail.lastDividendValue);
  const currency =
    typeof detail.currency === "string" ? detail.currency.toUpperCase() : null;

  const country =
    typeof profile.country === "string" && profile.country.trim()
      ? profile.country.trim()
      : null;

  const events: ParsedDividendEvent[] = exDate
    ? [{ exDate, payDate, amount, currency }]
    : [];

  return { country, events };
}
