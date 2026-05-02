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
export const SCHEDULES: Record<string, MarketSchedule> = {
  // ── US (NYSE / NASDAQ) ──
  NYQ:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NYSE" },
  NMS:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ" },
  NGM:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ" },
  NCM:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NASDAQ" },
  PCX:  { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "NYSE Arca" },
  BATS: { timezone: "America/New_York",    openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "BATS" },
  // ── UK ──
  LSE:  { timezone: "Europe/London",       openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, label: "LSE" },
  AIM:  { timezone: "Europe/London",       openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, label: "AIM" },
  // ── Germany ──
  GER:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "XETRA" },
  XET:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "XETRA" },
  FRA:  { timezone: "Europe/Berlin",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Frankfurt" },
  // ── France / Euronext ──
  PAR:  { timezone: "Europe/Paris",        openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext Paris" },
  ENX:  { timezone: "Europe/Paris",        openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext" },
  // ── Netherlands ──
  AMS:  { timezone: "Europe/Amsterdam",    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext Amsterdam" },
  // ── Belgium ──
  EBR:  { timezone: "Europe/Brussels",     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Euronext Brussels" },
  // ── Portugal ──
  ELI:  { timezone: "Europe/Lisbon",       openHour: 8,  openMin: 0,  closeHour: 16, closeMin: 30, label: "Euronext Lisbon" },
  // ── Canada ──
  TOR:  { timezone: "America/Toronto",     openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "TSX" },
  CVE:  { timezone: "America/Toronto",     openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "TSX-V" },
  // ── Japan ──
  JPX:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "JPX" },
  TYO:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "Tokyo" },
  OSA:  { timezone: "Asia/Tokyo",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "Osaka" },
  // ── Hong Kong ──
  HKG:  { timezone: "Asia/Hong_Kong",      openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "HKEX" },
  // ── China ──
  SHH:  { timezone: "Asia/Shanghai",       openHour: 9,  openMin: 30, closeHour: 15, closeMin: 0,  label: "SSE" },
  SHZ:  { timezone: "Asia/Shanghai",       openHour: 9,  openMin: 30, closeHour: 15, closeMin: 0,  label: "SZSE" },
  // ── India ──
  NSI:  { timezone: "Asia/Kolkata",        openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, label: "NSE" },
  BSE:  { timezone: "Asia/Kolkata",        openHour: 9,  openMin: 15, closeHour: 15, closeMin: 30, label: "BSE" },
  // ── Australia ──
  ASX:  { timezone: "Australia/Sydney",    openHour: 10, openMin: 0,  closeHour: 16, closeMin: 0,  label: "ASX" },
  // ── Switzerland ──
  SIX:  { timezone: "Europe/Zurich",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "SIX" },
  VTX:  { timezone: "Europe/Zurich",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "SIX" },
  // ── Spain ──
  MCE:  { timezone: "Europe/Madrid",       openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "BME" },
  // ── Italy ──
  MIL:  { timezone: "Europe/Rome",         openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Borsa Italiana" },
  // ── South Korea ──
  KSC:  { timezone: "Asia/Seoul",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "KRX" },
  KOE:  { timezone: "Asia/Seoul",          openHour: 9,  openMin: 0,  closeHour: 15, closeMin: 30, label: "KOSDAQ" },
  // ── Brazil ──
  SAO:  { timezone: "America/Sao_Paulo",   openHour: 10, openMin: 0,  closeHour: 17, closeMin: 0,  label: "B3" },
  // ── Mexico ──
  MEX:  { timezone: "America/Mexico_City", openHour: 8,  openMin: 30, closeHour: 15, closeMin: 0,  label: "BMV" },
  // ── Sweden — Nasdaq Stockholm: 09:00–17:30 CET/CEST ──
  STO:  { timezone: "Europe/Stockholm",    openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Nasdaq Stockholm" },
  NGM_STO: { timezone: "Europe/Stockholm", openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "NGM Stockholm" },
  // ── Norway — Oslo Børs: 09:00–16:30 CET/CEST ──
  OSE:  { timezone: "Europe/Oslo",         openHour: 9,  openMin: 0,  closeHour: 16, closeMin: 30, label: "Oslo Børs" },
  OBX:  { timezone: "Europe/Oslo",         openHour: 9,  openMin: 0,  closeHour: 16, closeMin: 30, label: "Oslo Børs" },
  // ── Denmark — Nasdaq Copenhagen: 09:00–17:00 CET/CEST ──
  CPH:  { timezone: "Europe/Copenhagen",   openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 0,  label: "Nasdaq Copenhagen" },
  CSE:  { timezone: "Europe/Copenhagen",   openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 0,  label: "Nasdaq Copenhagen" },
  // ── Finland — Nasdaq Helsinki: 09:00–17:30 EET/EEST ──
  HEL:  { timezone: "Europe/Helsinki",     openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 30, label: "Nasdaq Helsinki" },
  // ── Singapore ──
  SES:  { timezone: "Asia/Singapore",      openHour: 9,  openMin: 0,  closeHour: 17, closeMin: 0,  label: "SGX" },
  // ── New Zealand ──
  NZE:  { timezone: "Pacific/Auckland",    openHour: 10, openMin: 0,  closeHour: 17, closeMin: 0,  label: "NZX" },
  // ── Default (US) ──
  DEFAULT: { timezone: "America/New_York", openHour: 9,  openMin: 30, closeHour: 16, closeMin: 0,  label: "Market" },
};

// Fuzzy-normalise an exchange string from Yahoo Finance into a schedule key.
// IMPORTANT: more-specific checks must come before generic ones (e.g. "Stockholm" before "NASDAQ").
export function normaliseExchange(raw: string): string {
  if (!raw) return "DEFAULT";
  const u = raw.toUpperCase().trim();

  // ── Nordic exchanges — check BEFORE generic NASDAQ/Euronext to avoid mis-match ──
  if (u.includes("STOCKHOLM") || u === "STO") return "STO";
  if (u.includes("OSLO") || u === "OSE" || u === "OBX") return "OSE";
  if (u.includes("COPENHAGEN") || u === "CPH" || u === "CSE") return "CPH";
  if (u.includes("HELSINKI") || u === "HEL") return "HEL";
  if (u.includes("NORDIC") || u.includes("OMX")) return "STO"; // OMX defaults to Stockholm

  // ── US ──
  if (u.includes("NASDAQ")) return "NMS";
  if (u.includes("NYSE ARCA")) return "PCX";
  if (u.includes("NYSE")) return "NYQ";

  // ── Europe ──
  if (u.includes("LONDON") || u.includes("LSE")) return "LSE";
  if (u.includes("AIM")) return "AIM";
  if (u.includes("FRANKFURT") || u.includes("XETRA")) return "GER";
  if (u.includes("EURONEXT AMSTERDAM") || u.includes("AMSTERDAM")) return "AMS";
  if (u.includes("EURONEXT PARIS") || u.includes("PARIS")) return "PAR";
  if (u.includes("EURONEXT BRUSSELS") || u.includes("BRUSSELS")) return "EBR";
  if (u.includes("EURONEXT LISBON") || u.includes("LISBON")) return "ELI";
  if (u.includes("EURONEXT")) return "PAR";
  if (u.includes("ZURICH") || u.includes("SIX")) return "SIX";
  if (u.includes("MADRID") || u.includes("BOLSA")) return "MCE";
  if (u.includes("MILAN") || u.includes("BORSA")) return "MIL";

  // ── Americas ──
  if (u.includes("TORONTO") || u.includes("TSX")) return "TOR";
  if (u.includes("MEXICO") || u.includes("BMV")) return "MEX";
  if (u.includes("BRAZIL") || u.includes("B3") || u.includes("BOVESPA")) return "SAO";

  // ── Asia-Pacific ──
  if (u.includes("TOKYO") || u.includes("JPX")) return "JPX";
  if (u.includes("HONG KONG") || u.includes("HKEX")) return "HKG";
  if (u.includes("SINGAPORE") || u.includes("SGX")) return "SES";
  if (u.includes("AUSTRALIA") || u.includes("ASX")) return "ASX";
  if (u.includes("NEW ZEALAND") || u.includes("NZX")) return "NZE";
  if (u.includes("INDIA") || u.includes("NSE")) return "NSI";
  if (u.includes("BSE") || u.includes("BOMBAY")) return "BSE";
  if (u.includes("SHANGHAI")) return "SHH";
  if (u.includes("SHENZHEN")) return "SHZ";
  if (u.includes("KOREA") || u.includes("KRX") || u.includes("KOSPI")) return "KSC";
  if (u.includes("KOSDAQ")) return "KOE";

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
  return isMarketOpenWithBuffer(exchangeRaw, 0);
}

/** Returns true if the stock's exchange is open, optionally widening the
 * open window by `bufferMin` minutes on both sides.  This lets data refresh
 * a few minutes before the bell and a few minutes after the close, so
 * end-of-session prints aren't missed. */
export function isMarketOpenWithBuffer(exchangeRaw: string, bufferMin: number): boolean {
  const key = normaliseExchange(exchangeRaw);
  const sched = SCHEDULES[key] ?? SCHEDULES["DEFAULT"];
  const { hour, min, weekday } = localTime(sched.timezone);

  if (weekday === 0 || weekday === 6) return false;

  const nowMins   = hour * 60 + min;
  const openMins  = sched.openHour * 60 + sched.openMin - bufferMin;
  const closeMins = sched.closeHour * 60 + sched.closeMin + bufferMin;
  return nowMins >= openMins && nowMins < closeMins;
}

/** Returns true if at least one of the supplied exchanges is open right now
 * (with optional buffer minutes around the bell).  If no exchanges are
 * provided, returns false — there is nothing to keep fresh. */
export function anyMarketOpenWithBuffer(exchanges: string[], bufferMin: number): boolean {
  if (!exchanges.length) return false;
  for (const e of exchanges) {
    if (e && isMarketOpenWithBuffer(e, bufferMin)) return true;
  }
  return false;
}

/** Returns the human-readable schedule label for a given exchange. */
export function marketLabel(exchangeRaw: string): string {
  const key = normaliseExchange(exchangeRaw);
  return (SCHEDULES[key] ?? SCHEDULES["DEFAULT"]).label;
}
