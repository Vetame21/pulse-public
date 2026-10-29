// Turning what the AI read from a timetable photo into the paste format, so the
// person checks and edits it before anything is saved.

export type ReadClass = { day: string; start: string; end: string; title: string; room?: string | null; weeks?: string | null };

const DAY = /^(mon|tue|wed|thu|fri|sat|sun)/i;
const TIME = /^\d{1,2}[:.]\d{2}$/;

/** One line per class: "Mon 08:50-10:25 Databases | B101 | 1-17". Unreadable entries are dropped. */
export function toPasteLines(classes: ReadClass[]): string {
  return classes
    .filter((c) => DAY.test(c.day ?? "") && TIME.test(c.start ?? "") && TIME.test(c.end ?? "") && (c.title ?? "").trim())
    .map((c) => {
      const day = c.day.slice(0, 1).toUpperCase() + c.day.slice(1, 3).toLowerCase();
      const title = c.title.replace(/[|\n]/g, " ").replace(/\s+/g, " ").trim();
      const room = (c.room ?? "").replace(/[|\n]/g, " ").trim();
      const weeks = (c.weeks ?? "").replace(/[^\d,\-– ]/g, "").replace(/\s+/g, "").trim();
      return [`${day} ${c.start.replace(".", ":")}-${c.end.replace(".", ":")} ${title}`, room, weeks]
        .join(" | ")
        .replace(/( \| )+$/, "");
    })
    .join("\n");
}
