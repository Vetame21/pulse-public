// Think Again: a waitlist for things you want. Each item waits a few days
// before you decide; skipping it counts as money not spent.

import { type ISODate, diffDays } from "./dates";

export type WaitItem = {
  id: string;
  priceFen: number;
  addedOn: ISODate;
  decideAfter: ISODate;
  status: "waiting" | "bought" | "skipped";
};

export const WAIT_CHOICES = [3, 7, 14, 30];

/** Days until an item can be decided (0 or less = ready now). */
export function daysLeft(item: Pick<WaitItem, "decideAfter">, today: ISODate): number {
  return diffDays(today, item.decideAfter);
}

export function groupItems<T extends WaitItem>(items: T[], today: ISODate) {
  const waiting = items.filter((i) => i.status === "waiting");
  return {
    ready: waiting.filter((i) => daysLeft(i, today) <= 0).sort((a, b) => (a.decideAfter < b.decideAfter ? -1 : 1)),
    waiting: waiting.filter((i) => daysLeft(i, today) > 0).sort((a, b) => (a.decideAfter < b.decideAfter ? -1 : 1)),
    decided: items.filter((i) => i.status !== "waiting"),
  };
}

/** Money not spent because you skipped things after thinking again. */
export function savedBySkipping(items: WaitItem[]): number {
  return items.filter((i) => i.status === "skipped").reduce((sum, i) => sum + i.priceFen, 0);
}
