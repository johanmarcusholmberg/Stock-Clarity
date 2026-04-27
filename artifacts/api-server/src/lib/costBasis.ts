// Pure cost-basis math. No DB, no FX. Callers normalise lot/sale/price values
// to a single numeraire (e.g. USD) before passing in — this mirrors how the
// holdings CSV export applies fxToUsd outside the math, keeping this module
// trivially testable.
//
// Sales support is already wired in: the engine consumes a sales[] array and
// emits realizedPnl. There is no UI yet for *recording* a sale, and no
// sale_events table; for now callers pass sales: [] and the engine returns
// realizedPnl: 0. The shape is in place so the YTD/lifetime split lights up
// the moment sale storage lands in a future PR.

export type CostBasisMethod = "FIFO" | "LIFO" | "average";

export interface LotInput {
  qty: number;
  cost_per_share: number;
  currency: string;
  purchased_at: string; // YYYY-MM-DD or full ISO; only relative ordering matters
}

export interface SaleEvent {
  qty: number;
  sale_price: number;
  sold_at: string;
  currency?: string;
}

export interface CostBasisInput {
  lots: LotInput[];
  sales?: SaleEvent[];
  /** Current price per share in the same numeraire as lot costs. Drives
   *  unrealizedPnl. Omit (or null) if the caller has no quote — unrealized
   *  then falls back to 0. */
  currentPrice?: number | null;
  method?: CostBasisMethod;
}

export interface CostBasisResult {
  realizedPnl: number;
  unrealizedPnl: number;
  /** Remaining (open) cost basis after sales — sum of open_qty × cost_per_share. */
  totalCostBasis: number;
  method: CostBasisMethod;
}

interface OpenLot {
  qty: number;
  cost_per_share: number;
  purchased_at: string;
}

function sortLots(lots: LotInput[], method: CostBasisMethod): OpenLot[] {
  const open: OpenLot[] = lots
    .filter((l) => Number.isFinite(l.qty) && l.qty > 0)
    .map((l) => ({
      qty: l.qty,
      cost_per_share: l.cost_per_share,
      purchased_at: l.purchased_at,
    }));
  if (method === "FIFO") {
    open.sort((a, b) => a.purchased_at.localeCompare(b.purchased_at));
  } else if (method === "LIFO") {
    open.sort((a, b) => b.purchased_at.localeCompare(a.purchased_at));
  }
  // average: order doesn't matter; we collapse to a single weighted-avg lot.
  return open;
}

function applySalesFifoLifo(open: OpenLot[], sales: SaleEvent[]): number {
  // Sales applied in chronological order. Each sale walks the open lot list
  // (already FIFO- or LIFO-sorted), peeling off qty until the sale is filled
  // or no lots remain. A sale that exceeds remaining shares short-circuits at
  // the available qty — we don't model short positions.
  const sorted = [...sales].sort((a, b) => a.sold_at.localeCompare(b.sold_at));
  let realized = 0;
  for (const sale of sorted) {
    let remaining = sale.qty;
    if (!Number.isFinite(remaining) || remaining <= 0) continue;
    for (const lot of open) {
      if (remaining <= 0) break;
      if (lot.qty <= 0) continue;
      const matched = Math.min(lot.qty, remaining);
      realized += (sale.sale_price - lot.cost_per_share) * matched;
      lot.qty -= matched;
      remaining -= matched;
    }
  }
  return realized;
}

function applySalesAverage(
  open: OpenLot[],
  sales: SaleEvent[],
): { realized: number; avgCost: number; remainingQty: number } {
  // Moving weighted-average: every sale removes shares at the *current* avg
  // cost. Buys would normally re-weight the average, but lots here are all
  // pre-existing (no interleaved buys), so the avg stays constant across
  // sales and simplifies to a single weighted cost computed up front.
  let totalQty = 0;
  let totalCost = 0;
  for (const lot of open) {
    totalQty += lot.qty;
    totalCost += lot.qty * lot.cost_per_share;
  }
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;

  const sorted = [...sales].sort((a, b) => a.sold_at.localeCompare(b.sold_at));
  let realized = 0;
  let remainingQty = totalQty;
  for (const sale of sorted) {
    if (!Number.isFinite(sale.qty) || sale.qty <= 0) continue;
    const matched = Math.min(sale.qty, remainingQty);
    if (matched <= 0) continue;
    realized += (sale.sale_price - avgCost) * matched;
    remainingQty -= matched;
  }
  return { realized, avgCost, remainingQty };
}

export function computeCostBasis(input: CostBasisInput): CostBasisResult {
  const method: CostBasisMethod = input.method ?? "FIFO";
  const sales = input.sales ?? [];
  const currentPrice =
    typeof input.currentPrice === "number" && Number.isFinite(input.currentPrice)
      ? input.currentPrice
      : null;

  if (!input.lots || input.lots.length === 0) {
    return { realizedPnl: 0, unrealizedPnl: 0, totalCostBasis: 0, method };
  }

  if (method === "average") {
    const { realized, avgCost, remainingQty } = applySalesAverage(
      sortLots(input.lots, method),
      sales,
    );
    const totalCostBasis = remainingQty * avgCost;
    const unrealizedPnl =
      currentPrice != null && remainingQty > 0
        ? (currentPrice - avgCost) * remainingQty
        : 0;
    return { realizedPnl: realized, unrealizedPnl, totalCostBasis, method };
  }

  const open = sortLots(input.lots, method);
  const realized = applySalesFifoLifo(open, sales);

  let totalCostBasis = 0;
  let openQty = 0;
  for (const lot of open) {
    if (lot.qty <= 0) continue;
    totalCostBasis += lot.qty * lot.cost_per_share;
    openQty += lot.qty;
  }
  const weightedAvgOpenCost = openQty > 0 ? totalCostBasis / openQty : 0;
  const unrealizedPnl =
    currentPrice != null && openQty > 0
      ? (currentPrice - weightedAvgOpenCost) * openQty
      : 0;

  return { realizedPnl: realized, unrealizedPnl, totalCostBasis, method };
}
