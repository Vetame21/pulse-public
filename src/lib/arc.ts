// "What arc are you in?" A small game on top of the budget: your spending pace
// puts you in an arc (Monk Mode → Frugal → Balanced → Hedon → Chaos), your
// biggest category can add a flavour (Foodie, Collector…), and days spent
// within your daily allowance build a streak.

import type { CategoryKey } from "./categories";
import { type ISODate, addDays, daysInMonthOf, maxDate } from "./dates";

export type ArcKey = "fresh" | "monk" | "frugal" | "balanced" | "hedon" | "chaos";

export const ARCS: Record<ArcKey, { emoji: string; name: string; line: string; howTo: string }> = {
  fresh: { emoji: "🌱", name: "Fresh Start Arc", line: "New month, clean slate. Your arc reveals itself in a few days.", howTo: "First 2 days of a month" },
  monk: { emoji: "🧘", name: "Monk Mode", line: "Barely spending. Enlightened wallet, maybe treat yourself a little.", howTo: "Spending under 40% of your pace" },
  frugal: { emoji: "🪙", name: "Frugal Arc", line: "Saving like a pro. Future you says thanks.", howTo: "40–80% of your pace" },
  balanced: { emoji: "⚖️", name: "Balanced Arc", line: "Right on track: enjoying life without wrecking the budget.", howTo: "80–105% of your pace" },
  hedon: { emoji: "🍾", name: "Hedon Arc", line: "Living your best life. A bit faster than planned, so slow down soon.", howTo: "105–140% of your pace" },
  chaos: { emoji: "🌪️", name: "Chaos Arc", line: "Main-character spending. Time for a comeback.", howTo: "Over 140% of your pace, or over budget" },
};

/** Order on the spectrum shown in the app (left = thrifty, right = spendy). */
export const SPECTRUM: ArcKey[] = ["monk", "frugal", "balanced", "hedon", "chaos"];

export const FLAVOURS: Record<CategoryKey, { emoji: string; name: string }> = {
  food: { emoji: "🍜", name: "Foodie" },
  transport: { emoji: "🚇", name: "Commuter" },
  household: { emoji: "🪑", name: "Nesting" },
  toys: { emoji: "🧸", name: "Collector" },
  entertainment: { emoji: "🎮", name: "Gamer" },
  shopping: { emoji: "🛍", name: "Shopaholic" },
  travel: { emoji: "✈️", name: "Traveler" },
  other: { emoji: "📦", name: "Mystery" },
};

/** Pace = how fast you spend compared with your allowance (1 = exactly on plan). */
export function paceRatio(spentFen: number, allowancePerDayFen: number, daysCounted: number): number | null {
  if (allowancePerDayFen <= 0 || daysCounted <= 0) return null;
  return spentFen / (allowancePerDayFen * daysCounted);
}

export function arcForPace(pace: number | null, opts: { overBudget?: boolean; earlyInMonth?: boolean } = {}): ArcKey {
  if (opts.overBudget) return "chaos";
  if (opts.earlyInMonth || pace === null) return "fresh";
  if (pace < 0.4) return "monk";
  if (pace <= 0.8) return "frugal";
  if (pace <= 1.05) return "balanced";
  if (pace <= 1.4) return "hedon";
  return "chaos";
}

/** A category that makes up at least 45% of spending (and at least ¥100) flavours the arc. */
export function flavourFor(byCategory: { key: CategoryKey; fen: number }[]): CategoryKey | null {
  const total = byCategory.reduce((s, c) => s + Math.max(0, c.fen), 0);
  const top = [...byCategory].sort((a, b) => b.fen - a.fen)[0];
  if (!top || total <= 0 || top.fen < 10000) return null;
  return top.fen / total >= 0.45 ? top.key : null;
}

/** Daily allowance for a day: the default budget spread over that month's days. */
export function allowanceForDay(date: ISODate, defaultBudgetFen: number): number {
  return Math.floor(defaultBudgetFen / daysInMonthOf(date));
}

/**
 * Days in a row (counting back from today) spent within the daily allowance.
 * Today counts if it's within so far; if today is already over, the streak is 0.
 */
export function withinStreak(daily: Map<ISODate, number>, today: ISODate, trackingStart: ISODate, defaultBudgetFen: number): number {
  let streak = 0;
  for (let d = today; d >= trackingStart; d = addDays(d, -1)) {
    if ((daily.get(d) ?? 0) > allowanceForDay(d, defaultBudgetFen)) break;
    streak++;
  }
  return streak;
}

/** Days with no personal spending at all, from `from` (or tracking start) to today. */
export function noSpendDays(daily: Map<ISODate, number>, from: ISODate, today: ISODate, trackingStart: ISODate): number {
  let count = 0;
  for (let d = maxDate(from, trackingStart); d <= today; d = addDays(d, 1)) if ((daily.get(d) ?? 0) <= 0) count++;
  return count;
}

/** "Comeback": last month you ran hot (over 105% or over budget), this month you're back at or under 90%. */
export function isComeback(previousPace: number | null, currentPace: number | null): boolean {
  return previousPace !== null && currentPace !== null && previousPace > 1.05 && currentPace <= 0.9;
}

const BANDS: Record<Exclude<ArcKey, "fresh">, [number, number]> = {
  monk: [0, 0.4],
  frugal: [0.4, 0.8],
  balanced: [0.8, 1.05],
  hedon: [1.05, 1.4],
  chaos: [1.4, 2],
};

/** Marker position (2–98%) on the Monk → Chaos bar; each arc gets an equal fifth. */
export function spectrumPosition(pace: number | null): number {
  if (pace === null) return 50;
  const arc = arcForPace(pace);
  if (arc === "fresh") return 50;
  const [lo, hi] = BANDS[arc];
  const within = Math.min(1, Math.max(0, (pace - lo) / (hi - lo)));
  return Math.max(2, Math.min(98, ((SPECTRUM.indexOf(arc) + within) / SPECTRUM.length) * 100));
}
