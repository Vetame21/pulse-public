// My Money: your real bank balance. You record a balance at a moment; anything
// recorded after that moment moves it. Things dated before the check are
// already inside the number you typed, so they never count twice.

import type { ISODate } from "./dates";

export type BalanceCheck = {
  balanceFen: number;
  checkedAt: string; // ISO timestamp of the check
  checkDate: ISODate; // calendar date of the check in your timezone
};

export type MoneyEvent = {
  key: string;
  date: ISODate; // when the money moved (calendar date)
  recordedAt: string; // ISO timestamp it was recorded (tie-breaker for the same day)
  deltaFen: number; // + money in, − money out
  label: string;
  kind: "expense" | "refund" | "rent" | "utilities" | "family_in" | "family_out" | "income" | "transfer_in" | "transfer_out";
};

/** Did this movement happen after the balance check? */
export function isAfterCheck(event: Pick<MoneyEvent, "date" | "recordedAt">, check: BalanceCheck): boolean {
  if (event.date > check.checkDate) return true;
  if (event.date < check.checkDate) return false;
  return new Date(event.recordedAt).getTime() > new Date(check.checkedAt).getTime();
}

export function runningBalance(check: BalanceCheck, events: MoneyEvent[]) {
  const counted = events
    .filter((e) => isAfterCheck(e, check))
    .sort((a, b) => (a.date === b.date ? a.recordedAt.localeCompare(b.recordedAt) : a.date < b.date ? -1 : 1));
  const inFen = counted.filter((e) => e.deltaFen > 0).reduce((s, e) => s + e.deltaFen, 0);
  const outFen = counted.filter((e) => e.deltaFen < 0).reduce((s, e) => s - e.deltaFen, 0);
  return { balanceFen: check.balanceFen + inFen - outFen, inFen, outFen, counted };
}
