// Daily ECB reference rates (via Frankfurter), as home currency per 1 unit of each currency.
// Plain module; inside Next.js the result is cached for an hour.

import { type CurrencyCode, foreignFor } from "./currency";

export async function ecbRates(home: CurrencyCode = "CNY"): Promise<{ rates: Partial<Record<CurrencyCode, number>>; date: string | null }> {
  const symbols = foreignFor(home).filter((c) => c !== "MOP").join(","); // the ECB has no pataca
  try {
    const init: RequestInit & { next?: { revalidate: number } } = { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } };
    const res = await fetch(`https://api.frankfurter.dev/v1/latest?base=${home}&symbols=${symbols}`, init);
    if (!res.ok) return { rates: {}, date: null };
    const json = (await res.json()) as { date: string; rates: Record<string, number> };
    const rates: Partial<Record<CurrencyCode, number>> = {};
    for (const [code, perHome] of Object.entries(json.rates)) if (perHome > 0) rates[code as CurrencyCode] = 1 / perHome;
    // The pataca is pegged to the HK dollar (HK$1 = MOP 1.03).
    if (home === "HKD") rates.MOP = 1 / 1.03;
    else if (rates.HKD) rates.MOP = rates.HKD / 1.03;
    return { rates, date: json.date };
  } catch {
    return { rates: {}, date: null }; // offline: you type the rate yourself
  }
}
