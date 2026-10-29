import type { Metadata } from "next";
import Link from "next/link";
import { type ChartBar, HistoryChart } from "@/components/history-chart";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureRentBill, listRentPayments, listUtilityBills } from "@/lib/data/apartment";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, monthStart, todayIn } from "@/lib/dates";
import { niceAxisMax } from "@/lib/history";
import { HOME_SYMBOL, moneyFormat, percentChange } from "@/lib/money";
import { monthlyAverageFen, rentForPeriod, rentMonths, utilityInsights, wholeMonthsCovered } from "@/lib/utilities";
import { MarkUtilityPaid, RentAmountForm, RentRow } from "./apartment-controls";

export const metadata: Metadata = { title: "Apartment · Pulse" };

function shortDate(d: string, year = false) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" });
}

function periodText(start: string, end: string) {
  const months = wholeMonthsCovered(start, end);
  if (months !== null) {
    const m = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" });
    return `${m(start)} – ${m(end)} ${end.slice(0, 4)}`;
  }
  return `${shortDate(start)} – ${shortDate(end, true)}`;
}

function Delta({ diffFen, pct, what, fmt }: { diffFen: number; pct: number | null; what: string; fmt: (cents: number) => string }) {
  if (diffFen === 0) return <span className="text-muted">Same as the previous period</span>;
  const up = diffFen > 0;
  return (
    <span className={up ? "text-danger" : "text-accent"}>
      {up ? "↑" : "↓"} {what} {up ? "increased" : "decreased"} {fmt(Math.abs(diffFen))}
      {pct !== null && ` (${Math.abs(pct).toFixed(1)}%)`}
    </span>
  );
}

export default async function ApartmentPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const billP = ensureRentBill(supabase, settings);
  const [bill, payments, utilities] = await Promise.all([
    billP,
    billP.then((b) => listRentPayments(supabase, b.id)),
    listUtilityBills(supabase),
  ]);
  const paidByMonth = new Map(payments.map((p) => [p.month, p]));

  // Rent months due so far, plus any months already paid in advance; newest first.
  const months = [...new Set([...rentMonths(bill.startsMonth, today), ...payments.map((p) => p.month)])].sort().reverse();
  const thisMonth = monthStart(today);
  const thisMonthPaid = paidByMonth.get(thisMonth);
  const unpaidCount = months.filter((m) => m <= thisMonth && !paidByMonth.has(m)).length;

  const insights = utilityInsights(utilities);
  const latest = insights?.latest ?? null;
  const latestRow = latest ? utilities.find((u) => u.periodStart === latest.periodStart && u.periodEnd === latest.periodEnd) ?? null : null;
  const utilMonthly = latest ? monthlyAverageFen(latest) : 0;
  const housingNow = bill.defaultAmountFen + utilMonthly;

  // Housing cost per bill period (rent of that time + that bill's monthly average)
  const housingPrev = insights?.previous
    ? rentForPeriod(payments, insights.previous.periodStart, insights.previous.periodEnd, bill.defaultAmountFen) + monthlyAverageFen(insights.previous)
    : null;
  const housingLatest = latest ? rentForPeriod(payments, latest.periodStart, latest.periodEnd, bill.defaultAmountFen) + utilMonthly : null;

  const chartBars: ChartBar[] = utilities.map((u) => ({
    key: u.id,
    value: monthlyAverageFen(u),
    state: "data",
    valueText: `${fmt(monthlyAverageFen(u))}/month`,
    label: periodText(u.periodStart, u.periodEnd),
    tick: new Date(`${u.periodStart}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    note: `bill ${fmt(u.totalFen)}`,
  }));
  const histAvg = insights?.historicalMonthlyFen ?? 0;

  return (
    <>
      <BackLink href="/accounts" label="Accounts" />
      <PageHeader title="Apartment" eyebrow="Housing" />

      {/* HOUSING COST */}
      <Card>
        <Label>Housing cost per month</Label>
        <p className="mt-2 text-4xl font-semibold tracking-tight">{fmt(housingNow)}</p>
        <div className="mt-4 flex flex-col gap-3 text-sm">
          {[
            ["🏠 Rent + management", bill.defaultAmountFen, "fixed"],
            ["⚡ Utilities (average)", utilMonthly, latest ? `from ${fmt(latest.totalFen)} / ${periodText(latest.periodStart, latest.periodEnd)}` : "no bill yet"],
          ].map(([name, fen, sub]) => (
            <div key={name as string}>
              <div className="flex items-baseline justify-between">
                <span>{name}</span>
                <span className="tabular font-medium">{fmt(fen as number)}</span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                <div className="h-full rounded-full bg-chart" style={{ width: `${housingNow ? ((fen as number) / housingNow) * 100 : 0}%` }} />
              </div>
              <p className="mt-1 text-xs text-muted">{sub as string}</p>
            </div>
          ))}
        </div>
        {housingPrev !== null && housingLatest !== null && (
          <div className="mt-4 rounded-xl bg-track/60 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Previous period</span>
              <span className="tabular">{fmt(housingPrev)}/month</span>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-muted">Latest period</span>
              <span className="tabular font-semibold">{fmt(housingLatest)}/month</span>
            </div>
            <p className="mt-2">
              <Delta fmt={fmt} diffFen={housingLatest - housingPrev} pct={percentChange(housingPrev, housingLatest)} what="Housing costs" />
            </p>
          </div>
        )}
      </Card>

      {/* RENT */}
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Rent + management</Label>
          <span className={`text-xs font-semibold ${thisMonthPaid ? "text-accent" : "text-warning"}`}>
            {formatMonth(thisMonth)}: {thisMonthPaid ? "Paid" : "Unpaid"}
          </span>
        </div>
        <p className="mt-2 text-3xl font-semibold tracking-tight">
          {fmt(bill.defaultAmountFen)}
          <span className="text-base font-normal text-muted">/month</span>
        </p>
        {unpaidCount > 0 && (
          <p className="mt-1 text-sm text-warning">
            {unpaidCount} month{unpaidCount === 1 ? "" : "s"} not marked as paid
          </p>
        )}
        <p className="mt-1 text-xs text-muted">Not part of your personal budget.</p>
        <ul className="mt-2 divide-y divide-line">
          {months.map((m) => {
            const p = paidByMonth.get(m);
            return (
              <RentRow
 currency={settings.homeCurrency}
                key={m}
                month={m}
                label={formatMonth(m)}
                payment={p ? { id: p.id, amountFen: p.amountFen, paidDate: p.paidDate } : null}
                defaultAmountFen={bill.defaultAmountFen}
                today={today}
              />
            );
          })}
        </ul>
        <details open={bill.defaultAmountFen === 0} className="mt-3 border-t border-line pt-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">{bill.defaultAmountFen === 0 ? "Set your monthly rent" : "Rent changed?"}</summary>
          <div className="mt-3">
            <RentAmountForm currentFen={bill.defaultAmountFen} />
          </div>
        </details>
      </Card>

      {/* UTILITIES */}
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Electricity + water</Label>
          <Link href="/accounts/apartment/utilities/new" className="text-sm font-semibold text-accent">
            + Add bill
          </Link>
        </div>

        {!latest || !latestRow || !insights ? (
          <p className="mt-3 text-sm text-muted">No bills yet. Add one when it arrives (usually every 3 months).</p>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted">Latest bill · {periodText(latest.periodStart, latest.periodEnd)}</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{fmt(latest.totalFen)}</p>
            <p className="text-sm text-muted">
              ≈ {fmt(insights.latestMonthlyFen)}/month
              {latestRow.electricityFen !== null && ` · ⚡ ${fmt(latestRow.electricityFen)}`}
              {latestRow.waterFen !== null && ` · 💧 ${fmt(latestRow.waterFen)}`}
            </p>
            {latestRow.paidDate ? (
              <p className="mt-2 text-sm text-accent">✓ Paid {shortDate(latestRow.paidDate, true)}</p>
            ) : (
              <div className="mt-2">
                <span className="rounded-full bg-warning-soft px-2.5 py-1 text-xs font-semibold text-warning">Unpaid</span>
                <MarkUtilityPaid id={latestRow.id} today={today} />
              </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
              {insights.previous && insights.comparison && (
                <div className="col-span-2 rounded-xl bg-track/60 p-3">
                  <dt className="text-xs text-muted">vs previous bill ({fmt(insights.previous.totalFen)}, {periodText(insights.previous.periodStart, insights.previous.periodEnd)})</dt>
                  <dd className="mt-1">
                    <Delta fmt={fmt} diffFen={insights.comparison.totalDiffFen} pct={insights.comparison.percent} what="Utilities" />
                  </dd>
                  {insights.comparison.totalDiffFen !== insights.comparison.monthlyDiffFen && (
                    <dd className="mt-1 text-xs text-muted">
                      Per month: {fmt(insights.comparison.monthlyDiffFen, { sign: true })} (fairer when periods differ in length)
                    </dd>
                  )}
                </div>
              )}
              <div>
                <dt className="text-xs text-muted">Average per month (all bills)</dt>
                <dd className="tabular font-medium">{fmt(insights.historicalMonthlyFen)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Next bill (expected)</dt>
                <dd className="font-medium">{periodText(insights.nextPeriod.start, insights.nextPeriod.end)}</dd>
              </div>
              {utilities.length > 1 && (
                <>
                  <div>
                    <dt className="text-xs text-muted">Highest</dt>
                    <dd className="tabular font-medium">
                      {fmt(monthlyAverageFen(insights.highest))}/mo · {periodText(insights.highest.periodStart, insights.highest.periodEnd)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Lowest</dt>
                    <dd className="tabular font-medium">
                      {fmt(monthlyAverageFen(insights.lowest))}/mo · {periodText(insights.lowest.periodStart, insights.lowest.periodEnd)}
                    </dd>
                  </div>
                </>
              )}
            </dl>

            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Monthly average per bill</p>
              <HistoryChart
              symbol={HOME_SYMBOL[settings.homeCurrency]}
                bars={chartBars}
                axisMax={niceAxisMax(Math.max(...chartBars.map((b) => b.value)))}
                refValue={utilities.length > 1 ? histAvg : null}
                refText={utilities.length > 1 ? `avg ${fmt(histAvg)}` : null}
                emptyText="No bills yet."
              />
            </div>

            <ul className="mt-4 divide-y divide-line border-t border-line">
              {[...utilities].reverse().map((u) => (
                <li key={u.id}>
                  <Link href={`/accounts/apartment/utilities/${u.id}`} className="flex items-center justify-between gap-3 py-3">
                    <span>
                      <span className="block text-sm font-medium">{periodText(u.periodStart, u.periodEnd)}</span>
                      <span className="block text-xs text-muted">
                        {u.paidDate ? `Paid ${shortDate(u.paidDate)}` : "Unpaid"} · ≈ {fmt(monthlyAverageFen(u))}/month
                        {u.note && ` · ${u.note}`}
                      </span>
                    </span>
                    <span className="tabular text-sm font-semibold">{fmt(u.totalFen)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </>
  );
}
