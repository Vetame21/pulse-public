import Link from "next/link";
import { Amount } from "@/components/amount";
import { Card, Label, ProgressBar } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { type BudgetStatus, computeMonthBudget } from "@/lib/budget";
import { CATEGORIES, category } from "@/lib/categories";
import { ensureMonthBudget } from "@/lib/data/budgets";
import { listExpenses } from "@/lib/data/expenses";
import { getMonthsReadyToClose, listClosings, listSavingsTransactions } from "@/lib/data/savings";
import { ensureRentBill, listRentPayments, listUtilityBills } from "@/lib/data/apartment";
import { ensureAccounts, latestChecks, mainAccountBalance } from "@/lib/data/my-money";
import { listWallets } from "@/lib/data/restaurants";
import { ArcCard } from "@/components/arc-card";
import { getArcState } from "@/lib/data/arc";
import { listFamily } from "@/lib/data/family";
import { listThinkAgain } from "@/lib/data/think-again";
import { groupItems } from "@/lib/think-again";
import { daysInclusive } from "@/lib/dates";
import { monthlyAverageFen, wholeMonthsCovered } from "@/lib/utilities";
import { getSettings } from "@/lib/data/settings";
import { addMonths, formatMonth, monthStart, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";

const STATUS: Record<BudgetStatus, { text: string; dot: string; tone: "accent" | "warning" | "danger" }> = {
  on_track: { text: "On track", dot: "🟢", tone: "accent" },
  above_pace: { text: "Spending faster than planned", dot: "🟡", tone: "warning" },
  over_budget: { text: "Over budget", dot: "🔴", tone: "danger" },
  no_budget: { text: "Tracking only (no budget this month)", dot: "⚪", tone: "accent" },
};

export default async function HomePage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const month = monthStart(today);

  // One parallel round: independent queries run side by side, and queries that
  // depend on another (e.g. the bank balance needs the account) are chained inside.
  // Each round trip goes over the VPN to Singapore, so rounds matter more than query count.
  const expensesP = listExpenses(supabase, { month, sort: "newest" });
  const accountsP = ensureAccounts(supabase);
  const rentBillP = settings.features.rent ? ensureRentBill(supabase, settings) : Promise.resolve(null);
  const [budgetRow, expenses, savingsTxns, readyToClose, rentBill, rentPayments, utilities, wallets, arc, family, thinkItems, mainBalance] =
    await Promise.all([
      ensureMonthBudget(supabase, settings, month),
      expensesP,
      listSavingsTransactions(supabase),
      listClosings(supabase).then((closings) => getMonthsReadyToClose(supabase, settings, today, closings)),
      rentBillP,
      rentBillP.then((bill) => (bill ? listRentPayments(supabase, bill.id) : [])),
      listUtilityBills(supabase),
      listWallets(supabase),
      expensesP.then((e) => getArcState(supabase, settings, today, e)),
      listFamily(supabase),
      listThinkAgain(supabase),
      accountsP.then(async (accounts) => {
        const main = accounts.find((a) => a.isMain)!;
        const checks = await latestChecks(supabase, [main.id]);
        const balance = await mainAccountBalance(supabase, settings, main, checks.get(main.id));
        return balance && { ...balance, name: main.name };
      }),
    ]);
  const thinkReady = groupItems(thinkItems, today).ready;
  const restaurantCredit = wallets.filter((w) => !w.archived).reduce((s, w) => s + w.summary.balanceFen, 0);
  const rentPaidThisMonth = rentPayments.some((p) => p.month === month);
  const latestUtility = utilities[utilities.length - 1] ?? null;
  const savingsBalance = savingsTxns.reduce((sum, t) => sum + t.amountFen, 0);

  const b = computeMonthBudget({
    month,
    budgetFen: budgetRow.budgetFen,
    today,
    trackingStart: settings.trackingStartDate,
    expenses,
  });
  const status = STATUS[b.status];

  const byCategory = CATEGORIES.map((c) => ({
    ...c,
    fen: expenses
      .filter((e) => e.category === c.key && e.fundedBy === "budget")
      .reduce((sum, e) => sum + (e.kind === "refund" ? -e.amountFen : e.amountFen), 0),
  }))
    .filter((c) => c.fen > 0)
    .sort((a, b) => b.fen - a.fen);
  const maxCategory = byCategory[0]?.fen ?? 0;
  const recent = expenses.slice(0, 5);
  const showBackupReminder = expenses.length > 0 && (settings.backupAgeDays === null || settings.backupAgeDays > 30);

  return (
    <>
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-accent">Money</p>
          <h1 className="text-2xl font-semibold tracking-tight">{formatMonth(month)}</h1>
        </div>
        <Link
          href="/settings"
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface text-muted"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </header>

      {showBackupReminder && (
        <Link href="/settings#backup" className="flex items-center justify-between gap-3 rounded-2xl bg-warning-soft px-4 py-3 text-sm text-warning">
          <span>
            💾 {settings.lastBackupAt ? "Your last backup is over 30 days old." : "You haven't made a backup yet."} Export one
            now.
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {readyToClose.length > 0 && (
        <Link
          href={`/savings/close/${readyToClose[0].month.slice(0, 7)}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-accent-soft px-4 py-3 text-sm"
        >
          <span>
            🗓 <span className="font-semibold">{formatMonth(readyToClose[0].month)}</span> has ended. Close it to move what&apos;s
            left into the Savings Box
            {readyToClose.length > 1 && ` (${readyToClose.length} months waiting)`}.
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {thinkReady.length > 0 && (
        <Link href="/accounts/think-again" className="flex items-center justify-between gap-3 rounded-2xl bg-track px-4 py-3 text-sm">
          <span>
            🤔 <span className="font-semibold">{thinkReady[0].name}</span> has waited long enough. Still want it?
            {thinkReady.length > 1 && ` (+${thinkReady.length - 1} more)`}
          </span>
          <span aria-hidden>›</span>
        </Link>
      )}

      {/* LEFT THIS MONTH */}
      <Card>
        <Label>{b.remainingFen < 0 ? "Over budget by" : "Left this month"}</Label>
        <p className={`tabular mt-2 text-5xl font-semibold tracking-tight ${b.remainingFen < 0 ? "text-danger" : ""}`}>
          {fmt(Math.abs(b.remainingFen))}
        </p>

        <div className="mt-5 flex items-baseline justify-between text-sm">
          <span className="tabular text-muted">
            <span className="font-medium text-foreground">{fmt(b.spentFen)}</span> / {fmt(b.budgetFen)} used
          </span>
          <span className="tabular font-medium">{b.budgetFen > 0 ? `${(b.progress * 100).toFixed(1)}%` : "—"}</span>
        </div>
        <div className="mt-2">
          <ProgressBar value={b.progress} tone={status.tone} />
        </div>
        <p className="mt-3 text-sm">
          {status.dot} {status.text}
        </p>
      </Card>

      {/* SAFE TO SPEND / TODAY / PROJECTED */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="col-span-2">
          <Label>Safe to spend</Label>
          <p className="mt-2 flex items-baseline gap-1">
            <span className="tabular text-3xl font-semibold tracking-tight">{fmt(b.safeDailyFen ?? 0)}</span>
            <span className="text-sm text-muted">/day</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            for the {b.remainingDays} day{b.remainingDays === 1 ? "" : "s"} left, including today
          </p>
        </Card>
        <Card>
          <Label>Today</Label>
          <p className="tabular mt-2 text-2xl font-semibold">{fmt(b.spentTodayFen ?? 0)}</p>
          {b.leftTodayFen !== null && (
            <p className={`tabular mt-1 text-xs ${b.leftTodayFen < 0 ? "text-danger" : "text-muted"}`}>
              {b.leftTodayFen < 0 ? `${fmt(-b.leftTodayFen)} over today` : `${fmt(b.leftTodayFen)} left today`}
            </p>
          )}
        </Card>
        <Card>
          <Label>Projected</Label>
          <p className="tabular mt-2 text-2xl font-semibold">{fmt(b.projectedFen ?? 0)}</p>
          <p className="mt-1 text-xs text-muted">estimate at this pace</p>
        </Card>
      </div>

      <ArcCard state={arc} />

      {/* SPENDING BY CATEGORY */}
      <Card>
        <Label>Spending by category</Label>
        {byCategory.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No spending yet this month.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {byCategory.map((c) => (
              <li key={c.key}>
                <div className="flex items-baseline justify-between text-sm">
                  <span>
                    <span aria-hidden>{c.emoji}</span> {c.label}
                  </span>
                  <span className="tabular font-medium">{fmt(c.fen)}</span>
                </div>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(c.fen / maxCategory) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* SAVINGS BOX */}
      <Link href="/savings" className="block">
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>🏦 Savings Box</Label>
            <span className="text-sm text-muted" aria-hidden>
              ›
            </span>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight">{fmt(savingsBalance)}</p>
        </Card>
      </Link>

      {/* MY MONEY + RESTAURANT CREDIT */}
      <div className="grid grid-cols-2 gap-3">
        <Link href="/accounts/money" className="block">
          <Card className="h-full">
            <Label>💳 {mainBalance?.name ?? "My Money"}</Label>
            {mainBalance ? (
              <>
                <p className="mt-2 text-2xl font-semibold tracking-tight">{fmt(mainBalance.balanceFen)}</p>
                <p className="mt-1 text-xs text-muted">
                  {mainBalance.counted.length ? `${mainBalance.counted.length} change${mainBalance.counted.length === 1 ? "" : "s"} since check` : "as checked"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-muted">Record your balance →</p>
            )}
          </Card>
        </Link>
        <Link href="/accounts/restaurants" className="block">
          <Card className="h-full">
            <Label>🍲 Restaurant credit</Label>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{fmt(restaurantCredit)}</p>
            <p className="mt-1 text-xs text-muted">prepaid, already counted</p>
          </Card>
        </Link>
      </div>

      {/* FAMILY MONEY */}
      {settings.features.family && (
      <Link href="/accounts/family" className="block">
        <Card className="flex items-center justify-between gap-3">
          <span>
            <Label>👪 Family Money</Label>
            <span className="mt-1 block text-xs text-muted">
              {family.rows.length ? `to pass on · ${family.people.length} ${family.people.length === 1 ? "person" : "people"}` : "not your money · kept separate"}
            </span>
          </span>
          <span className="tabular text-right text-2xl font-semibold">
            {fmt(family.totals.heldFen)}
            {family.totals.owedFen > 0 && <span className="block text-xs font-normal text-warning">{fmt(family.totals.owedFen)} owed to you</span>}
          </span>
        </Card>
      </Link>
      )}

      {/* APARTMENT */}
      {rentBill && (
      <Link href="/accounts/apartment" className="block">
        <Card>
          <div className="flex items-baseline justify-between">
            <Label>🏠 Apartment</Label>
            <span className={`text-xs font-semibold ${rentPaidThisMonth ? "text-accent" : "text-warning"}`}>
              Rent {rentPaidThisMonth ? "paid ✓" : "unpaid"}
            </span>
          </div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">
            {fmt(rentBill.defaultAmountFen)} <span className="text-sm font-normal text-muted">fixed</span>
          </p>
          <p className="mt-1 text-sm text-muted">
            {latestUtility
              ? `Latest utilities ${fmt(latestUtility.totalFen)} / ${
                  wholeMonthsCovered(latestUtility.periodStart, latestUtility.periodEnd) !== null
                    ? `${wholeMonthsCovered(latestUtility.periodStart, latestUtility.periodEnd)} months`
                    : `${daysInclusive(latestUtility.periodStart, latestUtility.periodEnd)} days`
                } (≈ ${fmt(monthlyAverageFen(latestUtility))}/month)`
              : "No utility bill yet"}
          </p>
        </Card>
      </Link>
      )}

      {addMonths(month, -1) >= monthStart(settings.trackingStartDate) && (
        <Link href="/recap" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-card">
          <span>
            <span className="block font-semibold">📅 {formatMonth(addMonths(month, -1)).split(" ")[0]} Wrapped</span>
            <span className="block text-sm text-muted">Your month in one page: spending, arc, savings and every account</span>
          </span>
          <span className="text-muted" aria-hidden>
            ›
          </span>
        </Link>
      )}

      <Link href="/history" className="flex items-center justify-between rounded-2xl border border-line bg-surface p-5 shadow-card">
        <span>
          <span className="block font-semibold">📊 Spending history</span>
          <span className="block text-sm text-muted">Compare weeks and months · total and average per day</span>
        </span>
        <span className="text-muted" aria-hidden>
          ›
        </span>
      </Link>

      {/* RECENT */}
      <Card>
        <div className="flex items-baseline justify-between">
          <Label>Recent</Label>
          <Link href="/transactions" className="text-sm font-medium text-accent">
            See all
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="mt-3 text-sm text-muted">
            Nothing yet. Tap <span className="font-semibold">+</span> to add your first expense.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {recent.map((e) => {
              const c = category(e.category);
              return (
                <li key={e.id}>
                  <Link href={`/transactions/${e.id}?from=/money`} className="flex items-center justify-between gap-3 py-3">
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="text-xl" aria-hidden>
                        {c.emoji}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.note || c.label}</span>
                        <span className="block text-xs text-muted">{e.txnDate.slice(5).replace("-", "/")}</span>
                      </span>
                    </span>
                    <Amount fen={e.kind === "refund" ? -e.amountFen : e.amountFen} currency={settings.homeCurrency} className="text-right text-sm font-semibold" />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

    </>
  );
}
