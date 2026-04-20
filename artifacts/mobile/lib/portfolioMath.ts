// Risk metrics for portfolios — pure functions over price series.
//
// Everything here expects daily closing prices (the 1Y series already
// fetched by useMiniCharts). Results are annualised with 252 trading days
// unless noted.

const TRADING_DAYS_PER_YEAR = 252;
const RISK_FREE_RATE_ANNUAL = 0.04; // 4% — close enough to the current 3-month T-bill for MVP

/** Simple day-over-day returns from a price series. Drops non-finite entries. */
export function dailyReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const prev = prices[i - 1];
    const cur = prices[i];
    if (prev > 0 && Number.isFinite(prev) && Number.isFinite(cur)) {
      out.push((cur - prev) / prev);
    }
  }
  return out;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stddev(xs: number[], m?: number): number {
  if (xs.length < 2) return 0;
  const mu = m ?? mean(xs);
  let sq = 0;
  for (const x of xs) sq += (x - mu) * (x - mu);
  return Math.sqrt(sq / (xs.length - 1));
}

/** Annualised volatility (stdev of daily returns × √252) over the last `window` days. */
export function volatility(prices: number[], window: number): number {
  const tail = prices.slice(Math.max(0, prices.length - window - 1));
  const rets = dailyReturns(tail);
  if (rets.length < 2) return 0;
  return stddev(rets) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Peak-to-trough drawdown over the series, returned as a negative decimal (e.g. -0.28). */
export function maxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  let peak = prices[0];
  let worst = 0;
  for (const p of prices) {
    if (!Number.isFinite(p) || p <= 0) continue;
    if (p > peak) peak = p;
    const dd = (p - peak) / peak;
    if (dd < worst) worst = dd;
  }
  return worst;
}

/** Sharpe ratio — (annual return − risk-free) / annualised vol, from daily returns. */
export function sharpeRatio(prices: number[]): number {
  const rets = dailyReturns(prices);
  if (rets.length < 5) return 0;
  const mu = mean(rets) * TRADING_DAYS_PER_YEAR;
  const vol = stddev(rets) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (vol === 0) return 0;
  return (mu - RISK_FREE_RATE_ANNUAL) / vol;
}

/** Sortino ratio — like Sharpe but only counts downside deviation. */
export function sortinoRatio(prices: number[]): number {
  const rets = dailyReturns(prices);
  if (rets.length < 5) return 0;
  const mu = mean(rets) * TRADING_DAYS_PER_YEAR;
  const downside = rets.filter((r) => r < 0);
  if (!downside.length) return mu > RISK_FREE_RATE_ANNUAL ? Infinity : 0;
  const downVol = stddev(downside) * Math.sqrt(TRADING_DAYS_PER_YEAR);
  if (downVol === 0) return 0;
  return (mu - RISK_FREE_RATE_ANNUAL) / downVol;
}

/**
 * Beta vs a benchmark. cov(asset, bench) / var(bench), computed from aligned
 * daily returns. Returns 1 if the series don't overlap meaningfully.
 */
export function beta(assetPrices: number[], benchPrices: number[]): number {
  const n = Math.min(assetPrices.length, benchPrices.length);
  if (n < 5) return 1;
  const a = assetPrices.slice(assetPrices.length - n);
  const b = benchPrices.slice(benchPrices.length - n);
  const ra = dailyReturns(a);
  const rb = dailyReturns(b);
  const m = Math.min(ra.length, rb.length);
  if (m < 5) return 1;
  const ra2 = ra.slice(ra.length - m);
  const rb2 = rb.slice(rb.length - m);
  const muA = mean(ra2);
  const muB = mean(rb2);
  let cov = 0;
  let varB = 0;
  for (let i = 0; i < m; i++) {
    cov += (ra2[i] - muA) * (rb2[i] - muB);
    varB += (rb2[i] - muB) * (rb2[i] - muB);
  }
  if (varB === 0) return 1;
  return cov / varB;
}

/** Weighted sum of asset series. Weights must be normalised to sum to 1. */
export function weightedSeries(series: number[][], weights: number[]): number[] {
  if (!series.length) return [];
  const n = Math.min(...series.map((s) => s.length));
  if (n === 0) return [];
  const out = new Array<number>(n).fill(0);
  for (let i = 0; i < series.length; i++) {
    const tail = series[i].slice(series[i].length - n);
    const w = weights[i] ?? 0;
    for (let j = 0; j < n; j++) {
      out[j] += tail[j] * w;
    }
  }
  return out;
}

/** Total return of a series, as a decimal (e.g. 0.12 for +12%). */
export function totalReturn(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (!(first > 0)) return 0;
  return (last - first) / first;
}

/** Tracking error — annualised stdev of (portfolio return − benchmark return). */
export function trackingError(portfolio: number[], benchmark: number[]): number {
  const n = Math.min(portfolio.length, benchmark.length);
  if (n < 5) return 0;
  const rp = dailyReturns(portfolio.slice(portfolio.length - n));
  const rb = dailyReturns(benchmark.slice(benchmark.length - n));
  const m = Math.min(rp.length, rb.length);
  if (m < 5) return 0;
  const diffs: number[] = [];
  for (let i = 0; i < m; i++) diffs.push(rp[rp.length - m + i] - rb[rb.length - m + i]);
  return stddev(diffs) * Math.sqrt(TRADING_DAYS_PER_YEAR);
}

/** Alpha vs a benchmark — simple Jensen's alpha, annualised. */
export function alpha(portfolio: number[], benchmark: number[]): number {
  const n = Math.min(portfolio.length, benchmark.length);
  if (n < 5) return 0;
  const p = portfolio.slice(portfolio.length - n);
  const b = benchmark.slice(benchmark.length - n);
  const rp = dailyReturns(p);
  const rb = dailyReturns(b);
  const m = Math.min(rp.length, rb.length);
  if (m < 5) return 0;
  const muP = mean(rp.slice(rp.length - m)) * TRADING_DAYS_PER_YEAR;
  const muB = mean(rb.slice(rb.length - m)) * TRADING_DAYS_PER_YEAR;
  const bet = beta(p, b);
  return muP - (RISK_FREE_RATE_ANNUAL + bet * (muB - RISK_FREE_RATE_ANNUAL));
}
