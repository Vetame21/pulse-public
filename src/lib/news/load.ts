// Fetches feeds and market data. Plain module (no Next.js imports) so the
// notification job can use it; inside Next.js the `next` option caches results.

import { type FxQuote, INDICES, type IndexQuote, parseFx, parseYahooChart } from "./markets";
import { type FeedItem, parseFeed } from "./rss";
import { TOPICS, pickHeadlines } from "./topics";

const UA = "Mozilla/5.0 (compatible; LifeHub/1.0; personal news reader)";
type Init = RequestInit & { next?: { revalidate: number } };

async function get(url: string, revalidate: number, ms = 6000): Promise<Response | null> {
  try {
    const init: Init = { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(ms), next: { revalidate } };
    const res = await fetch(url, init);
    return res.ok ? res : null;
  } catch {
    return null; // a dead or slow feed just shows nothing
  }
}

export type NewsSection = { id: string; label: string; items: FeedItem[] };

/** Headlines per topic. Each feed is fetched once even if two topics use it. */
export async function loadHeadlines(now = new Date()): Promise<NewsSection[]> {
  const urls = [...new Set(TOPICS.flatMap((t) => t.feeds.map((f) => f.url)))];
  const texts = new Map(await Promise.all(urls.map(async (u) => [u, (await (await get(u, 1800))?.text().catch(() => null)) ?? ""] as const)));
  const shown = new Set<string>(); // a story appears in the first section that has it
  return TOPICS.map((t) => {
    const items = t.feeds.flatMap((f) =>
      parseFeed(texts.get(f.url) ?? "", f.source).filter((i) => !shown.has(i.link) && (!f.filter || f.filter.test(i.title)) && (!t.filter || t.filter.test(i.title))),
    );
    const picked = pickHeadlines(items, now);
    for (const i of picked) shown.add(i.link);
    return { id: t.id, label: t.label, items: picked };
  });
}

/** `timeoutMs` keeps a slow market source from holding up the page that asked. */
export async function loadIndices(revalidate = 900, timeoutMs = 6000): Promise<IndexQuote[]> {
  const quotes = await Promise.all(
    INDICES.map(async (i) => {
      const res = await get(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(i.symbol)}?range=5d&interval=1d`, revalidate, timeoutMs);
      return res ? parseYahooChart(await res.json().catch(() => null), i.symbol, i.name) : null;
    }),
  );
  return quotes.filter((q): q is IndexQuote => q !== null);
}

export async function loadFx(today: string): Promise<FxQuote[]> {
  const from = new Date(Date.parse(`${today}T00:00:00Z`) - 10 * 86_400_000).toISOString().slice(0, 10);
  const res = await get(`https://api.frankfurter.dev/v1/${from}..?base=CNY&symbols=USD,HKD,SGD,GBP`, 3600);
  return res ? parseFx(await res.json().catch(() => null)) : [];
}
