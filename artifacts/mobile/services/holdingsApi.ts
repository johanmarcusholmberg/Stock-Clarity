import { getApiBase } from "../lib/apiBase";
// Client for the /api/holdings endpoints. Mirrors notifyApi.ts:
// snake_case stays on the wire; rows come straight out of pg.

const API_BASE =
  getApiBase();

export interface Lot {
  id: string;
  holding_id: string;
  qty: string;
  cost_per_share: string;
  purchased_at: string;
  currency: string;
  created_at: string;
}

export interface HoldingRow {
  id: string;
  user_id: string;
  ticker: string;
  currency: string;
  /** Denormalised from Yahoo summaryProfile by the dividendWorker daily tick.
   *  Null until the worker first sees the ticker — the Exposure card buckets
   *  null entries into "Unknown" so coverage is explicit. */
  country: string | null;
  created_at: string;
}

export interface Holding extends HoldingRow {
  lots: Lot[];
}

export interface DividendEvent {
  ticker: string;
  ex_date: string;
  pay_date: string | null;
  amount: string | null; // numeric → string from pg
  currency: string | null;
}

export interface DividendsResponse {
  dividends: DividendEvent[];
}

export interface HoldingsListResponse {
  holdings: Holding[];
}

export interface HoldingsStatusResponse {
  enabled: boolean;
}

export type ApiError = { error: string; limit?: number };

export async function getHoldingsStatus(): Promise<HoldingsStatusResponse> {
  try {
    const res = await fetch(`${API_BASE}/holdings/status`);
    if (!res.ok) return { enabled: false };
    return (await res.json()) as HoldingsStatusResponse;
  } catch {
    return { enabled: false };
  }
}

export async function listHoldings(userId: string): Promise<HoldingsListResponse> {
  try {
    const res = await fetch(`${API_BASE}/holdings/${encodeURIComponent(userId)}`);
    if (!res.ok) return { holdings: [] };
    return (await res.json()) as HoldingsListResponse;
  } catch {
    return { holdings: [] };
  }
}

export interface AddHoldingInput {
  ticker: string;
  qty: number;
  cost_per_share: number;
  purchased_at: string;
  currency?: string;
}

export interface AddHoldingResponse {
  holding: HoldingRow;
  lot: Lot;
}

export async function addHolding(
  userId: string,
  input: AddHoldingInput,
): Promise<AddHoldingResponse | ApiError> {
  const res = await fetch(`${API_BASE}/holdings/${encodeURIComponent(userId)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { error: data?.error ?? `HTTP ${res.status}`, limit: data?.limit };
  }
  return data as AddHoldingResponse;
}

export interface AddLotInput {
  qty: number;
  cost_per_share: number;
  purchased_at: string;
  currency?: string;
}

export async function addLot(
  userId: string,
  holdingId: string,
  input: AddLotInput,
): Promise<{ lot: Lot } | ApiError> {
  const res = await fetch(
    `${API_BASE}/holdings/${encodeURIComponent(userId)}/${encodeURIComponent(holdingId)}/lots`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return data as { lot: Lot };
}

export async function deleteHolding(
  userId: string,
  holdingId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(
    `${API_BASE}/holdings/${encodeURIComponent(userId)}/${encodeURIComponent(holdingId)}`,
    { method: "DELETE" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return data as { ok: true };
}

export async function deleteLot(
  userId: string,
  holdingId: string,
  lotId: string,
): Promise<{ ok: true } | ApiError> {
  const res = await fetch(
    `${API_BASE}/holdings/${encodeURIComponent(userId)}/${encodeURIComponent(holdingId)}/lots/${encodeURIComponent(lotId)}`,
    { method: "DELETE" },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
  return data as { ok: true };
}

export async function getDividends(userId: string): Promise<DividendsResponse> {
  try {
    const res = await fetch(
      `${API_BASE}/holdings/${encodeURIComponent(userId)}/dividends`,
    );
    if (!res.ok) return { dividends: [] };
    return (await res.json()) as DividendsResponse;
  } catch {
    return { dividends: [] };
  }
}

// CSV export URL for the holdings/lots dataset. Pro+ only — server returns
// 403 if Free. The mobile button gates on the same tier client-side via
// PremiumGate, but the server check is the authoritative one.
export function holdingsCsvExportUrl(userId: string): string {
  return `${API_BASE}/holdings/${encodeURIComponent(userId)}/export/csv`;
}

export interface PnlResponse {
  ytdRealized: number;
  lifetimeRealized: number;
  unrealized: number;
  totalCostBasis: number;
  currency: string;
  method: string;
}

export async function getPnl(userId: string): Promise<PnlResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/holdings/${encodeURIComponent(userId)}/pnl`);
    if (!res.ok) return null;
    return (await res.json()) as PnlResponse;
  } catch {
    return null;
  }
}
