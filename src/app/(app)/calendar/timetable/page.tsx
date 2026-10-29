import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRight, PinIcon } from "@/components/icons";
import { ClassForm, PasteClassesForm, SemesterForm } from "@/components/timetable-forms";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listClasses, listSemesters } from "@/lib/data/calendar";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { classStatus, currentWeek, formatWeeks } from "@/lib/timetable";

export const metadata: Metadata = { title: "Timetable · Pulse" };

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function TimetablePage() {
  const { supabase, user } = await requireUser();
  const [settings, semesters, classes] = await Promise.all([getSettings(supabase, user.id), listSemesters(supabase), listClasses(supabase)]);
  const today = todayIn(settings.timezone);
  const now = currentWeek(semesters, today);
  // Show the running semester, or else the newest one.
  const semester = now?.semester ?? semesters[0] ?? null;
  const mine = classes.filter((c) => c.semesterId === semester?.id);

  return (
    <>
      <BackLink href="/calendar" label="Calendar" />
      <PageHeader title="Timetable" eyebrow={semester?.name} />
      {semester && (
        <p className="-mt-2 text-sm text-muted">
          {now ? `Week ${now.week} of ${semester.weeks}` : `Week 1 starts ${semester.startDate}`} · official days off cancel classes automatically
        </p>
      )}

      {semester ? (
        <>
          <details className="rounded-2xl border border-line bg-surface shadow-card" open={mine.length === 0}>
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold text-accent">📋 Paste your whole timetable</summary>
            <div className="px-4 pb-4">
              <PasteClassesForm semesterId={semester.id} />
            </div>
          </details>
          <details className="group rounded-2xl border border-line bg-surface shadow-card">
            <summary className="flex min-h-12 cursor-pointer list-none items-center px-4 text-sm font-semibold text-accent">＋ Add a class</summary>
            <div className="px-4 pb-4">
              <ClassForm semesterId={semester.id} />
            </div>
          </details>
          {DAYS.map((name, i) => {
            const day = mine.filter((c) => c.weekday === i + 1);
            if (day.length === 0) return null;
            return (
              <section key={name}>
                <h2 className="text-sm font-semibold text-muted">{name}</h2>
                <ul className="mt-2 divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
                  {day.map((c) => {
                    const status = classStatus(c.weeks, now?.week ?? null);
                    return (
                      <li key={c.id}>
                        <Link href={`/calendar/timetable/${c.id}`} className="flex items-center justify-between gap-3 px-4 py-3">
                          <div className="min-w-0">
                            <p className={`tabular text-xs font-semibold ${status.running ? "text-accent" : "text-muted"}`}>
                              {c.startTime}–{c.endTime}
                              {status.label && <span className="ml-2 font-medium">· {status.label}</span>}
                            </p>
                            <p className={`font-medium [overflow-wrap:anywhere] ${status.running ? "" : "text-muted"}`}>{c.title}</p>
                            <p className="flex flex-wrap items-center gap-x-1 text-xs text-muted [overflow-wrap:anywhere]">
                              {c.room && (
                                <span className="inline-flex items-center gap-0.5">
                                  <PinIcon size={12} /> {c.room} ·
                                </span>
                              )}
                              {[c.titleZh, c.teacher, `weeks ${formatWeeks(c.weeks)}`].filter(Boolean).join(" · ")}
                            </p>
                          </div>
                          <ChevronRight className="text-muted" />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </>
      ) : (
        <Card>
          <Label>First, your semester</Label>
          <p className="mb-4 mt-1 text-sm text-muted">Week numbers on your timetable count from this Monday.</p>
          <SemesterForm />
        </Card>
      )}
    </>
  );
}
