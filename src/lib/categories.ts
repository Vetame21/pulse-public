export const CATEGORIES = [
  { key: "food", label: "Food", emoji: "🍜" },
  { key: "transport", label: "Transport", emoji: "🚇" },
  { key: "household", label: "Furniture / Household", emoji: "🪑" },
  { key: "toys", label: "Toys / Collectibles", emoji: "🧸" },
  { key: "entertainment", label: "Entertainment", emoji: "🎮" },
  { key: "shopping", label: "Shopping", emoji: "🛍" },
  { key: "travel", label: "Travel", emoji: "✈️" },
  { key: "other", label: "Other", emoji: "📦" },
] as const;

export type CategoryKey = (typeof CATEGORIES)[number]["key"];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key) as [CategoryKey, ...CategoryKey[]];

export function category(key: string) {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}
