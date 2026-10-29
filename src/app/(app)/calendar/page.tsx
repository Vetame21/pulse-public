import type { Metadata } from "next";
import Link from "next/link";
import { CakeIcon, ChevronLeft, ChevronRight, ClassIcon } from "@/components/icons";
import { type MonthDay, MonthCalendar } from "@/components/month-calendar";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { monthGrid } from "@/lib/calendar";
import { eventsOnDay, holidayFor, lunarInfo } from "@/lib/china-calendar";
import { upcomingBirthdays } from "@/lib/briefing";
import { listBirthdays, listClasses, listEvents, listSemesters, regionHolidays } from "@/lib/data/calendar";
import { getSettings } from "@/lib/data/settings";
import { classesOn, weekOf } from "@/lib/timetable";
import { addDays, addMonths, formatMonth, isValidISODate, monthEnd, monthStart, parseISODate, todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Calendar · Pulse" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const today = todayIn(settings.timezone);
  const current = monthStart(today);
  const monthParam = one(params.month);
  const month = monthParam && isValidISODate(`${monthParam}-01`) ? `${monthParam}-01` : current;
  const dayParam = one(params.day);
  const initial = dayParam && isValidISODate(dayParam) && monthStart(dayParam) === month ? dayParam : month === current ? today : null;

  const year = parseISODate(month).year;
  const [events, holidays, semesters, classes, birthdays] = await Promise.all([
    listEvents(supabase, month, monthEnd(month)),
    regionHolidays(settings.region, [year]),
    listSemesters(supabase),
    listClasses(supabase),
    listBirthdays(supabase),
  ]);

  const weeks = monthGrid(month).map((week) =>
    week.map((date, i): MonthDay | null => {
      if (!date) return null;
      const lunar = lunarInfo(date);
      const holiday = holidayFor(date, holidays);
      const before = holidayFor(addDays(date, -1), holidays);
      return {
        date,
        dayNumber: parseISODate(date).day,
        lunar: lunar.label,
        festival: lunar.festival ?? null,
        holiday,
        holidayStart: !!holiday?.off && !(before?.off && before.name === holiday.name),
        weekend: i >= 5,
        isToday: date === today,
        heading: new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
        lunarFull: `${lunar.monthName}${lunar.dayName}`,
        events: eventsOnDay(events, date).map((e) => ({
          id: e.id,
          title: e.title,
          time: e.startTime ? (e.endTime ? `${e.startTime}–${e.endTime}` : e.startTime) : null,
          location: e.location,
          deadline: e.kind === "deadline",
          done: e.done,
        })),
        classes: classesOn(date, semesters, classes, holidays).map((c) => ({ key: c.id, title: c.title, time: `${c.startTime}–${c.endTime}`, room: c.room })),
        birthdays: upcomingBirthdays(birthdays, date, 0).map((b) => ({ name: b.name, inMemory: b.inMemory, turns: b.turns })),
        inSemester: semesters.some((s) => weekOf(s, date) !== null),
      };
    }),
  );

  const link = (m: string) => (m === current ? "/calendar" : `/calendar?month=${m.slice(0, 7)}`);
  const noHolidayData = holidays.length === 0;

  return (
    <>
      <PageHeader
        title="Calendar"
        eyebrow={(() => {
          const s = semesters.find((x) => weekOf(x, today) !== null);
          return s ? `Week ${weekOf(s, today)}` : undefined;
        })()}
        action={
          <Link href={`/calendar/new?date=${initial ?? month}`} className="flex h-10 items-center rounded-full bg-accent px-4 text-sm font-semibold text-on-accent shadow-card">
            ＋ Event
          </Link>
        }
      />
      <Card>
        <div className="flex items-center justify-between">
          <Link href={link(addMonths(month, -1))} className="-ml-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-track" aria-label="Previous month">
            <ChevronLeft size={20} />
          </Link>
          <div className="text-center">
            <p className="text-sm font-semibold">{formatMonth(month)}</p>
            {month !== current && (
              <Link href="/calendar" className="text-xs font-medium text-accent">
                Back to today
              </Link>
            )}
          </div>
          <Link href={link(addMonths(month, 1))} className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-muted active:bg-track" aria-label="Next month">
            <ChevronRight size={20} />
          </Link>
        </div>
        <div className="mt-4">
          <MonthCalendar key={month} weeks={weeks} initial={initial} />
        </div>
        {noHolidayData && (
          <p className="mt-3 text-xs text-muted">China hasn&apos;t published the {year} holiday schedule yet (usually announced in November). It&apos;ll appear here automatically.</p>
        )}
      </Card>
      <nav aria-label="Calendar lists" className="grid grid-cols-2 gap-3">
        <Link href="/calendar/timetable" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm font-semibold shadow-card">
          <ClassIcon size={20} className="text-accent" />
          <span>
            Timetable
            <span className="block text-xs font-normal text-muted">{classes.length} classes</span>
          </span>
        </Link>
        <Link href="/calendar/birthdays" className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm font-semibold shadow-card">
          <CakeIcon size={20} className="text-warning" />
          <span>
            Birthdays
            <span className="block text-xs font-normal text-muted">{birthdays.length} people</span>
          </span>
        </Link>
      </nav>
    </>
  );
}
