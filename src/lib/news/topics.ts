// The topics on the News page and the feeds behind them. A filter keeps only
// matching headlines (e.g. chips out of a general tech feed).

import type { FeedItem } from "./rss";

export type Feed = { url: string; source: string; filter?: RegExp };
export type Topic = { id: string; label: string; feeds: Feed[]; filter?: RegExp };

const SCMP = (id: number) => `https://www.scmp.com/rss/${id}/feed/`;
export const AI_WORDS = /\bAI\b|artificial intelligence|\bLLMs?\b|Claude|Anthropic|OpenAI|ChatGPT|\bGPT|Qwen|DeepSeek|\bxAI\b|Grok|Gemini|Llama|Mistral|Kimi|Moonshot|Zhipu/i;
const FINANCE_WORDS = /market|stock|shares|econom|inflation|interest rate|\brates?\b|bank|\bFed\b|ECB|BoE|bond|yield|tariff|trade|oil|\beuro\b|dollar|pound|GDP|jobs|earnings|profit|deal|invest|budget|deficit|tax/i;
const ID_FINANCE_WORDS = /saham|IHSG|rupiah|\bBI\b|Bank Indonesia|bursa|emiten|ekonomi|investor|investasi|obligasi|inflasi|suku bunga|keuangan|kredit|\bbank|ekspor|impor|Danantara|APBN|pajak|\bIPO\b|dolar|harga|BEI|OJK|likuiditas|dana/i;
export const CHIP_WORDS = /\bchips?\b|chipmaker|semiconductor|TSMC|Nvidia|ASML|SMIC|Huawei|Ascend|export control|wafer|lithograph|foundry|\bHBM\b|SK Hynix|Samsung Electronics|\bAMD\b|Intel\b|Qualcomm|Broadcom|\bArm\b/i;

export const TOPICS: Topic[] = [
  {
    id: "china",
    label: "China & Shanghai",
    feeds: [
      { url: SCMP(318421), source: "SCMP" },
      { url: SCMP(92), source: "SCMP" },
    ],
  },
  {
    id: "hk-sg",
    label: "Hong Kong & Singapore",
    feeds: [
      { url: "https://www.channelnewsasia.com/api/v1/rss-outbound-feed?_format=xml&category=6936", source: "CNA" },
      { url: "https://www.straitstimes.com/news/business/rss.xml", source: "Straits Times" },
      { url: "https://www.businesstimes.com.sg/rss/top-stories", source: "Business Times" },
      { url: SCMP(2), source: "SCMP", filter: /stock|market|econom|bank|property|Hang Seng|HKEX|IPO|finance|dollar|budget|tax/i },
    ],
  },
  { id: "apac", label: "Asia-Pacific", feeds: [{ url: "https://asia.nikkei.com/rss/feed/nar", source: "Nikkei Asia" }] },
  { id: "indonesia", label: "Indonesia", feeds: [{ url: "https://www.cnbcindonesia.com/market/rss", source: "CNBC Indonesia", filter: ID_FINANCE_WORDS }] },
  {
    id: "us-eu",
    label: "US & Europe",
    feeds: [
      { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC" },
      { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC", filter: FINANCE_WORDS },
    ],
  },
  {
    id: "world",
    label: "Geopolitics",
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/rss.xml", source: "BBC" },
      { url: "https://www.aljazeera.com/xml/rss/all.xml", source: "Al Jazeera" },
      { url: "https://www.theguardian.com/world/rss", source: "Guardian" },
      { url: SCMP(4), source: "SCMP" },
    ],
  },
  {
    id: "ai",
    label: "AI",
    feeds: [
      { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
      { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
      { url: SCMP(36), source: "SCMP", filter: AI_WORDS },
    ],
  },
  {
    id: "chips",
    label: "Chip wars",
    filter: CHIP_WORDS,
    feeds: [
      { url: SCMP(36), source: "SCMP" },
      { url: "https://asia.nikkei.com/rss/feed/nar", source: "Nikkei Asia" },
      { url: "https://techcrunch.com/category/artificial-intelligence/feed/", source: "TechCrunch" },
      { url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", source: "The Verge" },
      { url: SCMP(92), source: "SCMP" },
    ],
  },
];

const key = (title: string) => title.toLowerCase().replace(/[^a-z0-9一-鿿]+/g, " ").trim().slice(0, 80);

/** Newest matching headlines for a topic, one per story, within the last `maxAgeHours`. */
export function pickHeadlines(items: FeedItem[], now: Date, limit = 5, maxAgeHours = 48): FeedItem[] {
  const seen = new Set<string>();
  return items
    .filter((i) => !i.published || now.getTime() - i.published.getTime() <= maxAgeHours * 3_600_000)
    .sort((a, b) => (b.published?.getTime() ?? 0) - (a.published?.getTime() ?? 0))
    .filter((i) => {
      const k = key(i.title);
      if (seen.has(k) || seen.has(i.link)) return false;
      seen.add(k);
      seen.add(i.link);
      return true;
    })
    .slice(0, limit);
}
