// "Today's plan": a free-text brain dump for the day, split into a tick-off list.
// The original text is kept as written, so an AI assistant can re-sort it later.

export type PlanItem = { text: string; done: boolean };

const MAX_ITEMS = 40;

/** One item per line, and per sentence within a line (English, 中文, Indonesian punctuation). */
export function splitPlan(body: string): string[] {
  return body
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+|[。！？；;]+/))
    .map((s) => s.replace(/^\s*(?:[-*•·]|\d+[.)、])\s*/, "").replace(/[.。]+$/, "").trim())
    .filter((s) => s.length > 0)
    .slice(0, MAX_ITEMS);
}

/** New items from edited text, keeping ticks on items whose text didn't change. */
export function mergeItems(previous: PlanItem[], texts: string[]): PlanItem[] {
  const done = new Set(previous.filter((i) => i.done).map((i) => i.text));
  return texts.map((text) => ({ text, done: done.has(text) }));
}
