import { getApiBase } from "../lib/apiBase";
import { authedFetch } from "../lib/authedFetch";
// Client for the /api/alerts endpoints. Types intentionally mirror the DB
// shape — camelCased on the client, snake_cased in the payload.

const API_BASE =
  getApiBase();

export type AlertType = "price_above" | "price_below" | "pct_change_day";
export type AlertStatus = "active" | "snoozed" | "triggered" | "disabled";
export type AlertDeliveryChannel = "push" | "email" | "both";

export interface UserAlert {
  id: string;
  symbol: string;
  type: AlertType;
  threshold: number;
  status: AlertStatus;
  deliveryChannel: AlertDeliveryChannel;
  lastFiredAt: string | null;
  createdAt: string;
  fireCount: number;
}

export interface AlertEvent {
  id: number;
  alertId: string;
  symbol: string;
  type: AlertType;
  threshold: number;
  firedAt: string;
  priceAtFire: number;
  deliveredVia: string | null;
}

export interface AlertStatusResponse {
  enabled: boolean;
  evaluatorHealthy: boolean;
  lastBeat: string | null;
}

function mapAlert(row: any): UserAlert {
  return {
    id: row.id,
    symbol: row.symbol,
    type: row.type,
    threshold: Number(row.threshold),
    status: row.status,
    deliveryChannel: row.delivery_channel,
    lastFiredAt: row.last_fired_at,
    createdAt: row.created_at,
    fireCount: Number(row.fire_count ?? 0),
  };
}

function mapEvent(row: any): AlertEvent {
  return {
    id: Number(row.id),
    alertId: row.alert_id,
    symbol: row.symbol,
    type: row.type,
    threshold: Number(row.threshold),
    firedAt: row.fired_at,
    priceAtFire: Number(row.price_at_fire),
    deliveredVia: row.delivered_via,
  };
}

export async function getAlertStatus(userId: string | null): Promise<AlertStatusResponse> {
  try {
    const u = userId ? `?userId=${encodeURIComponent(userId)}` : "";
    const res = await authedFetch(`${API_BASE}/alerts/status${u}`);
    if (!res.ok) return { enabled: false, evaluatorHealthy: false, lastBeat: null };
    return (await res.json()) as AlertStatusResponse;
  } catch {
    return { enabled: false, evaluatorHealthy: false, lastBeat: null };
  }
}

export async function listAlerts(userId: string): Promise<UserAlert[]> {
  try {
    const res = await authedFetch(`${API_BASE}/alerts/${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.alerts) ? data.alerts.map(mapAlert) : [];
  } catch {
    return [];
  }
}

export async function listAlertEvents(userId: string, limit = 50): Promise<AlertEvent[]> {
  try {
    const res = await authedFetch(`${API_BASE}/alerts/${encodeURIComponent(userId)}/events?limit=${limit}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.events) ? data.events.map(mapEvent) : [];
  } catch {
    return [];
  }
}

export async function createAlert(
  userId: string,
  input: { symbol: string; type: AlertType; threshold: number; deliveryChannel?: AlertDeliveryChannel },
): Promise<UserAlert | { error: string }> {
  try {
    const res = await authedFetch(`${API_BASE}/alerts/${encodeURIComponent(userId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { error: data?.error ?? `HTTP ${res.status}` };
    return mapAlert(data.alert);
  } catch {
    return { error: "Network error — please try again" };
  }
}

export async function updateAlert(
  userId: string,
  alertId: string,
  patch: Partial<Pick<UserAlert, "status" | "threshold" | "deliveryChannel">>,
): Promise<UserAlert | null> {
  const body: Record<string, unknown> = {};
  if (patch.status !== undefined) body.status = patch.status;
  if (patch.threshold !== undefined) body.threshold = patch.threshold;
  if (patch.deliveryChannel !== undefined) body.deliveryChannel = patch.deliveryChannel;

  try {
    const res = await authedFetch(
      `${API_BASE}/alerts/${encodeURIComponent(userId)}/${encodeURIComponent(alertId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return data?.alert ? mapAlert(data.alert) : null;
  } catch {
    return null;
  }
}

export async function deleteAlert(userId: string, alertId: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `${API_BASE}/alerts/${encodeURIComponent(userId)}/${encodeURIComponent(alertId)}`,
      { method: "DELETE" },
    );
    return res.ok;
  } catch {
    return false;
  }
}

export async function registerPushToken(
  userId: string,
  token: string,
  platform: string,
  timezone?: string | null,
): Promise<boolean> {
  try {
    const body: Record<string, unknown> = { userId, token, platform };
    if (typeof timezone === "string" && timezone.length > 0) body.timezone = timezone;
    const res = await authedFetch(`${API_BASE}/push-tokens`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch {
    return false;
  }
}
