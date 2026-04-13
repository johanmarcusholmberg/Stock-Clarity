// Market hours utility — maps exchange identifiers to open/close times per timezone.
// Used to determine whether auto-refresh and manual refresh should happen.

export interface MarketSchedule {
  timezone: string;
  openHour: number;
  openMin: number;
  closeHour: number;
  closeMin: number;
  label: string;
}

// Keyed by normalised exchange identifiers from Yahoo Finance
const SCHEDULES: Record<string, MarketSchedule> = {
  // ── US (NYSE / NASDAQ) ──
  NYQ:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NYSE (ET)" },
  NMS:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ (ET)" },
  NGM:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ (ET)" },
  NCM:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ (ET)" },
  PCX:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NYSE Arca (ET)" },
  BATS: { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "BATS (ET)" },
  // ── UK ──
  LSE:  { timezone: "Europe/London",       openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, label: "LSE (GMT)" },
  AIM:  { timezone: "Europe/London",       openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, label: "AIM (GMT)" },
  // ── Germany ──
  GER:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "XETRA (CET)" },
  XET:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "XETRA (CET)" },
  FRA:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Frankfurt (CET)" },
  // ── France / Euronext ──
  PAR:  { timezone: "Europe/Paris",        openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext Paris (CET)" },
  ENX:  { timezone: "Europe/Paris",        openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext (CET)" },
  // ── Netherlands ──
  AMS:  { timezone: "Europe/Amsterdam",    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext Amsterdam (CET)" },
  // ── Canada ──
  TOR:  { timezone: "America/Toronto",     openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "TSX (ET)" },
  CVE:  { timezone: "America/Toronto",     openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "TSX-V (ET)" },
  // ── Japan ──
  JPX:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "JPX (JST)" },
  TYO:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "Tokyo (JST)" },
  OSA:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "Osaka (JST)" },
  // ── Hong Kong ──
  HKG:  { timezone: "Asia/Hong_Kong",      openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "HKEX (HKT)" },
  // ── China ──
  SHH:  { timezone: "Asia/Shanghai",       openHour: 9,  openMin: 30, closeHour: 15, closeMin: 0,  label: "SSE (CST)" },
  SHZ:  { timezone: "Asia/Shanghai",       openHour: 9,  openMin: 30, closeHour: 15, closeMin: 0,  label: "SZSE (CST)" },
  // ── India ──
  NSI:  { timezone: "Asia/Kolkata",        openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, label: "NSE (IST)" },
  BSE:  { timezone: "Asia/Kolkata",        openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, label: "BSE (IST)" },
  // ── Australia ──
  ASX:  { timezone: "Australia/Sydney",    openHour: 10, openMin: 0,  closeHour: 16, closeMin: 0,  label: "ASX (AEST)" },
  // ── Switzerland ──
  SIX:  { timezone: "Europe/Zurich",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "SIX (CET)" },
  VTX:  { timezone: "Europe/Zurich",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "SIX (CET)" },
  // ── Spain ──
  MCE:  { timezone: "Europe/Madrid",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "BME (CET)" },
  // ── Italy ──
  MIL:  { timezone: "Europe/Rome",         openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Borsa Italiana (CET)" },
  // ── South Korea ──
  KSC:  { timezone: "Asia/Seoul",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "KRX (KST)" },
  KOE:  { timezone: "Asia/Seoul",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "KOSDAQ (KST)" },
  // ── Brazil ──
  SAO:  { timezone: "America/Sao_Paulo",   openHour: 10, openMin: 0,  closeHour: 17, closeMin: 0,  label: "B3 (BRT)" },
  // ── Mexico ──
  MEX:  { timezone: "America/Mexico_City", openHour: 8,  openMin: 30, closeHour: 15, closeMin: 0,  label: "BMV (CST)" },
  // ── Sweden ──
  STO:  { timezone: "Europe/Stockholm",    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Nasdaq Stockholm (CET)" },
  // ── Default (US) ──
  DEFAULT: { timezone: "America/New_York", openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "Market (ET)" },
};

// Fuzzy-normalise an exchange string from Yahoo Finance into a schedule key
function normaliseExchange(raw: string): string {
  if (!raw) return "DEFAULT";
  const u = raw.toUpperCase();

  if (u.includes("NASDAQ")) return "NMS";
  if (u.includes("NYSE"))   return "NYQ";
  if (u.includes("LONDON") || u.includes("LSE")) return "LSE";
  if (u.includes("TOKYO") || u.includes("JPX"))  return "JPX";
  if (u.includes("HONG KONG") || u.includes("HKEX")) return "HKG";
  if (u.includes("FRANKFURT") || u.includes("XETRA")) return "GER";
  if (u.includes("EURONEXT PARIS") || u.includes("PARIS")) return "PAR";
  if (u.includes("EURONEXT AMSTERDAM")) return "AMS";
  if (u.includes("EURONEXT")) return "PAR";
  if (u.includes("TORONTO") || u.includes("TSX")) return "TOR";
  if (u.includes("AUSTRALIA") || u.includes("ASX")) return "ASX";
  if (u.includes("INDIA") || u.includes("NSE")) return "NSI";
  if (u.includes("BSE") || u.includes("BOMBAY")) return "BSE";
  if (u.includes("SHANGHAI")) return "SHH";
  if (u.includes("SHENZHEN")) return "SHZ";
  if (u.includes("KOREA") || u.includes("KRX") || u.includes("KOSPI")) return "KSC";
  if (u.includes("KOSDAQ")) return "KOE";
  if (u.includes("BRAZIL") || u.includes("B3") || u.includes("BOVESPA")) return "SAO";

  // Direct key lookup (e.g., "NMS", "NYQ", "TYO" from Yahoo)
  if (SCHEDULES[u]) return u;
  return "DEFAULT";
}

function localTime(timezone: string): { hour: number; min: number; weekday: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour:    "numeric",
    minute:  "numeric",
    weekday: "short",
    hour12:  false,
  }).formatToParts(now);

  const hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  const min  = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const wday = parts.find((p) => p.type === "weekday")?.value ?? "Mon";
  const wdMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { hour: hour === 24 ? 0 : hour, min, weekday: wdMap[wday] ?? 1 };
}

/** Returns true if the stock's exchange is currently open for trading. */
export function isMarketOpen(exchangeRaw: string): boolean {
  const key = normaliseExchange(exchangeRaw);
  const sched = SCHEDULES[key] ?? SCHEDULES["DEFAULT"];
  const { hour, min, weekday } = localTime(sched.timezone);

  if (weekday === 0 || weekday === 6) return false;

  const nowMins   = hour * 60 + min;
  const openMins  = sched.openHour * 60 + sched.openMin;
  const closeMins = sched.closeHour * 60 + sched.closeMin;
  return nowMins >= openMins && nowMins < closeMins;
}

/** Returns the human-readable schedule label for a given exchange. */
export function marketLabel(exchangeRaw: string): string {
  const key = normaliseExchange(exchangeRaw);
  return (SCHEDULES[key] ?? SCHEDULES["DEFAULT"]).label;
}
