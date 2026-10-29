// Index moves (Yahoo Finance chart data) and exchange rates (ECB via Frankfurter).

export type IndexQuote = { symbol: string; name: string; price: number; changePct: number };
export type FxQuote = { code: string; perUnit: number; changePct: number | null }; // perUnit: yuan per 1 unit

export const INDICES = [
  { symbol: "^GSPC", name: "S&P 500", short: "S&P" },
  { symbol: "^IXIC", name: "Nasdaq", short: "Nasdaq" },
  { symbol: "^HSI", name: "Hang Seng", short: "HSI" },
  { symbol: "000001.SS", name: "Shanghai", short: "SSE" },
  { symbol: "000688.SS", name: "STAR 50", short: "STAR" },
  { symbol: "^STI", name: "Singapore STI", short: "STI" },
  { symbol: "^JKSE", name: "Jakarta IDX", short: "IDX" },
] as const;

/** Latest price and the change from the previous trading day's close. */
export function parseYahooChart(json: unknown, symbol: string, name: string): IndexQuote | null {
  try {
    const r = (json as { chart: { result: { meta: { regularMarketPrice: number }; indicators: { quote: { close: (number | null)[] }[] } }[] } }).chart.result[0];
    const raw = r.indicators.quote[0].close;
    // The last entry is the latest session (its close is empty while it's still trading);
    // the previous day's close is the last number before it.
    let prev: number | null = null;
    for (let i = raw.length - 2; i >= 0 && prev === null; i--) if (typeof raw[i] === "number") prev = raw[i];
    const price = r.meta.regularMarketPrice ?? raw[raw.length - 1];
    if (typeof price !== "number" || !prev) return null;
    return { symbol, name, price, changePct: ((price - prev) / prev) * 100 };
  } catch {
    return null;
  }
}

/** Frankfurter time series (base CNY) → yuan per USD/HKD/SGD/GBP, with day change. */
export function parseFx(json: unknown): FxQuote[] {
  try {
    const rates = (json as { rates: Record<string, Record<string, number>> }).rates;
    const days = Object.keys(rates).sort();
    const last = rates[days[days.length - 1]];
    const prev = days.length >= 2 ? rates[days[days.length - 2]] : null;
    return ["USD", "HKD", "SGD", "GBP"]
      .filter((c) => typeof last[c] === "number")
      .map((code) => {
        const value = (r: Record<string, number>) => 1 / r[code];
        const now = value(last);
        const before = prev && typeof prev[code] === "number" ? value(prev) : null;
        return { code, perUnit: now, changePct: before ? ((now - before) / before) * 100 : null };
      });
  } catch {
    return [];
  }
}

export const signedPct = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(1)}%`;

/** "📰 S&P −1.9% · Nasdaq −4.5% · HSI −0.1% · SSE −2.1%" for the morning briefing. */
export function newsBriefingLine(quotes: IndexQuote[]): string | null {
  const shown = ["^GSPC", "^IXIC", "^HSI", "000001.SS", "^STI"]
    .map((s) => quotes.find((q) => q.symbol === s))
    .filter((q): q is IndexQuote => !!q)
    .map((q) => `${INDICES.find((i) => i.symbol === q.symbol)!.short} ${signedPct(q.changePct)}`);
  return shown.length ? `📰 ${shown.join(" · ")}` : null;
}
