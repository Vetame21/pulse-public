import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight } from "@/components/icons";
import { BirthdayForm } from "@/components/timetable-forms";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { upcomingBirthdays } from "@/lib/briefing";
import { listBirthdays } from "@/lib/data/calendar";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Birthdays · Pulse" };

const monthName = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

export default async function BirthdaysPage() {
  const { supabase, user } = await requireUser();
  const [settings, list] = await Promise.all([getSettings(supabase, user.id), listBirthdays(supabase)]);
  const today = todayIn(settings.timezone);
  const sorted = upcomingBirthdays(list, today, 366); // everyone, soonest first

  // Grouped by the month of each next birthday, starting from this month.
  const groups: { month: string; people: typeof sorted }[] = [];
  for (const b of sorted) {
    const m = monthName(b.date);
    const g = groups[groups.length - 1];
    if (g && g.month === m) g.people.push(b);
    else groups.push({ month: m, people: [b] });
  }

  return (
    <>
      <BackLink href="/calendar" label="Calendar" />
      <PageHeader title="Birthdays" eyebrow={`${list.length} people`} />
      <details className="rounded-2xl border border-line bg-surface shadow-card">
        <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold text-accent">＋ Add a birthday</summary>
        <div className="px-4 pb-4">
          <BirthdayForm />
        </div>
      </details>
      {groups.map((g) => (
        <section key={g.month}>
          <h2 className="text-sm font-semibold text-muted">{g.month}</h2>
          <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
            {g.people.map((b) => (
              <li key={b.id}>
                <Link href={`/calendar/birthdays/${b.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium [overflow-wrap:anywhere]">
                      {b.name}
                      {b.inMemory && <span className="ml-1.5 text-sm font-normal text-muted">🕯️ in memory</span>}
                    </p>
                    <p className="text-xs text-muted">
                      {new Date(`${b.date}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}
                      {b.turns !== null && !b.inMemory && ` · turns ${b.turns}`}
                      {" · "}
                      {b.inDays === 0 ? "today" : b.inDays === 1 ? "tomorrow" : `in ${b.inDays} days`}
                    </p>
                  </div>
                  <ChevronRight className="text-muted" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}
