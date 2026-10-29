// Money helpers. All amounts are integer fen/cents (¥12.34 = 1234); never floats.

/** Divide two integers, rounding half away from zero. */
export function roundDiv(numerator: number, denominator: number): number {
  if (denominator === 0) throw new Error("Division by zero");
  const sign = Math.sign(numerator) * Math.sign(denominator);
  const n = Math.abs(numerator);
  const d = Math.abs(denominator);
  return sign * Math.floor((2 * n + d) / (2 * d));
}

/**
 * Parse what someone types ("12", "12.5", "¥1,234.56") into fen.
 * Returns null for anything that isn't a valid non-negative amount with at most 2 decimals.
 */
/**
 * Normalise a typed number to use "." for decimals. Phones set to Indonesian (and
 * many other) regions show "," on the decimal keypad, so a comma is a decimal point
 * unless it clearly groups thousands ("1,250"). With both, the last one is the decimal.
 */
export function normalizeDecimal(input: string): string {
  const s = input.trim().replace(/\s+/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    return lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  }
  if (lastComma >= 0) {
    const parts = s.split(",");
    const thousands = parts.length > 1 && parts[0] !== "0" && parts.slice(1).every((p) => p.length === 3) && parts[0].length <= 3;
    return thousands ? parts.join("") : parts.length === 2 ? `${parts[0]}.${parts[1]}` : s;
  }
  return s;
}

export function parseYuan(input: string): number | null {
  const s = normalizeDecimal(input.trim().replace(/^[¥￥]\s*/, ""));
  if (!/^\d{1,12}(\.\d{0,2})?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}

/** An account's home currency: every *_fen amount is cents of it. */
export type HomeCurrency = "CNY" | "HKD";
export const HOME_SYMBOL: Record<HomeCurrency, string> = { CNY: "¥", HKD: "HK$" };
type FormatOptions = { alwaysDecimals?: boolean; sign?: boolean };

/** Format cents in a home currency: 186000 → "¥1,860" or "HK$1,860", -500 → "-¥5". */
export function formatMoney(cents: number, currency: HomeCurrency, options: FormatOptions = {}): string {
  if (!Number.isSafeInteger(cents)) throw new Error(`Invalid amount: ${cents}`);
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString("en-US");
  const rest = abs % 100;
  const decimals = rest !== 0 || options.alwaysDecimals ? `.${String(rest).padStart(2, "0")}` : "";
  const prefix = cents < 0 ? "-" : options.sign && cents > 0 ? "+" : "";
  return `${prefix}${HOME_SYMBOL[currency]}${whole}${decimals}`;
}

/** A formatter bound to one account's currency, used like formatRMB: `const fmt = moneyFormat(settings.homeCurrency)`. */
export const moneyFormat =
  (currency: HomeCurrency) =>
  (cents: number, options: FormatOptions = {}) =>
    formatMoney(cents, currency, options);

/** An amount without a currency symbol: 32050 → "320.50", 186000 → "1,860". */
export function plainAmount(cents: number): string {
  return formatMoney(cents, "CNY").replace("¥", "");
}

/** Format fen as RMB: 186000 → "¥1,860", 3265 → "¥32.65", -500 → "-¥5". */
export function formatRMB(fen: number, options: FormatOptions = {}): string {
  return formatMoney(fen, "CNY", options);
}

/** Percentage change from previous to current, rounded to 1 decimal. Null when previous is 0. */
export function percentChange(previous: number, current: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** Fen as a plain decimal string for files: -3250 → "-32.50". */
export function fenToDecimal(fen: number): string {
  const abs = Math.abs(fen);
  return `${fen < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

