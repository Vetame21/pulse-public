"use client";

import Link from "next/link";
import { useState } from "react";
import { CakeIcon, ClassIcon, DeadlineIcon, PinIcon } from "./icons";

export type MonthDay = {
  date: string;
  dayNumber: number;
  lunar: string; // 初八, or the month name on the 1st
  festival: string | null; // 中秋节…
  holiday: { name: string; off: boolean } | null; // off=false: 调休 make-up workday
  holidayStart: boolean; // first day of a run of days off (the name is shown only there)
  weekend: boolean;
  isToday: boolean;
  heading: string; // "Sat 17 Oct"
  lunarFull: string; // "九月初八"
  events: { id: string; title: string; time: string | null; location: string | null; deadline: boolean; done: boolean }[];
  classes: { key: string; title: string; time: string; room: string | null }[];
  birthdays: { name: string; inMemory: boolean; turns: number | null }[];
  inSemester: boolean; // a 调休 workday during term: classes follow the school's notice
};

export function MonthCalendar({ weeks, initial }: { weeks: (MonthDay | null)[][]; initial: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  const day = weeks.flat().find((d) => d?.date === selected) ?? null;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Month calendar">
        {weeks.flat().map((d, i) => {
          if (d === null) return <span key={`pad-${i}`} aria-hidden />;
          const off = d.holiday?.off === true;
          const workday = d.holiday?.off === false;
          // Red for official days off and weekends (unless a 调休 workday), as on Chinese calendars.
          const ink = off || (d.weekend && !workday) ? "text-danger" : "";
          const sub = off && d.holidayStart ? d.holiday!.name : d.festival ?? d.lunar;
          return (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelected(d.date)}
              aria-pressed={selected === d.date}
              aria-label={`${d.heading}, ${d.lunarFull}${d.holiday ? `, ${d.holiday.name} ${d.holiday.off ? "holiday" : "make-up workday"}` : ""}${d.events.length ? `, ${d.events.length} event${d.events.length > 1 ? "s" : ""}` : ""}`}
              className={`relative flex aspect-square min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg p-0.5 leading-none ${
                off ? "bg-danger-soft" : ""
              } ${selected === d.date ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""}`}
            >
              {workday && <span className="absolute right-0.5 top-0.5 text-[10px] font-semibold leading-none text-warning">班</span>}
              {off && <span className="absolute right-0.5 top-0.5 text-[10px] font-semibold leading-none text-danger">休</span>}
              <span
                className={`tabular flex h-6 w-6 items-center justify-center rounded-full text-sm font-medium ${
                  d.isToday ? "bg-accent text-on-accent" : ink
                }`}
              >
                {d.dayNumber}
              </span>
              <span className={`max-w-full truncate text-[11px] leading-tight ${d.festival || (off && d.holidayStart) ? "font-medium text-danger" : off ? "text-danger" : "text-muted"}`}>{sub}</span>
              <span className="flex h-1.5 items-center gap-0.5" aria-hidden>
                {d.events.slice(0, 3).map((e) => (
                  <span key={e.id} className={`h-1.5 w-1.5 rounded-full ${e.deadline ? "bg-danger" : "bg-accent"}`} />
                ))}
                {d.birthdays.length > 0 && <span className={`h-1.5 w-1.5 rounded-full ${d.birthdays.some((b) => !b.inMemory) ? "bg-warning" : "bg-muted"}`} />}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 flex flex-wrap justify-center gap-x-3 gap-y-1 text-xs text-muted" aria-hidden>
        <span>
          <span className="font-semibold text-danger">休</span> day off
        </span>
        <span>
          <span className="font-semibold text-warning">班</span> make-up day
        </span>
        {(
          [
            ["bg-accent", "event"],
            ["bg-danger", "deadline"],
            ["bg-warning", "birthday"],
          ] as const
        ).map(([color, text]) => (
          <span key={text} className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${color}`} /> {text}
          </span>
        ))}
      </p>

      {day && (
        <div className="mt-4 rounded-xl border border-line p-4" aria-live="polite">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-semibold">{day.heading}</p>
            <p className="text-xs text-muted">农历 {day.lunarFull}</p>
          </div>
          {(day.holiday || day.festival) && (
            <p className={`mt-2 text-sm ${day.holiday?.off === false ? "text-warning" : "text-danger"}`}>
              {day.holiday
                ? day.holiday.off
                  ? `🇨🇳 ${day.holiday.name}: public holiday`
                  : `💼 Make-up workday for ${day.holiday.name} (调休): normal work/class day`
                : null}
              {day.holiday && day.festival && day.festival !== day.holiday.name ? " · " : null}
              {day.festival && day.festival !== day.holiday?.name ? `🏮 ${day.festival}` : null}
            </p>
          )}
          {day.birthdays.map((b) => (
            <p key={b.name} className="mt-2 flex items-center gap-2 text-sm">
              {b.inMemory ? (
                `🕯️ Remembering ${b.name}`
              ) : (
                <>
                  <CakeIcon className="text-warning" /> {b.name}&apos;s birthday{b.turns !== null ? ` (${b.turns})` : ""}
                </>
              )}
            </p>
          ))}
          {day.holiday?.off === false && day.inSemester && (
            <p className="mt-2 text-xs text-muted">Make-up day: your school says which weekday&apos;s classes run, so they aren&apos;t shown.</p>
          )}
          {day.classes.length > 0 && (
            <ul className="mt-2 divide-y divide-line">
              {day.classes.map((c) => (
                <li key={c.key}>
                  <Link href="/calendar/timetable" className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      <ClassIcon className="mt-0.5 text-accent" />
                      <span className="min-w-0">
                        <span className="block truncate">{c.title}</span>
                        {c.room && (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <PinIcon size={12} /> {c.room}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-muted">{c.time}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          {day.events.length === 0 && day.classes.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nothing planned.</p>
          ) : day.events.length === 0 ? null : (
            <ul className="mt-2 divide-y divide-line">
              {day.events.map((e) => (
                <li key={e.id}>
                  <Link href={`/calendar/${e.id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
                    <span className="flex min-w-0 items-start gap-2">
                      {e.deadline && <DeadlineIcon className="mt-0.5 text-danger" />}
                      <span className="min-w-0">
                        <span className={`block truncate font-medium ${e.done ? "text-muted line-through" : ""}`}>{e.title}</span>
                        {e.location && (
                          <span className="flex items-center gap-1 text-xs text-muted">
                            <PinIcon size={12} /> {e.location}
                          </span>
                        )}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-xs text-muted">{e.deadline ? `Due${e.time ? ` ${e.time}` : ""}` : e.time ?? "All day"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href={`/calendar/new?date=${day.date}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-accent">
            ＋ Add event
          </Link>
        </div>
      )}
    </div>
  );
}
