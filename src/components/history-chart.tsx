"use client";

import { useState } from "react";

export type ChartBar = {
  key: string;
  value: number; // fen, drives the bar height
  state: "data" | "untracked" | "future";
  valueText: string; // "¥30.00"
  label: string; // "Sun 11 Oct" / "September 2026"
  tick: string | null; // x-axis label under this bar, if any
  note?: string; // e.g. "partial month · 3 days tracked"
};

/**
 * Single-series column chart in the style of iPhone Health: tap (or focus) a
 * bar to read its value; a reference line marks the average. Every value is
 * also listed in the table below the chart, so nothing depends on tapping.
 */
export function HistoryChart({
  bars,
  axisMax,
  refValue,
  refText,
  emptyText,
  symbol,
}: {
  bars: ChartBar[];
  axisMax: number;
  refValue: number | null;
  refText: string | null;
  emptyText: string;
  symbol: string; // "¥" or "HK$" for the axis labels
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const sel = bars.find((b) => b.key === selected) ?? null;
  const pct = (v: number) => `${Math.min(100, (v / axisMax) * 100)}%`;
  const ticks = [axisMax, axisMax / 2, 0];
  const yuan = (fen: number) => `${symbol}${(fen / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  const hasData = bars.some((b) => b.state === "data");

  return (
    <div>
      <div className="mb-3 flex h-10 items-center rounded-xl bg-track/60 px-3 text-sm" aria-live="polite">
        {sel ? (
          <span>
            <span className="tabular font-semibold">{sel.state === "data" ? sel.valueText : "—"}</span>
            <span className="text-muted">
              {" "}
              · {sel.label}
              {sel.state === "untracked" && " · before tracking started"}
              {sel.state === "future" && " · not yet"}
              {sel.note && ` · ${sel.note}`}
            </span>
          </span>
        ) : (
          <span className="text-muted">{hasData ? "Tap a bar to see its amount" : emptyText}</span>
        )}
      </div>

      <div className="flex">
        <div className="relative h-48 flex-1">
          {/* gridlines: hairline, solid, recessive */}
          {ticks.map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-line" style={{ bottom: pct(t) }} aria-hidden />
          ))}

          {/* average reference line */}
          {refValue !== null && refValue > 0 && (
            <div className="pointer-events-none absolute inset-x-0 z-10" style={{ bottom: pct(refValue) }} aria-hidden>
              <div className="h-[1.5px] bg-foreground/45" />
              {refText && (
                <span className="tabular absolute -top-[1.35rem] left-0 rounded-md bg-surface px-1.5 text-[11px] font-medium text-muted">
                  {refText}
                </span>
              )}
            </div>
          )}

          <div className="absolute inset-0 flex items-end gap-[2px]" role="group" aria-label="Spending per bar">
            {bars.map((b) => {
              const isSel = selected === b.key;
              return (
                <button
                  key={b.key}
                  type="button"
                  aria-label={`${b.label}: ${b.state === "data" ? b.valueText : b.state === "future" ? "not yet" : "not tracked"}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(isSel ? null : b.key)}
                  onFocus={() => setSelected(b.key)}
                  className="flex h-full min-w-0 flex-1 items-end justify-center outline-none focus-visible:bg-track/70"
                >
                  {b.state === "data" && b.value > 0 && (
                    <span
                      className={`block w-full max-w-6 rounded-t-[4px] bg-chart transition-opacity ${
                        selected && !isSel ? "opacity-35" : ""
                      }`}
                      style={{ height: pct(b.value), minHeight: 2 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* y-axis labels on the right, like Health */}
        <div className="relative h-48 w-11 shrink-0" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className="tabular absolute right-0 translate-y-1/2 text-[11px] text-muted" style={{ bottom: pct(t) }}>
              {yuan(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="mr-11 mt-1.5 flex gap-[2px]" aria-hidden>
        {bars.map((b) => (
          <span key={b.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center text-[11px] text-muted">
            {b.tick ?? ""}
          </span>
        ))}
      </div>
    </div>
  );
}
