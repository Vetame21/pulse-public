import { normalizeDecimal } from "./money";

// Foreign-currency expenses: typed in the local currency, converted to yuan (fen)
// at a rate you can see and change. The budget always uses the yuan amount.

export type CurrencyCode = "CNY" | "HKD" | "MOP" | "SGD" | "USD" | "IDR" | "JPY" | "KRW" | "THB" | "MYR" | "EUR" | "GBP";
type Currency = { code: CurrencyCode; symbol: string; decimals: number; name: string };

export const CURRENCIES: Currency[] = [
  { code: "CNY", symbol: "¥", decimals: 2, name: "Chinese yuan" },
  { code: "HKD", symbol: "HK$", decimals: 2, name: "Hong Kong dollar" },
  { code: "MOP", symbol: "MOP$", decimals: 2, name: "Macau pataca" },
  { code: "SGD", symbol: "S$", decimals: 2, name: "Singapore dollar" },
  { code: "USD", symbol: "US$", decimals: 2, name: "US dollar" },
  { code: "IDR", symbol: "Rp", decimals: 0, name: "Indonesian rupiah" },
  { code: "JPY", symbol: "JP¥", decimals: 0, name: "Japanese yen" },
  { code: "KRW", symbol: "₩", decimals: 0, name: "Korean won" },
  { code: "THB", symbol: "฿", decimals: 2, name: "Thai baht" },
  { code: "MYR", symbol: "RM", decimals: 2, name: "Malaysian ringgit" },
  { code: "EUR", symbol: "€", decimals: 2, name: "Euro" },
  { code: "GBP", symbol: "£", decimals: 2, name: "British pound" },
];
/** Every currency other than your home one (what you might pay in when travelling). */
export const foreignFor = (home: CurrencyCode) => CURRENCIES.filter((c) => c.code !== home).map((c) => c.code);
export const isCurrency = (code: string): code is CurrencyCode => CURRENCIES.some((c) => c.code === code);
export const currencyInfo = (code: CurrencyCode) => CURRENCIES.find((c) => c.code === code)!;

/** "120.5" in HKD → 12050 (cents); "15000" in IDR → 15000. Null if it isn't a valid positive amount. */
export function parseMinor(input: string, code: CurrencyCode): number | null {
  const { decimals } = currencyInfo(code);
  // Whole-number currencies (rupiah, yen, won): "." or "," can only group thousands ("15.000").
  const raw = input.trim().replace(/\s+/g, "");
  const s = decimals === 0 ? (/^\d{1,3}([.,]\d{3})+$/.test(raw) ? raw.replace(/[.,]/g, "") : raw) : normalizeDecimal(raw);
  const re = decimals === 0 ? /^\d+$/ : new RegExp(`^\\d+(?:\\.\\d{1,${decimals}})?$`);
  if (!re.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  const minor = Number(whole) * 10 ** decimals + Number((frac + "00").slice(0, decimals) || 0);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}

/** Yuan fen for a foreign amount at `rate` (yuan per 1 unit), rounded to the nearest fen. */
export function toFen(minor: number, code: CurrencyCode, rate: number): number {
  return Math.round((minor / 10 ** currencyInfo(code).decimals) * rate * 100);
}

/** "HK$120.50", "Rp15,000". */
export function formatMinor(minor: number, code: CurrencyCode): string {
  const { symbol, decimals } = currencyInfo(code);
  const value = minor / 10 ** decimals;
  return `${symbol}${value.toLocaleString("en-US", { minimumFractionDigits: value % 1 === 0 ? 0 : decimals, maximumFractionDigits: decimals })}`;
}

/** A rate the user typed: yuan per 1 unit, within a sane range. */
export function parseRate(input: string): number | null {
  const n = Number(normalizeDecimal(input));
  return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
}

/** Which rate to suggest: your own rate from the last 30 days (e.g. the money changer's), else the ECB rate. */
export function suggestRate(lastUsed: { rate: number; date: string } | null, ecb: number | null, today: string): { rate: number; source: "last" | "ecb" } | null {
  const days = lastUsed ? (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastUsed.date}T00:00:00Z`)) / 86_400_000 : Infinity;
  if (lastUsed && days <= 30) return { rate: lastUsed.rate, source: "last" };
  return ecb ? { rate: ecb, source: "ecb" } : null;
}
