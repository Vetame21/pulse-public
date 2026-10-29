import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { ARCS } from "@/lib/arc";
import { requireUser } from "@/lib/auth";
import { category } from "@/lib/categories";
import { ensureRentBill, listRentPayments, listUtilityBills } from "@/lib/data/apartment";
import { fetchAllRows } from "@/lib/data/backup";
import { getSettings } from "@/lib/data/settings";
import { addMonths, formatMonth, isValidISODate, monthEnd, monthStart, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { monthRecap } from "@/lib/recap";

export const metadata: Metadata = { title: "Monthly recap · Pulse" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}
const shortDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export default async function RecapPage({ searchParams }: PageProps<"/recap">) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const current = monthStart(today);
  const first = monthStart(settings.trackingStartDate);
  const monthParam = one(params.month);
  // Default: last month once it has ended (the "Wrapped" moment), otherwise this month so far.
  const fallback = addMonths(current, -1) >= first ? addMonths(current, -1) : current;
  const requested = monthParam && isValidISODate(`${monthParam}-01`) ? `${monthParam}-01` : fallback;
  const month = requested < first ? first : requested > current ? current : requested;
  const prevMonth = addMonths(month, -1);

  const [expenseRows, budgets, closing, savings, walletTxns, family, rentBill, utilities] = await Promise.all([
    supabase.from("personal_expenses").select("txn_date, amount_fen, kind, funded_by, category").gte("txn_date", prevMonth).lte("txn_date", monthEnd(month)),
    supabase.from("monthly_budgets").select("month, budget_fen").in("month", [month, prevMonth]),
    supabase.from("monthly_closings").select("budget_fen, saved_fen, over_fen").eq("month", month).maybeSingle(),
    fetchAllRows(supabase, "savings_transactions"),
    fetchAllRows(supabase, "restaurant_wallet_transactions"),
    fetchAllRows(supabase, "family_transactions"),
    settings.features.rent ? ensureRentBill(supabase, settings) : Promise.resolve(null),
    listUtilityBills(supabase),
  ]);
  if (expenseRows.error || budgets.error || closing.error) throw new Error("Couldn't load the recap.");
  const rentPayments = rentBill ? await listRentPayments(supabase, rentBill.id) : [];

  const budgetOf = (m: string) => {
    const row = budgets.data.find((b) => b.month === m);
    if (row) return Number(row.budget_fen);
    return m === first && settings.trackingStartDate > m ? 0 : settings.defaultBudgetFen;
  };

  const r = monthRecap({
    month,
    today,
    trackingStart: settings.trackingStartDate,
    defaultBudgetFen: settings.defaultBudgetFen,
    budgetFen: closing.data ? Number(closing.data.budget_fen) : budgetOf(month),
    previousBudgetFen: budgetOf(prevMonth),
    closing: closing.data ? { savedFen: Number(closing.data.saved_fen), overFen: Number(closing.data.over_fen) } : null,
    expenses: expenseRows.data.map((e) => ({
      txnDate: e.txn_date,
      amountFen: Number(e.amount_fen),
      kind: e.kind,
      fundedBy: e.funded_by,
      category: e.category,
    })),
    savings: savings.map((s) => ({ date: String(s.txn_date), deltaFen: Number(s.amount_fen) })),
    walletTxns: walletTxns.map((t) => ({
      date: String(t.txn_date),
      kind: t.kind as "topup" | "usage" | "adjustment",
      creditDeltaFen: Number(t.credit_delta_fen),
      cashPaidFen: Number(t.cash_paid_fen),
    })),
    family: family.map((m) => ({ date: String(m.txn_date), kind: m.kind as "received" | "paid" | "kept", amountFen: Number(m.amount_fen) })),
  });

  const rent = rentPayments.find((p) => p.month === month);
  const utilitiesPaid = utilities.filter((u) => u.paidDate && u.paidDate >= month && u.paidDate <= monthEnd(month));
  const arc = ARCS[r.arc];
  const top = r.categories[0];
  const maxCat = top?.fen ?? 0;
  const title = r.isCurrent ? `${formatMonth(month)} so far` : `${formatMonth(month).split(" ")[0]} Wrapped`;

  return (
    <>
      <BackLink href="/money" label="Money" />
      <PageHeader title={title} eyebrow={`${formatMonth(month)}${r.isPartial ? " · partial month" : ""}`} />

      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-1.5 text-sm">
        {prevMonth >= first ? (
          <Link href={`/recap?month=${prevMonth.slice(0, 7)}`} className="h-9 px-3 leading-9 text-muted">
            ‹ {formatMonth(prevMonth).split(" ")[0]}
          </Link>
        ) : (
          <span />
        )}
        {addMonths(month, 1) <= current ? (
          <Link href={`/recap?month=${addMonths(month, 1).slice(0, 7)}`} className="h-9 px-3 leading-9 text-muted">
            {formatMonth(addMonths(month, 1)).split(" ")[0]} ›
          </Link>
        ) : (
          <span />
        )}
      </div>

      {/* PERSONAL */}
      <Card>
        <Label>Personal spending</Label>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{fmt(r.spentFen)}</p>
        <p className="mt-1 text-sm text-muted">
          {r.budgetFen > 0 ? `of ${fmt(r.budgetFen)} budget` : "tracking only (no budget)"} · {fmt(r.avgPerDayFen)}/day over{" "}
          {r.countedDays} day{r.countedDays === 1 ? "" : "s"}
        </p>
        {r.budgetFen > 0 && (
          <p className={`mt-3 text-lg font-semibold ${r.overFen > 0 ? "text-danger" : "text-accent"}`}>
            {r.overFen > 0
              ? `Over budget by ${fmt(r.overFen)}`
              : `${r.closed ? "Saved" : r.isCurrent ? "On track to save" : "Would save"} +${fmt(r.savedFen)}`}
            {!r.closed && !r.isCurrent && r.overFen === 0 && (
              <Link href={`/savings/close/${month.slice(0, 7)}`} className="ml-2 text-sm font-medium underline">
                close month
              </Link>
            )}
          </p>
        )}
        {r.fromSavingsFen > 0 && <p className="mt-1 text-xs text-muted">Plus {fmt(r.fromSavingsFen)} paid from the Savings Box (not counted above).</p>}
      </Card>

      {/* ARC + HIGHLIGHTS */}
      <Card>
        <Label>Your arc</Label>
        <p className="mt-2 text-2xl font-semibold">
          {arc.emoji} {arc.name}
        </p>
        <p className="mt-1 text-sm text-muted">{arc.line}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-track/60 p-3">
            <dt className="text-xs text-muted">Largest category</dt>
            <dd className="mt-0.5 font-semibold">{top ? `${category(top.key).emoji} ${category(top.key).label}` : "—"}</dd>
          </div>
          <div className="rounded-xl bg-track/60 p-3">
            <dt className="text-xs text-muted">Biggest day</dt>
            <dd className="mt-0.5 font-semibold">{r.biggestDay ? `${fmt(r.biggestDay.fen)} · ${shortDate(r.biggestDay.date)}` : "—"}</dd>
          </div>
          <div className="rounded-xl bg-track/60 p-3">
            <dt className="text-xs text-muted">No-spend days</dt>
            <dd className="mt-0.5 font-semibold">🚫💸 {r.noSpendDays}</dd>
          </div>
          <div className="rounded-xl bg-track/60 p-3">
            <dt className="text-xs text-muted">Pace</dt>
            <dd className="mt-0.5 font-semibold">{r.pace !== null ? `${Math.round(r.pace * 100)}% of plan` : "—"}</dd>
          </div>
        </dl>
        {r.categories.length > 0 && (
          <ul className="mt-4 flex flex-col gap-2.5">
            {r.categories.slice(0, 5).map((c) => (
              <li key={c.key}>
                <div className="flex justify-between text-sm">
                  <span>
                    {category(c.key).emoji} {category(c.key).label}
                  </span>
                  <span className="tabular font-medium">{fmt(c.fen)}</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-track">
                  <div className="h-full rounded-full bg-chart" style={{ width: `${(c.fen / maxCat) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* MONTH VS MONTH */}
      {r.previous && (
        <Card>
          <Label>Month vs month</Label>
          <dl className="mt-3 grid grid-cols-[1fr_auto_auto] items-baseline gap-x-4 gap-y-2 text-sm">
            <dt />
            <dd className="text-right text-xs text-muted">{formatMonth(r.previous.month).split(" ")[0]}</dd>
            <dd className="text-right text-xs text-muted">{formatMonth(month).split(" ")[0]}</dd>
            <dt className="text-muted">Spent</dt>
            <dd className="tabular text-right">{fmt(r.previous.spentFen)}</dd>
            <dd className="tabular text-right font-semibold">{fmt(r.spentFen)}</dd>
            <dt className="text-muted">Per day</dt>
            <dd className="tabular text-right">{fmt(r.previous.avgPerDayFen)}</dd>
            <dd className="tabular text-right font-semibold">{fmt(r.avgPerDayFen)}</dd>
          </dl>
          <p className={`mt-3 text-sm font-medium ${r.previous.totalDiffFen > 0 ? "text-danger" : "text-accent"}`}>
            {r.previous.samePeriodLength
              ? r.previous.totalDiffFen === 0
                ? "Same as last month"
                : `${r.previous.totalDiffFen > 0 ? "↑" : "↓"} ${fmt(Math.abs(r.previous.totalDiffFen))}${
                    r.previous.totalChange !== null ? ` · ${Math.abs(r.previous.totalChange).toFixed(1)}% ${r.previous.totalDiffFen > 0 ? "more" : "less"} spending` : ""
                  }`
              : r.previous.avgChange !== null
                ? `${r.previous.avgChange > 0 ? "↑" : "↓"} ${Math.abs(r.previous.avgChange).toFixed(1)}% ${r.previous.avgChange > 0 ? "more" : "less"} per day`
                : ""}
          </p>
          {!r.previous.samePeriodLength && (
            <p className="mt-1 text-xs text-muted">The months have different numbers of tracked days, so this compares per day.</p>
          )}
        </Card>
      )}

      {/* OTHER ACCOUNTS: kept separate */}
      <Card>
        <Label>Other accounts (separate from your spending)</Label>
        <ul className="mt-3 divide-y divide-line text-sm">
          <li className="flex justify-between gap-3 py-2.5">
            <span>🏦 Savings Box at month end</span>
            <span className="tabular font-semibold">{fmt(r.savingsBoxFen)}</span>
          </li>
          {rentBill && (
            <li className="flex justify-between gap-3 py-2.5">
              <span>🏠 Apartment rent</span>
              <span className="tabular font-semibold">
                {rent ? `${fmt(rent.amountFen)} · paid ${shortDate(rent.paidDate)}` : month >= rentBill.startsMonth ? "not marked paid" : "—"}
              </span>
            </li>
          )}
          <li className="flex justify-between gap-3 py-2.5">
            <span>⚡ Utilities</span>
            <span className="tabular font-semibold">
              {utilitiesPaid.length ? fmt(utilitiesPaid.reduce((s, u) => s + u.totalFen, 0)) : "No payment this month"}
            </span>
          </li>
          <li className="flex justify-between gap-3 py-2.5">
            <span>
              🍲 Restaurant credit at month end
              {(r.restaurant.toppedUpCashFen > 0 || r.restaurant.creditUsedFen > 0) && (
                <span className="block text-xs text-muted">
                  topped up {fmt(r.restaurant.toppedUpCashFen)} · used {fmt(r.restaurant.creditUsedFen)}
                </span>
              )}
            </span>
            <span className="tabular font-semibold">{fmt(r.restaurant.creditFen)}</span>
          </li>
          {settings.features.family && (
          <li className="flex justify-between gap-3 py-2.5">
            <span>
              👪 Family Money remaining
              {(r.family.receivedFen > 0 || r.family.paidFen > 0) && (
                <span className="block text-xs text-muted">
                  received {fmt(r.family.receivedFen)} · paid out {fmt(r.family.paidFen)}
                </span>
              )}
            </span>
            <span className="tabular font-semibold">
              {r.family.remainingFen < 0 ? `Owed to you ${fmt(-r.family.remainingFen)}` : fmt(r.family.remainingFen)}
            </span>
          </li>
          )}
        </ul>
        {settings.features.family && <p className="mt-3 text-xs text-muted">Family Money is never added to your savings or spending.</p>}
      </Card>
    </>
  );
}
