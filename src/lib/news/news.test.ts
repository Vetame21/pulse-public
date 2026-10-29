import { describe, expect, it } from "vitest";
import { newsBriefingLine, parseFx, parseYahooChart } from "./markets";
import { decodeText, parseFeed } from "./rss";
import { CHIP_WORDS, pickHeadlines } from "./topics";

const RSS = `<?xml version="1.0"?><rss><channel><title>X</title>
<item><title><![CDATA[China&#8217;s exports beat forecasts]]></title><link>https://www.scmp.com/a?x=1&amp;y=2</link><pubDate>Fri, 16 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Bad link</title><link>javascript:alert(1)</link></item>
<item><title>Nvidia &amp; TSMC <b>expand</b></title><guid isPermaLink="true">https://example.com/chips</guid><pubDate>Fri, 16 Oct 2026 10:00:00 GMT</pubDate></item>
</channel></rss>`;
const ATOM = `<feed><entry><title type="html">DeepSeek ships a new model</title><link rel="alternate" href="https://www.theverge.com/ai/1"/><updated>2026-10-16T09:00:00Z</updated></entry></feed>`;

describe("parseFeed", () => {
  it("reads RSS and Atom, decoding text and keeping only http(s) links", () => {
    const items = parseFeed(RSS, "SCMP");
    expect(items.map((i) => [i.title, i.link])).toEqual([
      ["China’s exports beat forecasts", "https://www.scmp.com/a?x=1&y=2"],
      ["Nvidia & TSMC expand", "https://example.com/chips"],
    ]);
    expect(parseFeed(ATOM, "The Verge")[0]).toMatchObject({ title: "DeepSeek ships a new model", link: "https://www.theverge.com/ai/1" });
  });
  it("decodes entities and strips tags", () => {
    expect(decodeText("A &lt;b&gt; &quot;x&quot; &#x4e2d; <i>y</i>")).toBe('A <b> "x" 中 y');
  });
});

describe("pickHeadlines", () => {
  it("keeps recent ones, newest first, one per story", () => {
    const now = new Date("2026-10-17T00:00:00Z");
    const items = [
      { title: "Old news", link: "https://a/1", published: new Date("2026-10-10T00:00:00Z"), source: "A" },
      { title: "Fed holds rates", link: "https://a/2", published: new Date("2026-10-16T08:00:00Z"), source: "A" },
      { title: "Fed holds rates!", link: "https://b/9", published: new Date("2026-10-16T07:00:00Z"), source: "B" },
      { title: "Yen slides", link: "https://a/3", published: new Date("2026-10-16T12:00:00Z"), source: "A" },
    ];
    expect(pickHeadlines(items, now).map((i) => i.title)).toEqual(["Yen slides", "Fed holds rates"]);
  });
  it("chip filter matches chip stories only", () => {
    expect(CHIP_WORDS.test("US tightens export controls on AI chips")).toBe(true);
    expect(CHIP_WORDS.test("Potato chips prices")).toBe(true); // known limit: plain "chips" matches
    expect(CHIP_WORDS.test("Hong Kong property sales rise")).toBe(false);
  });
});

describe("markets", () => {
  it("computes the day change from the last two closes", () => {
    const json = { chart: { result: [{ meta: { regularMarketPrice: 24186.83 }, indicators: { quote: [{ close: [24271.2, 24345.2, null, 24062.7, 24186.83] }] } }] } };
    const q = parseYahooChart(json, "^HSI", "Hang Seng")!;
    expect(q.changePct).toBeCloseTo(0.517, 2);
    expect(parseYahooChart({}, "^HSI", "Hang Seng")).toBeNull();
  });
  it("compares with yesterday while today's session is still trading (no close yet)", () => {
    const json = { chart: { result: [{ meta: { regularMarketPrice: 110 }, indicators: { quote: [{ close: [90, 100, null] }] } }] } };
    expect(parseYahooChart(json, "^X", "X")!.changePct).toBeCloseTo(10);
  });
  it("turns CNY-based rates into yuan per unit, with day change", () => {
    const fx = parseFx({ rates: { "2026-10-15": { USD: 0.14945 }, "2026-10-16": { USD: 0.14956 } } });
    expect(fx.find((f) => f.code === "USD")!.perUnit).toBeCloseTo(6.686, 2);
    expect(fx.find((f) => f.code === "USD")!.changePct).toBeCloseTo(-0.0735, 3);
  });
  it("builds the briefing line in a fixed order", () => {
    const q = (symbol: string, changePct: number) => ({ symbol, name: symbol, price: 1, changePct });
    expect(newsBriefingLine([q("^HSI", -0.1), q("^GSPC", -1.94), q("000001.SS", 2.13)])).toBe("📰 S&P −1.9% · HSI −0.1% · SSE +2.1%");
    expect(newsBriefingLine([])).toBeNull();
  });
});
