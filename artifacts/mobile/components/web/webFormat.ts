// Tiny formatters used by web screens. Kept local so they don't leak into
// native code paths.

export function formatPriceWeb(price: number, currency?: string): string {
  if (!Number.isFinite(price)) return "—";
  const opts: Intl.NumberFormatOptions = {
    minimumFractionDigits: price < 100 ? 2 : 0,
    maximumFractionDigits: price < 100 ? 2 : 0,
  };
  return price.toLocaleString("en-US", opts);
}

export function formatChangePctWeb(pct: number): string {
  if (!Number.isFinite(pct)) return "—";
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

export function formatChangeAbsWeb(abs: number): string {
  if (!Number.isFinite(abs)) return "—";
  const sign = abs >= 0 ? "+" : "−";
  return `${sign}${Math.abs(abs).toFixed(2)}`;
}

export function formatTimeAgoWeb(iso: string | number | undefined): string {
  if (!iso) return "—";
  const ts = typeof iso === "number" ? iso : new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "—";
  const diff = Math.max(0, Date.now() - ts);
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export function todayHumanWeb(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}
