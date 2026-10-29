// Today page: the greeting and the "needs attention" list (pure, tested).

import { formatMonth } from "./dates";
import { type HomeCurrency, formatMoney } from "./money";

export function greeting(hour: number): string {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 18) return "Good afternoon";
  if (hour >= 18 && hour < 24) return "Good evening";
  return "Still up?";
}

export type AttentionInput = {
  currency?: HomeCurrency; // your home currency (default ¥)
  overBudgetFen: number;
  monthsToClose: string[]; // first day of each ended, unclosed month, newest first or any order
  rentUnpaidThisMonth: boolean;
  dayOfMonth: number;
  thinkAgainReady: string[]; // item names
  backupAgeDays: number | null;
  hasAnyData: boolean;
};

export type AttentionItem = { key: string; emoji: string; text: string; href: string };

/** What needs doing, most urgent first. Empty on a calm day. */
export function attentionItems(i: AttentionInput): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (i.overBudgetFen > 0) {
    items.push({ key: "over-budget", emoji: "🔴", text: `Over this month's budget by ${formatMoney(i.overBudgetFen, i.currency ?? "CNY")}`, href: "/money" });
  }
  if (i.monthsToClose.length > 0) {
    const [latest, ...rest] = [...i.monthsToClose].sort().reverse();
    items.push({
      key: "close-month",
      emoji: "🗓",
      text: `Close ${formatMonth(latest)}${rest.length ? ` (+${rest.length} more)` : ""}`,
      href: `/savings/close/${latest.slice(0, 7)}`,
    });
  }
  if (i.rentUnpaidThisMonth && i.dayOfMonth > 5) {
    items.push({ key: "rent", emoji: "🏠", text: "Rent not marked as paid this month", href: "/accounts/apartment" });
  }
  if (i.thinkAgainReady.length > 0) {
    const [first, ...rest] = i.thinkAgainReady;
    items.push({
      key: "think-again",
      emoji: "🤔",
      text: `Still want ${first}?${rest.length ? ` (+${rest.length} more)` : ""}`,
      href: "/accounts/think-again",
    });
  }
  if (i.hasAnyData && (i.backupAgeDays === null || i.backupAgeDays > 30)) {
    items.push({ key: "backup", emoji: "💾", text: i.backupAgeDays === null ? "Make your first backup" : "Backup is over 30 days old", href: "/settings#backup" });
  }
  return items;
}
