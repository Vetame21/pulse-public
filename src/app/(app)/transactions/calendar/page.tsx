import type { Metadata } from "next";
import Link from "next/link";
import { type CalendarDay, SpendingCalendar } from "@/components/spending-calendar";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { compactYuan, heatLevel, monthGrid } from "@/lib/calendar";
import { category } from "@/lib/categories";
import { formatMinor } from "@/lib/currency";
import { listExpenses } from "@/lib/data/expenses";
import { getSettings } from "@/lib/data/settings";
import { addMonths, daysInclusive, daysInMonthOf, formatMonth, isValidISODate, maxDate, monthEnd, monthStart, parseISODate, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";

export const metadata: Metadata = { title: "Calendar · Pulse" };

type Extra = { date: string; emoji: string; title: string; fen: number; tag: string };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function CalendarPage({ searchParams }: PageProps<"/transactions/calendar">) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const current = monthStart(today);
  const first = monthStart(settings.trackingStartDate);
  const monthParam = one(params.month);
  const requested = monthParam && isValidISODate(`${monthParam}-01`) ? `${monthParam}-01` : current;
  const month = requested < first ? first : requested > current ? current : requested;
  const everything = one(params.view) === "all";
  const start = month;
  const end = monthEnd(month);

  const [expenses, budgetRes, extras] = await Promise.all([
    listExpenses(supabase, { month, sort: "oldest" }),
    supabase.from("monthly_budgets").select("budget_fen").eq("month", month).maybeSingle(),
    everything ? loadExtras(supabase, start, end) : Promise.resolve([] as Extra[]),
  ]);

  // Daily allowance: this month's budget over its tracked days (or the default budget for a tracking-only month).
  const trackedDays = daysInclusive(maxDate(month, settings.trackingStartDate), end);
  const budget = budgetRes.data ? Number(budgetRes.data.budget_fen) : settings.defaultBudgetFen;
  const allowance = budget > 0 ? Math.floor(budget / trackedDays) : Math.floor(settings.defaultBudgetFen / daysInMonthOf(month));

  const heading = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

  const weeks = monthGrid(month).map((week) =>
    week.map((date): CalendarDay | null => {
      if (!date) return null;
      const state = date < settings.trackingStartDate ? "untracked" : date > today ? "future" : "data";
      const dayExpenses = expenses.filter((e) => e.txnDate === date && e.fundedBy === "budget");
      const spent = dayExpenses.reduce((s, e) => s + (e.kind === "refund" ? -e.amountFen : e.amountFen), 0);
      const dayExtras = extras.filter((x) => x.date === date);
      return {
        date,
        dayNumber: parseISODate(date).day,
        state,
        level: state === "data" ? heatLevel(spent, allowance) : 0,
        label: state === "data" && spent > 0 ? compactYuan(spent) : null,
        totalText: fmt(spent),
        markers: [...new Set(dayExtras.map((x) => x.emoji))],
        heading: heading(date),
        items: [
          ...expenses
            .filter((e) => e.txnDate === date)
            .map((e) => {
              const c = category(e.category);
              return {
                key: e.id,
                emoji: c.emoji,
                title: e.note || c.label,
                amountText: fmt(e.kind === "refund" ? -e.amountFen : e.amountFen),
                tag: [
                  e.fundedBy === "savings" ? "Personal · from Savings" : "Personal",
                  e.originalMinor !== null ? formatMinor(e.originalMinor, e.currency) : null,
                ]
                  .filter(Boolean)
                  .join(" · "),
              };
            }),
          ...dayExtras.map((x, i) => ({ key: `x-${i}`, emoji: x.emoji, title: x.title, amountText: fmt(x.fen, { sign: true }), tag: x.tag })),
        ],
      };
    }),
  );

  const link = (o: { month?: string; view?: string }) => {
    const sp = new URLSearchParams();
    const m = o.month ?? month.slice(0, 7);
    if (m !== current.slice(0, 7)) sp.set("month", m);
    const v = o.view ?? (everything ? "all" : "");
    if (v) sp.set("view", v);
    return `/transactions/calendar${sp.size ? `?${sp}` : ""}`;
  };
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const spentMonth = expenses.filter((e) => e.fundedBy === "budget").reduce((s, e) => s + (e.kind === "refund" ? -e.amountFen : e.amountFen), 0);

  return (
    <>
      <PageHeader title="Calendar" eyebrow="Spending" />

      <nav aria-label="View" className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
        <Link href={`/transactions?month=${month.slice(0, 7)}`} className="flex h-9 items-center justify-center rounded-lg text-sm font-semibold text-muted">
          List
        </Link>
        <span className="flex h-9 items-center justify-center rounded-lg bg-surface text-sm font-semibold shadow-card">Calendar</span>
      </nav>

      <Card>
        <div className="flex items-center justify-between">
          {prev >= first ? (
            <Link href={link({ month: prev.slice(0, 7) })} className="h-9 px-2 text-lg leading-9 text-muted" aria-label="Previous month">
              ‹
            </Link>
          ) : (
            <span className="w-7" />
          )}
          <div className="text-center">
            <p className="text-sm font-semibold">{formatMonth(month)}</p>
            <p className="tabular text-xs text-muted">
              {fmt(spentMonth)} personal · allowance {fmt(allowance)}/day
            </p>
          </div>
          {next <= current ? (
            <Link href={link({ month: next.slice(0, 7) })} className="h-9 px-2 text-lg leading-9 text-muted" aria-label="Next month">
              ›
            </Link>
          ) : (
            <span className="w-7" />
          )}
        </div>

        <div className="mt-3 flex justify-center gap-1 text-xs">
          {[
            ["", "Personal only"],
            ["all", "+ Other accounts"],
          ].map(([v, text]) => (
            <Link
              key={v}
              href={link({ view: v })}
              aria-current={(v === "all") === everything ? "true" : undefined}
              className={`rounded-full px-3 py-1 font-medium ${(v === "all") === everything ? "bg-accent-soft text-foreground" : "text-muted"}`}
            >
              {text}
            </Link>
          ))}
        </div>

        <div className="mt-4">
          <SpendingCalendar weeks={weeks} initial={month === current ? today : null} />
        </div>
        {everything && (
          <p className="mt-3 text-xs text-muted">
            Colours always show personal spending only. Icons mark other accounts: 🏠 rent · ⚡ utilities · 🍲 restaurant credit ·
            👪 family · 🏦 savings · 💰 money in.
          </p>
        )}
      </Card>
    </>
  );
}

async function loadExtras(supabase: Awaited<ReturnType<typeof requireUser>>["supabase"], start: string, end: string): Promise<Extra[]> {
  const [rent, utilities, wallets, walletTxns, family, savings, income] = await Promise.all([
    supabase.from("bill_payments").select("paid_date, amount_fen, month").gte("paid_date", start).lte("paid_date", end),
    supabase.from("utility_bills").select("paid_date, total_fen").gte("paid_date", start).lte("paid_date", end),
    supabase.from("restaurant_wallets").select("id, name"),
    supabase.from("restaurant_wallet_transactions").select("wallet_id, txn_date, kind, credit_delta_fen").gte("txn_date", start).lte("txn_date", end),
    supabase.from("family_transactions").select("txn_date, kind, amount_fen, person, from_person").gte("txn_date", start).lte("txn_date", end),
    supabase.from("savings_transactions").select("txn_date, kind, amount_fen, personal_expense_id").gte("txn_date", start).lte("txn_date", end),
    supabase.from("income_transactions").select("txn_date, amount_fen, source").gte("txn_date", start).lte("txn_date", end),
  ]);
  const name = new Map((wallets.data ?? []).map((w) => [w.id, w.name]));
  const out: Extra[] = [];
  for (const r of rent.data ?? []) out.push({ date: r.paid_date, emoji: "🏠", title: `Rent ${String(r.month).slice(0, 7)}`, fen: -Number(r.amount_fen), tag: "Apartment" });
  for (const u of utilities.data ?? []) out.push({ date: u.paid_date, emoji: "⚡", title: "Electricity + water", fen: -Number(u.total_fen), tag: "Utilities" });
  for (const w of walletTxns.data ?? []) {
    out.push({
      date: w.txn_date,
      emoji: "🍲",
      title: `${name.get(w.wallet_id) ?? "Wallet"} · ${w.kind === "topup" ? "credit added" : w.kind === "usage" ? "credit used" : "adjustment"}`,
      fen: Number(w.credit_delta_fen),
      tag: "Restaurant credit",
    });
  }
  for (const m of family.data ?? []) {
    const title = m.kind === "received" ? `${m.from_person} sent` : m.kind === "kept" ? `Rest of ${m.from_person}'s money is yours` : `Paid ${m.person ?? `for ${m.from_person}`}`;
    out.push({ date: m.txn_date, emoji: "👪", title, fen: (m.kind === "received" ? 1 : -1) * Number(m.amount_fen), tag: "Family Money" });
  }
  for (const s of savings.data ?? []) {
    if (s.personal_expense_id) continue; // already listed as a personal expense paid from savings
    out.push({ date: s.txn_date, emoji: "🏦", title: s.kind === "month_close" ? "Month closed" : s.kind === "deposit" ? "Added to Savings Box" : "Taken from Savings Box", fen: Number(s.amount_fen), tag: "Savings" });
  }
  for (const i of income.data ?? []) out.push({ date: i.txn_date, emoji: "💰", title: i.source || "Money in", fen: Number(i.amount_fen), tag: "Money in" });
  return out;
}
