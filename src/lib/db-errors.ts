// Turn database rule violations into messages a person can act on.

const MESSAGES: [RegExp, string][] = [
  [/SAVINGS_NEGATIVE/, "There isn't enough in the Savings Box for that."],
  [/MONTH_NOT_ENDED/, "This month hasn't ended yet. You can close it from the 1st of next month."],
  [/ALREADY_CLOSED/, "This month is already closed."],
  [/NOT_CLOSED/, "This month isn't closed."],
  [/Can't change where an expense was paid from/, "Can't change where an expense was paid from. Delete it and add it again."],
];

export function friendlyDbError(error: { message?: string } | null | undefined, fallback: string): string {
  const message = error?.message ?? "";
  return MESSAGES.find(([pattern]) => pattern.test(message))?.[1] ?? fallback;
}
