// Pure heuristic impact scorer for news_cache rows.
//
// Inputs are intentionally small and synchronous: no DB, no network. The
// worker scores rows in bulk; the /events route can also score newly-ingested
// rows from the cold-cache fallback path.
//
// Score is in [0, 100]. Composition:
//   base         = source weight    (Yahoo/Google RSS)
//   publisher    = publisher weight (Reuters/Bloomberg/... vs. long tail)
//   keywords     = title signal     (earnings, M&A, guidance, lawsuit, ...)
//   recency      = time-decay bonus (last 24h boosted, then fades over 48h)
//
// The mix errs on the side of stable, explainable ranking rather than
// precision. Badge quality is evaluated in PR 4; if it lags, we upgrade to a
// batched GPT pass (noted as open question in the design doc).
//
// Keep this file pure — no imports, no env access. Unit tests in
// newsImpact.test.ts rely on that.
export type NewsSource = "yahoo" | "google_rss";

export interface ImpactInput {
  title: string;
  publisher: string;
  source: NewsSource;
  publishedAtMs: number;
}

// Publisher reputation weights (exact name match, case-insensitive). Generic
// wire services and the majors score highest. Everything else defaults to the
// long-tail weight.
const PUBLISHER_WEIGHTS: Array<[RegExp, number]> = [
  [/\breuters\b/i, 18],
  [/\bbloomberg\b/i, 18],
  [/\bthe wall street journal\b|\bwsj\b/i, 18],
  [/\bfinancial times\b|\bft\.com\b/i, 16],
  [/\bassociated press\b|\bap news\b/i, 15],
  [/\bthe new york times\b|\bnyt\b/i, 14],
  [/\bcnbc\b/i, 13],
  [/\bbarron(?:'|)s\b/i, 13],
  [/\bmarketwatch\b/i, 11],
  [/\bforbes\b/i, 10],
  [/\bthe motley fool\b|\bfool\.com\b/i, 8],
  [/\bseeking alpha\b/i, 8],
  [/\byahoo finance\b/i, 8],
  [/\binvestor(?:'|)s business daily\b|\bibd\b/i, 10],
  [/\binvesting\.com\b/i, 7],
  [/\bbenzinga\b/i, 7],
];

const DEFAULT_PUBLISHER_WEIGHT = 4;

// Earnings keyword regex. Exported so the notify evaluator can reuse it for
// the earnings_after gate (only fire the after-market alert if a high-impact
// news headline mentioning earnings has landed since the open).
export const EARNINGS_KEYWORDS_RE =
  /\b(earnings|eps|revenue|beats?|miss(?:es|ed)?|guidance|outlook|forecast|results)\b/i;

// Keyword buckets. First match in each bucket counts once — stacking three
// lawsuit synonyms in the same title shouldn't multiply the bucket's weight.
const KEYWORD_BUCKETS: Array<{ re: RegExp; weight: number }> = [
  // Earnings and guidance — the single most market-moving category.
  { re: EARNINGS_KEYWORDS_RE, weight: 22 },
  // M&A / corporate actions.
  { re: /\b(acquisition|acquires?|merger|merge(?:s|d)?|buyout|takeover|divestiture|spin[-\s]?off)\b/i, weight: 22 },
  // Analyst rating changes.
  { re: /\b(upgrades?|downgrades?|price target|overweight|underweight|buy rating|sell rating|initiates coverage)\b/i, weight: 18 },
  // Regulatory / legal.
  { re: /\b(sec|doj|ftc|antitrust|lawsuit|sued|investigation|probe|subpoena|fine|penalty)\b/i, weight: 18 },
  // Healthcare-specific but dominant when present.
  { re: /\b(fda|approval|rejected|clinical trial|phase\s?(?:i{1,3}|[123]))\b/i, weight: 18 },
  // Leadership changes.
  { re: /\b(ceo|cfo|chairman|president|steps down|resigns?|appointed|named chief)\b/i, weight: 12 },
  // Capital structure.
  { re: /\b(dividend|buyback|share repurchase|split|offering|issuance|debt)\b/i, weight: 10 },
  // Product / launch / partnership — softer signal.
  { re: /\b(launch(?:es|ed)?|unveils?|partnership|contract|deal signed|agreement)\b/i, weight: 6 },
  // Price-move headlines. These often piggyback on a real driver so we
  // include a small bump but don't overweight.
  { re: /\b(surges?|plunges?|tumbles?|soars?|rallies|rallys|jumps?|slumps?|slides?|spikes?)\b/i, weight: 4 },
];

// Source weight. Yahoo's own feed is curated; Google News RSS is noisier.
const SOURCE_WEIGHT: Record<NewsSource, number> = {
  yahoo: 6,
  google_rss: 3,
};

function recencyBonus(publishedAtMs: number, nowMs: number): number {
  const ageHr = Math.max(0, (nowMs - publishedAtMs) / (60 * 60 * 1000));
  if (ageHr <= 6) return 20;
  if (ageHr <= 24) return 12;
  if (ageHr <= 48) return 6;
  return 0;
}

function publisherWeight(publisher: string): number {
  const p = publisher || "";
  for (const [re, weight] of PUBLISHER_WEIGHTS) {
    if (re.test(p)) return weight;
  }
  return DEFAULT_PUBLISHER_WEIGHT;
}

function keywordWeight(title: string): number {
  const t = title || "";
  let total = 0;
  for (const bucket of KEYWORD_BUCKETS) {
    if (bucket.re.test(t)) total += bucket.weight;
  }
  return total;
}

export function scoreImpact(input: ImpactInput, nowMs: number = Date.now()): number {
  const base = SOURCE_WEIGHT[input.source] ?? 0;
  const pub = publisherWeight(input.publisher);
  const kw = keywordWeight(input.title);
  const rec = recencyBonus(input.publishedAtMs, nowMs);
  const raw = base + pub + kw + rec;
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  return Math.round(raw);
}
