// Notices board rules: what's archived, and what Today shows.

import { type ISODate, addDays } from "./dates";

export type Notice = {
  id: string;
  body: string;
  source: string | null; // e.g. "CS class group"; null = your own note
  pinned: boolean;
  relatedDate: ISODate | null; // the day it's about (set when you add it to the calendar)
  linkedEventId: string | null;
  archived: boolean; // archived by hand
  createdDate: ISODate; // in your timezone
};

export const ARCHIVE_AFTER_DAYS = 14;

/**
 * Archived when you archived it, or (unless pinned) once the day it's about has
 * passed, or 14 days after it was added if it isn't about a particular day.
 */
export function isArchived(n: Notice, today: ISODate): boolean {
  if (n.archived) return true;
  if (n.pinned) return false;
  if (n.relatedDate) return n.relatedDate < today;
  return addDays(n.createdDate, ARCHIVE_AFTER_DAYS) < today;
}

/** Today shows pinned notices and ones added in the last 2 days (newest first, at most 3). */
export function noticesForToday(list: Notice[], today: ISODate): Notice[] {
  return list
    .filter((n) => !isArchived(n, today) && (n.pinned || n.createdDate >= addDays(today, -1)))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdDate.localeCompare(a.createdDate))
    .slice(0, 3);
}
