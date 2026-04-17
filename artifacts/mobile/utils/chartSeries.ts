export interface ChartPoint {
  timestamp: number;
  price: number;
  isAnchor: boolean;
}

export interface ChartSeries {
  series: ChartPoint[];
  prices: number[];
  timestamps: number[];
  hasAnchor: boolean;
}

// Prepends a synthetic "opening" anchor point so the first plotted value is
// the close of the period immediately before the visible window. For 1D that
// is yesterday's regular-session close; for longer ranges it is the close of
// the trading day before the window starts (what Yahoo returns as
// meta.chartPreviousClose). Keeps the chart line continuous with the prior
// period and makes the visual delta match the header ±% number.
export function buildChartSeries(
  prices: number[],
  timestamps: number[],
  previousClose?: number | null,
): ChartSeries {
  const safePrices = Array.isArray(prices) ? prices : [];
  const safeTimestamps = Array.isArray(timestamps) ? timestamps : [];

  const canAnchor =
    previousClose != null &&
    Number.isFinite(previousClose) &&
    safePrices.length > 0 &&
    safeTimestamps.length > 0;

  if (!canAnchor) {
    const series = safePrices.map((price, i) => ({
      price,
      timestamp: safeTimestamps[i] ?? 0,
      isAnchor: false,
    }));
    return {
      series,
      prices: [...safePrices],
      timestamps: [...safeTimestamps],
      hasAnchor: false,
    };
  }

  const firstTs = safeTimestamps[0];
  const barMs =
    safeTimestamps.length > 1
      ? Math.max(1, safeTimestamps[1] - safeTimestamps[0])
      : 60_000;
  const anchorTs = firstTs - barMs;

  const anchor: ChartPoint = {
    timestamp: anchorTs,
    price: previousClose as number,
    isAnchor: true,
  };
  const rest: ChartPoint[] = safePrices.map((price, i) => ({
    price,
    timestamp: safeTimestamps[i] ?? firstTs,
    isAnchor: false,
  }));
  const series = [anchor, ...rest];

  return {
    series,
    prices: series.map((p) => p.price),
    timestamps: series.map((p) => p.timestamp),
    hasAnchor: true,
  };
}
