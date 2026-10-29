"use client";

import { useState } from "react";

export type CalendarDay = {
  date: string;
  dayNumber: number;
  state: "data" | "untracked" | "future";
  level: 0 | 1 | 2 | 3 | 4 | 5;
  label: string | null; // compact amount in the cell, e.g. "42.5"
  totalText: string; // "¥42.50"
  markers: string[]; // emojis for other accounts' activity that day
  items: { key: string; emoji: string; title: string; amountText: string; tag: string }[];
  heading: string; // "Mon 12 Oct"
};

const HEAT_BG = ["", "bg-[var(--heat-1)]", "bg-[var(--heat-2)]", "bg-[var(--heat-3)]", "bg-[var(--heat-4)]", "bg-[var(--heat-5)]"];
const HEAT_INK = ["", "text-[var(--heat-ink-low)]", "text-[var(--heat-ink-low)]", "text-[var(--heat-ink-low)]", "text-[var(--heat-ink-high)]", "text-[var(--heat-ink-high)]"];

export function SpendingCalendar({ weeks, initial }: { weeks: (CalendarDay | null)[][]; initial: string | null }) {
  const [selected, setSelected] = useState<string | null>(initial);
  const day = weeks.flat().find((d) => d?.date === selected) ?? null;

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-muted" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1" role="grid" aria-label="Spending calendar">
        {weeks.flat().map((d, i) =>
          d === null ? (
            <span key={`pad-${i}`} aria-hidden />
          ) : (
            <button
              key={d.date}
              type="button"
              onClick={() => setSelected(d.date)}
              aria-pressed={selected === d.date}
              aria-label={`${d.heading}: ${d.state === "data" ? d.totalText : d.state === "future" ? "not yet" : "not tracked"}`}
              className={`relative flex aspect-square flex-col items-center justify-between rounded-lg p-1 text-[11px] leading-none ${
                d.state !== "data" ? "text-muted/50" : d.level === 0 ? "bg-track/60" : `${HEAT_BG[d.level]} ${HEAT_INK[d.level]}`
              } ${selected === d.date ? "ring-2 ring-foreground ring-offset-1 ring-offset-surface" : ""}`}
            >
              <span className="self-start font-medium">{d.dayNumber}</span>
              {d.label && <span className="tabular font-semibold">{d.label}</span>}
              <span className="h-3 text-[9px]">{d.markers.slice(0, 3).join("")}</span>
            </button>
          ),
        )}
      </div>

      <div className="mt-3 flex items-center justify-end gap-1 text-[11px] text-muted" aria-hidden>
        <span>None</span>
        <span className="h-3 w-3 rounded-sm bg-track/60" />
        {[1, 2, 3, 4, 5].map((l) => (
          <span key={l} className={`h-3 w-3 rounded-sm ${HEAT_BG[l]}`} />
        ))}
        <span>Over 2× daily allowance</span>
      </div>

      {day && (
        <div className="mt-4 rounded-xl border border-line p-4" aria-live="polite">
          <div className="flex items-baseline justify-between">
            <p className="text-sm font-semibold">{day.heading}</p>
            <p className="tabular text-sm font-semibold">{day.state === "data" ? day.totalText : ""}</p>
          </div>
          {day.state === "untracked" ? (
            <p className="mt-2 text-sm text-muted">Before tracking started.</p>
          ) : day.state === "future" ? (
            <p className="mt-2 text-sm text-muted">Not yet.</p>
          ) : day.items.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No spending. A no-spend day 🎉</p>
          ) : (
            <ul className="mt-2 divide-y divide-line">
              {day.items.map((it) => (
                <li key={it.key} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span aria-hidden>{it.emoji}</span> {it.title}
                    <span className="text-xs text-muted"> · {it.tag}</span>
                  </span>
                  <span className="tabular shrink-0">{it.amountText}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
