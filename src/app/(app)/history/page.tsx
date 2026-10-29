import type { Metadata } from "next";
import Link from "next/link";
import { type ChartBar, HistoryChart } from "@/components/history-chart";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDailyTotals } from "@/lib/data/history";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, isValidISODate, parseISODate, todayIn } from "@/lib/dates";
import {
  type Bar,
  type History,
  type HistoryRange,
  HISTORY_RANGES,
  buildHistory,
  compareWithPrevious,
  niceAxisMax,
  periodBounds,
  shiftAnchor,
} from "@/lib/history";
import { HOME_SYMBOL, moneyFormat } from "@/lib/money";

export const metadata: Metadata = { title: "History · Pulse" };

const RANGE_NAMES: Record<HistoryRange, { tab: string; long: string; previous: string }> = {
  W: { tab: "W", long: "Week", previous: "previous week" },
  M: { tab: "M", long: "Month", previous: "previous month" },
  "6M": { tab: "6M", long: "6 months", previous: "previous 6 months" },
  Y: { tab: "Y", long: "Year", previous: "previous 12 months" },
};

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

function dayLabel(date: string, withWeekday = true) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    ...(withWeekday ? { weekday: "short" } : {}),
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

function shortMonth(date: string, withYear = false) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

function periodLabel(h: History) {
  if (h.range === "M") return formatMonth(h.start);
  if (h.range === "W") return `${dayLabel(h.start, false)} – ${dayLabel(h.end, false)} ${parseISODate(h.end).year}`;
  return `${shortMonth(h.start, true)} – ${shortMonth(h.end, true)}`;
}

function tick(range: HistoryRange, bar: Bar): string | null {
  const { day } = parseISODate(bar.key);
  if (range === "W") return dayLabel(bar.key).split(" ")[0]; // Mon, Tue…
  if (range === "M") return [1, 8, 15, 22, 29].includes(day) ? String(day) : null;
  if (range === "6M") return shortMonth(bar.key);
  return shortMonth(bar.key).slice(0, 1); // J, F, M…
}

function Change({ value, suffix }: { value: number | null; suffix: string }) {
  if (value === null) return <span className="text-muted">no earlier data</span>;
  if (value === 0) return <span className="text-muted">no change {suffix}</span>;
  // More spending is the "bad" direction.
  return (
    <span className={value > 0 ? "text-danger" : "text-accent"}>
      {value > 0 ? "↑" : "↓"} {Math.abs(value).toFixed(1)}% {value > 0 ? "more" : "less"} {suffix}
    </span>
  );
}

export default async function HistoryPage({ searchParams }: PageProps<"/history">) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);

  const rangeParam = one(params.range);
  const range: HistoryRange = HISTORY_RANGES.includes(rangeParam as HistoryRange) ? (rangeParam as HistoryRange) : "M";
  const anchorParam = one(params.anchor);
  let anchor = anchorParam && isValidISODate(anchorParam) && anchorParam <= today ? anchorParam : today;
  if (periodBounds(range, anchor).end < settings.trackingStartDate) anchor = settings.trackingStartDate;
  const monthMode = one(params.mode) === "avg" ? "avg" : "total";

  const previousStart = periodBounds(range, shiftAnchor(range, anchor, -1)).start;
  const daily = await getDailyTotals(supabase, previousStart, periodBounds(range, anchor).end);

  const ctx = { anchor, today, trackingStart: settings.trackingStartDate, daily };
  const h = buildHistory({ ...ctx, range });
  const cmp = compareWithPrevious(h, ctx);

  const useAvg = h.unit === "month" && monthMode === "avg";
  const barValue = (b: Bar) => (useAvg ? b.avgPerDayFen : b.totalFen);
  const chartBars: ChartBar[] = h.bars.map((b) => ({
    key: b.key,
    value: barValue(b),
    state: b.state,
    valueText: useAvg ? `${fmt(b.avgPerDayFen)}/day` : fmt(b.totalFen),
    label: h.unit === "day" ? dayLabel(b.key) : formatMonth(b.key),
    tick: tick(range, b),
    note:
      h.unit === "month" && b.state === "data"
        ? `${useAvg ? `total ${fmt(b.totalFen)}` : `${fmt(b.avgPerDayFen)}/day`}${b.partial ? ` · ${b.countedDays} days tracked` : ""}`
        : undefined,
  }));
  const refValue = h.unit === "day" ? h.avgPerDayFen : useAvg ? h.avgPerDayFen : h.avgPerMonthFen;
  const refText = refValue > 0 ? `avg ${fmt(refValue)}${h.unit === "day" || useAvg ? "/day" : "/month"}` : null;
  const axisMax = niceAxisMax(Math.max(refValue, ...chartBars.filter((b) => b.state === "data").map((b) => b.value)));

  const link = (o: Partial<{ range: HistoryRange; anchor: string; mode: string }>) => {
    const sp = new URLSearchParams();
    const merged = { range, anchor: anchor === today ? undefined : anchor, mode: monthMode === "avg" ? "avg" : undefined, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/history?${sp.toString()}`;
  };
  const prevAnchor = shiftAnchor(range, anchor, -1);
  const nextAnchor = shiftAnchor(range, anchor, 1);
  const canPrev = periodBounds(range, prevAnchor).end >= settings.trackingStartDate;
  const canNext = periodBounds(range, nextAnchor).start <= today;
  const nextHref = link({ anchor: periodBounds(range, nextAnchor).end >= today ? undefined : nextAnchor });

  return (
    <>
      <BackLink href="/money" label="Money" />
      <PageHeader title="Spending history" eyebrow="Personal" />

      <nav aria-label="Range" className="grid grid-cols-4 gap-1 rounded-xl bg-track p-1">
        {HISTORY_RANGES.map((r) => (
          <Link
            key={r}
            href={link({ range: r, anchor: undefined })}
            aria-label={RANGE_NAMES[r].long}
            aria-current={r === range ? "page" : undefined}
            className={`flex h-9 items-center justify-center rounded-lg text-sm font-semibold ${
              r === range ? "bg-surface text-foreground shadow-card" : "text-muted"
            }`}
          >
            {RANGE_NAMES[r].tab}
          </Link>
        ))}
      </nav>

      <Card>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label>Total</Label>
            <p className="mt-1 text-4xl font-semibold tracking-tight">{fmt(h.totalFen)}</p>
          </div>
          <div className="text-right">
            <Label>Avg / day</Label>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{fmt(h.avgPerDayFen)}</p>
            <p className="text-xs text-muted">
              over {h.countedDays} tracked day{h.countedDays === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between">
          {canPrev ? (
            <Link href={link({ anchor: prevAnchor })} className="h-9 px-2 text-lg leading-9 text-muted" aria-label="Previous period">
              ‹
            </Link>
          ) : (
            <span className="w-7" />
          )}
          <p className="text-sm font-medium">{periodLabel(h)}</p>
          {canNext ? (
            <Link href={nextHref} className="h-9 px-2 text-lg leading-9 text-muted" aria-label="Next period">
              ›
            </Link>
          ) : (
            <span className="w-7" />
          )}
        </div>

        {h.unit === "month" && (
          <div className="mt-2 flex justify-center gap-1 text-xs">
            {(["total", "avg"] as const).map((m) => (
              <Link
                key={m}
                href={link({ mode: m === "avg" ? "avg" : undefined })}
                aria-current={monthMode === m ? "true" : undefined}
                className={`rounded-full px-3 py-1 font-medium ${monthMode === m ? "bg-accent-soft text-foreground" : "text-muted"}`}
              >
                {m === "total" ? "Monthly total" : "Avg per day"}
              </Link>
            ))}
          </div>
        )}

        <div className="mt-4">
          <HistoryChart
              symbol={HOME_SYMBOL[settings.homeCurrency]}
            bars={chartBars}
            axisMax={axisMax}
            refValue={refValue}
            refText={refText}
            emptyText="No tracked days in this period."
          />
        </div>
      </Card>

      <Card>
        <Label>Compared with the {RANGE_NAMES[range].previous}</Label>
        <p className="mt-1 text-xs text-muted">{periodLabel(cmp.previous)}</p>
        <dl className="mt-3 grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-2 text-sm">
          <dt />
          <dd className="text-right text-xs text-muted">Before</dd>
          <dd className="text-right text-xs text-muted">Now</dd>
          <dt className="text-muted">Avg per day</dt>
          <dd className="tabular text-right">{fmt(cmp.previous.avgPerDayFen)}</dd>
          <dd className="tabular text-right font-semibold">{fmt(h.avgPerDayFen)}</dd>
          <dt className="text-muted">Total</dt>
          <dd className="tabular text-right">{fmt(cmp.previous.totalFen)}</dd>
          <dd className="tabular text-right font-semibold">{fmt(h.totalFen)}</dd>
          <dt className="text-muted">Tracked days</dt>
          <dd className="tabular text-right">{cmp.previous.countedDays}</dd>
          <dd className="tabular text-right">{h.countedDays}</dd>
        </dl>
        <p className="mt-3 text-sm">
          <Change value={cmp.avgPerDayChange} suffix="per day" />
        </p>
        {h.countedDays !== cmp.previous.countedDays && cmp.previous.countedDays > 0 && (
          <p className="mt-1 text-xs text-muted">
            Periods have different numbers of tracked days, so compare the average per day rather than the total.
          </p>
        )}
        {h.highest && (
          <p className="mt-3 border-t border-line pt-3 text-sm">
            <span className="text-muted">Highest {h.unit}: </span>
            <span className="font-medium">
              {h.unit === "day" ? dayLabel(h.highest.key) : formatMonth(h.highest.key)} · {fmt(h.highest.totalFen)}
            </span>
          </p>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold">Show as table</summary>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="py-1 font-medium">{h.unit === "day" ? "Day" : "Month"}</th>
                <th className="py-1 text-right font-medium">Total</th>
                {h.unit === "month" && <th className="py-1 text-right font-medium">Per day</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {h.bars
                .filter((b) => b.state === "data")
                .map((b) => (
                  <tr key={b.key}>
                    <td className="py-1.5">
                      {h.unit === "day" ? dayLabel(b.key) : formatMonth(b.key)}
                      {b.partial && <span className="text-xs text-muted"> · {b.countedDays} days</span>}
                    </td>
                    <td className="tabular py-1.5 text-right">{fmt(b.totalFen)}</td>
                    {h.unit === "month" && <td className="tabular py-1.5 text-right">{fmt(b.avgPerDayFen)}</td>}
                  </tr>
                ))}
            </tbody>
          </table>
        </details>
      </Card>

      <p className="px-1 text-center text-xs text-muted">
        Personal spending only (your monthly budget). Apartment, Family Money and restaurant credit use aren&apos;t included.
      </p>
    </>
  );
}
