// A small RSS 2.0 / Atom reader: titles, links and dates only. Feed text is
// untrusted, so we keep plain text and accept only http(s) links.

export type FeedItem = { title: string; link: string; published: Date | null; source: string };

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", mdash: "—", ndash: "–", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”" };

export function decodeText(raw: string): string {
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

const tag = (block: string, name: string) => block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i"))?.[1] ?? null;
const safeLink = (url: string | null | undefined) => {
  const u = url ? decodeText(url) : "";
  return /^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null;
};

export function parseFeed(xml: string, source: string): FeedItem[] {
  const blocks = xml.match(/<item[\s>][\s\S]*?<\/item>|<entry[\s>][\s\S]*?<\/entry>/gi) ?? [];
  const items: FeedItem[] = [];
  for (const b of blocks) {
    const title = decodeText(tag(b, "title") ?? "");
    const atomHref = b.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i)?.[1] ?? b.match(/<link\b[^>]*href=["']([^"']+)["']/i)?.[1];
    const link = safeLink(tag(b, "link")) ?? safeLink(atomHref) ?? safeLink(tag(b, "guid"));
    const when = tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date");
    const date = when ? new Date(decodeText(when)) : null;
    if (title && link) items.push({ title, link, published: date && !Number.isNaN(date.getTime()) ? date : null, source });
  }
  return items;
}
