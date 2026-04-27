// Run with Node 22+:
//   node --test --experimental-strip-types artifacts/api-server/src/lib/costBasis.test.ts

import test from "node:test";
import assert from "node:assert/strict";
import { computeCostBasis, type LotInput, type SaleEvent } from "./costBasis";

function approx(a: number, b: number, eps = 1e-9): boolean {
  return Math.abs(a - b) < eps;
}

test("empty lots → all zeros, default FIFO", () => {
  const r = computeCostBasis({ lots: [] });
  assert.equal(r.realizedPnl, 0);
  assert.equal(r.unrealizedPnl, 0);
  assert.equal(r.totalCostBasis, 0);
  assert.equal(r.method, "FIFO");
});

test("no sales, no currentPrice → unrealized=0, totalCostBasis = sum(qty*cost)", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 5, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const r = computeCostBasis({ lots });
  assert.equal(r.realizedPnl, 0);
  assert.equal(r.unrealizedPnl, 0);
  assert.equal(r.totalCostBasis, 10 * 100 + 5 * 200); // 2000
});

test("no sales, with currentPrice → unrealized = (price - wAvgCost) * openQty", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const r = computeCostBasis({ lots, currentPrice: 250 });
  // wAvg = 150, openQty = 20, unrealized = (250-150)*20 = 2000
  assert.equal(r.unrealizedPnl, 2000);
  assert.equal(r.totalCostBasis, 3000);
  assert.equal(r.realizedPnl, 0);
});

test("FIFO partial sale within first lot", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [
    { qty: 4, sale_price: 150, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "FIFO" });
  // Consume 4 from lot1 @ 100: realized = (150-100)*4 = 200
  assert.equal(r.realizedPnl, 200);
  // Remaining: 6@100 + 10@200 = 600 + 2000 = 2600
  assert.equal(r.totalCostBasis, 2600);
});

test("FIFO sale crossing lot boundary", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [
    { qty: 12, sale_price: 250, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "FIFO" });
  // 10 from lot1 @100: (250-100)*10 = 1500
  //  2 from lot2 @200: (250-200)*2  =  100
  // Total realized = 1600
  assert.equal(r.realizedPnl, 1600);
  // Remaining: 8 @ 200 = 1600
  assert.equal(r.totalCostBasis, 1600);
});

test("LIFO consumes newer lot first", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [
    { qty: 4, sale_price: 250, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "LIFO" });
  // 4 from newer lot @200: (250-200)*4 = 200
  assert.equal(r.realizedPnl, 200);
  // Remaining: 10@100 + 6@200 = 1000 + 1200 = 2200
  assert.equal(r.totalCostBasis, 2200);
});

test("average uses weighted-avg cost across lots", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [
    { qty: 5, sale_price: 250, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "average" });
  // wAvg = (10*100 + 10*200) / 20 = 150
  // realized = (250-150)*5 = 500
  assert.equal(r.realizedPnl, 500);
  assert.equal(r.method, "average");
  // remaining 15 shares at avg 150 = 2250
  assert.equal(r.totalCostBasis, 2250);
});

test("average + currentPrice gives unrealized off remaining shares", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [{ qty: 5, sale_price: 250, sold_at: "2024-03-01" }];
  const r = computeCostBasis({ lots, sales, method: "average", currentPrice: 300 });
  // After sale: 15 shares at avg 150
  // unrealized = (300-150)*15 = 2250
  assert.ok(approx(r.unrealizedPnl, 2250));
});

test("sale exceeding total shares clamps at available qty", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
  ];
  const sales: SaleEvent[] = [
    { qty: 999, sale_price: 150, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "FIFO" });
  // Only 10 shares available: realized = (150-100)*10 = 500
  assert.equal(r.realizedPnl, 500);
  assert.equal(r.totalCostBasis, 0);
});

test("multiple chronological sales, FIFO", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [
    // Out-of-order in input — engine must sort by sold_at
    { qty: 6, sale_price: 250, sold_at: "2024-04-01" },
    { qty: 5, sale_price: 150, sold_at: "2024-03-01" },
  ];
  const r = computeCostBasis({ lots, sales, method: "FIFO" });
  // Mar: 5 from lot1 @100 → (150-100)*5 = 250
  // Apr: 5 from lot1 @100 + 1 from lot2 @200 → (250-100)*5 + (250-200)*1 = 750 + 50 = 800
  // Total realized = 1050
  assert.equal(r.realizedPnl, 1050);
  // Remaining: 9 @ 200 = 1800
  assert.equal(r.totalCostBasis, 1800);
});

test("default method is FIFO when not specified", () => {
  const lots: LotInput[] = [
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const sales: SaleEvent[] = [{ qty: 4, sale_price: 150, sold_at: "2024-03-01" }];
  const r = computeCostBasis({ lots, sales });
  assert.equal(r.method, "FIFO");
  // Same FIFO numbers as above: realized = (150-100)*4 = 200
  assert.equal(r.realizedPnl, 200);
});

test("unsorted input lots are sorted by purchased_at for FIFO", () => {
  const lots: LotInput[] = [
    // Newer first in input — engine must reorder
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
    { qty: 10, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
  ];
  const sales: SaleEvent[] = [{ qty: 4, sale_price: 150, sold_at: "2024-03-01" }];
  const r = computeCostBasis({ lots, sales, method: "FIFO" });
  // FIFO must still consume the @100 lot first
  assert.equal(r.realizedPnl, 200);
});

test("zero/negative qty lots are filtered out", () => {
  const lots: LotInput[] = [
    { qty: 0, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: -5, cost_per_share: 100, currency: "USD", purchased_at: "2024-01-01" },
    { qty: 10, cost_per_share: 200, currency: "USD", purchased_at: "2024-02-01" },
  ];
  const r = computeCostBasis({ lots, currentPrice: 250 });
  assert.equal(r.totalCostBasis, 2000);
  assert.equal(r.unrealizedPnl, (250 - 200) * 10);
});
