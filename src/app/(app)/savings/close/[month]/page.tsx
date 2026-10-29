import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BackLink, Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { proratedBudget } from "@/lib/budget";
import { getMonthsReadyToClose, listClosings, parseMonthParam } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { daysInclusive, daysInMonthOf, formatMonth, monthEnd, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { type BudgetOption, CloseMonthForm } from "../../savings-controls";

export const metadata: Metadata = { title: "Close month · Pulse" };

export default async function CloseMonthPage({ params }: PageProps<"/savings/close/[month]">) {
  const month = parseMonthParam((await params).month);
  if (!month) notFound();

  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const closings = await listClosings(supabase);
  if (closings.some((c) => c.month === month)) redirect("/savings");
  const ready = (await getMonthsReadyToClose(supabase, settings, today, closings)).find((r) => r.month === month);
  if (!ready) redirect("/savings"); // not ended yet, or before tracking started

  const label = formatMonth(month);
  let partialOptions: BudgetOption[] | null = null;
  if (ready.isTrackingStartMonth) {
    const tracked = daysInclusive(settings.trackingStartDate, monthEnd(month));
    const dim = daysInMonthOf(month);
    const prorated = proratedBudget(settings.defaultBudgetFen, tracked, dim);
    partialOptions = [
      { value: "none", title: "No budget (tracking only)", budgetFen: 0, detail: "Nothing goes to savings. Recommended for a month you only tracked partly." },
      { value: "prorated", title: `Share for ${tracked} days: ${fmt(prorated)}`, budgetFen: prorated, detail: `${tracked}/${dim} × ${fmt(settings.defaultBudgetFen)}` },
      { value: "full", title: `Full budget: ${fmt(settings.defaultBudgetFen)}`, budgetFen: settings.defaultBudgetFen, detail: "As if the whole month had been tracked." },
      { value: "custom", title: "Custom amount", budgetFen: null, detail: "Enter your own budget for this month." },
    ];
  }

  return (
    <>
      <BackLink href="/savings" label="Savings" />
      <PageHeader title={`Close ${label}`} eyebrow={ready.isTrackingStartMonth ? "Partial month" : "Month end"} />

      {ready.spentFen === 0 && (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          No expenses are recorded for {label}. If you haven&apos;t entered them yet, do that first. Closing now would count
          the whole budget as saved. (You can reopen a month later.)
        </p>
      )}

      <Card>
        <p className="text-sm text-muted">
          {ready.isTrackingStartMonth
            ? `Tracking started ${new Date(`${settings.trackingStartDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" })}, so this month was only partly tracked. Choose how its budget should count.`
            : "Closing records this month's spending and moves what's left of the budget to the Savings Box. Expenses in a closed month are locked until you reopen it."}
        </p>
        <div className="mt-4">
          <CloseMonthForm
 currency={settings.homeCurrency}
            month={month.slice(0, 7)}
            monthLabel={label}
            spentFen={ready.spentFen}
            budgetFen={ready.budgetFen}
            partialOptions={partialOptions}
          />
        </div>
      </Card>
    </>
  );
}
