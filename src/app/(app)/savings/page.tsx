import type { Metadata } from "next";
import Link from "next/link";
import { type ChartBar, HistoryChart } from "@/components/history-chart";
import { Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getMonthsReadyToClose, listClosings, listSavingsTransactions } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { formatMonth, todayIn } from "@/lib/dates";
import { niceAxisMax } from "@/lib/history";
import { HOME_SYMBOL, moneyFormat } from "@/lib/money";
import { DeleteEntryButton, ReopenButton, SavingsEntryForm } from "./savings-controls";

export const metadata: Metadata = { title: "Savings · Pulse" };

const KIND_LABEL = { month_close: "Month closed", deposit: "Added", withdrawal: "Taken out", adjustment: "Adjustment" };

export default async function SavingsPage({ searchParams }: PageProps<"/savings">) {
  const closedParam = (await searchParams).closed;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const closingsP = listClosings(supabase);
  const [closings, txns, ready] = await Promise.all([
    closingsP,
    listSavingsTransactions(supabase),
    closingsP.then((c) => getMonthsReadyToClose(supabase, settings, today, c)),
  ]);
  const balance = txns.reduce((sum, t) => sum + t.amountFen, 0);
  const pending = ready.filter((r) => !r.isTrackingStartMonth).reduce((sum, r) => sum + Math.max(0, r.budgetFen - r.spentFen), 0);

  const bars: ChartBar[] = closings.map((c) => ({
    key: c.month,
    value: c.savedFen,
    state: "data",
    valueText: c.savedFen > 0 ? `+${fmt(c.savedFen)}` : fmt(0),
    label: formatMonth(c.month),
    tick: new Date(`${c.month}T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
    note: c.overFen > 0 && c.budgetFen > 0 ? `over budget by ${fmt(c.overFen)}` : c.budgetFen === 0 ? "tracking only" : undefined,
  }));
  const avgSaved = closings.length ? Math.round(closings.reduce((s, c) => s + c.savedFen, 0) / closings.length) : 0;

  return (
    <>
      <PageHeader title="Savings" />

      {typeof closedParam === "string" && /^\d{4}-\d{2}$/.test(closedParam) && (
        <p role="status" className="rounded-xl bg-accent-soft px-4 py-3 text-sm">
          ✓ {formatMonth(`${closedParam}-01`)} closed.
        </p>
      )}

      <Card>
        <Label>🏦 Savings Box</Label>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{fmt(balance)}</p>
        {pending > 0 && (
          <p className="mt-3 text-sm text-muted">
            + <span className="tabular font-medium text-foreground">{fmt(pending)}</span> waiting: close the ended
            months below to add it.
          </p>
        )}
        <p className="mt-3 text-xs text-muted">
          What&apos;s left of each month&apos;s budget. Family Money and restaurant credit are never counted here.
        </p>
      </Card>

      {ready.length > 0 && (
        <Card>
          <Label>Ready to close</Label>
          <ul className="mt-3 flex flex-col gap-2">
            {ready.map((r) => {
              const would = Math.max(0, r.budgetFen - r.spentFen);
              return (
                <li key={r.month}>
                  <Link
                    href={`/savings/close/${r.month.slice(0, 7)}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"
                  >
                    <span>
                      <span className="block text-sm font-semibold">
                        {formatMonth(r.month)}
                        {r.isTrackingStartMonth && <span className="font-normal text-muted"> · partial month</span>}
                      </span>
                      <span className="block text-xs text-muted">
                        Spent {fmt(r.spentFen)}
                        {r.isTrackingStartMonth ? " · you choose the budget" : ` of ${fmt(r.budgetFen)} → +${fmt(would)}`}
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-accent">Review ›</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {closings.length > 0 && (
        <Card>
          <Label>Saved per month</Label>
          <div className="mt-3">
            <HistoryChart
              symbol={HOME_SYMBOL[settings.homeCurrency]}
              bars={bars}
              axisMax={niceAxisMax(Math.max(...closings.map((c) => c.savedFen)))}
              refValue={closings.length > 1 ? avgSaved : null}
              refText={closings.length > 1 ? `avg ${fmt(avgSaved)}` : null}
              emptyText="No months closed yet."
            />
          </div>
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {[...closings].reverse().map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <span>
                  <span className="block text-sm font-medium">
                    {formatMonth(c.month)}
                    {c.isPartial && <span className="text-muted"> · partial</span>}
                  </span>
                  <span className="tabular block text-xs text-muted">
                    {c.budgetFen === 0
                      ? `Tracking only · spent ${fmt(c.spentFen)}`
                      : `Spent ${fmt(c.spentFen)} of ${fmt(c.budgetFen)}${c.overFen > 0 ? ` · over by ${fmt(c.overFen)}` : ""}`}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tabular block text-sm font-semibold">{c.savedFen > 0 ? `+${fmt(c.savedFen)}` : fmt(0)}</span>
                  <Link href={`/recap?month=${c.month.slice(0, 7)}`} className="block text-xs font-semibold text-accent">
                    Recap
                  </Link>
                  <ReopenButton month={c.month.slice(0, 7)} label={formatMonth(c.month)} />
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Label>Add or take out money</Label>
        <div className="mt-3">
          <SavingsEntryForm currency={settings.homeCurrency} today={today} balanceFen={balance} />
        </div>
      </Card>

      <Card>
        <Label>Activity</Label>
        {txns.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. Close a month to start filling the Savings Box.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {txns.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.note ?? KIND_LABEL[t.kind]}</span>
                  <span className="block text-xs text-muted">
                    {new Date(`${t.txnDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}{" "}
                    · {KIND_LABEL[t.kind]}
                    {t.personalExpenseId && " · purchase"}
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`tabular block text-sm font-semibold ${t.amountFen < 0 ? "" : "text-accent"}`}>
                    {fmt(t.amountFen, { sign: true })}
                  </span>
                  {!t.closingId && !t.personalExpenseId && <DeleteEntryButton id={t.id} />}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Link href="/history" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-card">
        <span>
          <span className="block font-semibold">📊 Spending history</span>
          <span className="block text-sm text-muted">Week, month, 6 months and year, with averages per day</span>
        </span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </Link>
    </>
  );
}
