import type { Metadata } from "next";
import Link from "next/link";
import { type DayGroup, TransactionList } from "@/components/transaction-list";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { CATEGORIES, CATEGORY_KEYS, type CategoryKey, category } from "@/lib/categories";
import { isMonthClosed } from "@/lib/data/budgets";
import { formatMinor } from "@/lib/currency";
import { listExpenses } from "@/lib/data/expenses";
import { getSettings } from "@/lib/data/settings";
import { addMonths, formatMonth, isValidISODate, monthStart, todayIn } from "@/lib/dates";
import { isLinkedToWallet } from "@/lib/expense-source";
import { moneyFormat } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions · Pulse" };

function one(v: string | string[] | undefined) {
  return Array.isArray(v) ? v[0] : v;
}

export default async function TransactionsPage({ searchParams }: PageProps<"/transactions">) {
  const params = await searchParams;
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const currentMonth = monthStart(today);
  const firstMonth = monthStart(settings.trackingStartDate);

  const monthParam = one(params.month);
  const requested = monthParam && isValidISODate(`${monthParam}-01`) ? `${monthParam}-01` : currentMonth;
  const month = requested < firstMonth ? firstMonth : requested > currentMonth ? currentMonth : requested;
  const catParam = one(params.category);
  const cat = CATEGORY_KEYS.includes(catParam as CategoryKey) ? (catParam as CategoryKey) : undefined;
  const q = one(params.q)?.trim().slice(0, 100) || undefined;
  const sort = one(params.sort) === "oldest" ? "oldest" : "newest";

  const [expenses, closed, accountsRes] = await Promise.all([
    listExpenses(supabase, { month, category: cat, search: q, sort }),
    isMonthClosed(supabase, month),
    supabase.from("money_accounts").select("id, name"),
  ]);
  const accountName = new Map((accountsRes.data ?? []).map((a) => [a.id as string, a.name as string]));

  // Group by day
  const days = new Map<string, typeof expenses>();
  for (const e of expenses) days.set(e.txnDate, [...(days.get(e.txnDate) ?? []), e]);
  const signed = (e: (typeof expenses)[number]) => (e.kind === "refund" ? -e.amountFen : e.amountFen);
  const total = expenses.filter((e) => e.fundedBy === "budget").reduce((s, e) => s + signed(e), 0);

  const link = (overrides: Record<string, string | undefined>) => {
    const sp = new URLSearchParams();
    const merged = { month: month.slice(0, 7), category: cat, q, sort: sort === "oldest" ? "oldest" : undefined, ...overrides };
    for (const [k, v] of Object.entries(merged)) if (v) sp.set(k, v);
    return `/transactions?${sp.toString()}`;
  };
  const prev = addMonths(month, -1);
  const next = addMonths(month, 1);
  const returnTo = link({});

  const groups: DayGroup[] = [...days.entries()].map(([day, items]) => ({
    day,
    label: new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }),
    totalFen: items.filter((e) => e.fundedBy === "budget").reduce((sum, e) => sum + signed(e), 0),
    items: items.map((e) => {
      const c = category(e.category);
      return {
        id: e.id,
        emoji: c.emoji,
        title: e.note || c.label,
        subtitle: [
          e.originalMinor !== null ? formatMinor(e.originalMinor, e.currency) : "Personal",
          c.label,
          e.kind === "refund" ? "Refund" : null,
          e.paidWith === "cash" ? "💵 Cash" : e.paidFromAccount ? `💳 ${accountName.get(e.paidFromAccount) ?? "Other account"}` : null,
          e.fundedBy === "savings" ? "🏦 from Savings Box" : null,
          e.fundedBy === "other" ? `🎁 paid by ${e.paidBy ?? "someone else"}` : null,
          e.source.startsWith("restaurant") ? "Restaurant" : null,
          e.source === "think_again" ? "🤔 Think Again" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        signedFen: signed(e),
        href: `/transactions/${e.id}?from=${encodeURIComponent(returnTo)}`,
        locked: closed ? "month closed" : isLinkedToWallet(e.source) ? "linked" : null,
      };
    }),
  }));

  return (
    <>
      <PageHeader
        title="Transactions"
        eyebrow="Personal"
        action={
          <Link href="/history" className="text-sm font-medium text-accent">
            📊 History
          </Link>
        }
      />

      <nav aria-label="View" className="grid grid-cols-2 gap-1 rounded-xl bg-track p-1">
        <span className="flex h-9 items-center justify-center rounded-lg bg-surface text-sm font-semibold shadow-card">List</span>
        <Link
          href={`/transactions/calendar${month === currentMonth ? "" : `?month=${month.slice(0, 7)}`}`}
          className="flex h-9 items-center justify-center rounded-lg text-sm font-semibold text-muted"
        >
          Calendar
        </Link>
      </nav>

      <div className="flex items-center justify-between rounded-2xl border border-line bg-surface px-2 py-1.5">
        {prev >= firstMonth ? (
          <Link href={link({ month: prev.slice(0, 7) })} className="h-10 px-3 text-lg leading-10 text-muted" aria-label="Previous month">
            ‹
          </Link>
        ) : (
          <span className="h-10 w-9" />
        )}
        <div className="text-center">
          <p className="text-sm font-semibold">{formatMonth(month)}</p>
          {month === firstMonth && settings.trackingStartDate > month && (
            <p className="text-[11px] text-muted">Partial month · tracking started {settings.trackingStartDate.slice(8)} Aug</p>
          )}
        </div>
        {next <= currentMonth ? (
          <Link href={link({ month: next.slice(0, 7) })} className="h-10 px-3 text-lg leading-10 text-muted" aria-label="Next month">
            ›
          </Link>
        ) : (
          <span className="h-10 w-9" />
        )}
      </div>

      <form action="/transactions" className="flex flex-col gap-2">
        <input type="hidden" name="month" value={month.slice(0, 7)} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search notes"
          className="h-11 rounded-xl border border-line bg-surface px-4 text-sm outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <select
            name="category"
            defaultValue={cat ?? ""}
            aria-label="Category"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
          >
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.emoji} {c.label}
              </option>
            ))}
          </select>
          <select name="sort" defaultValue={sort} aria-label="Sort" className="h-11 rounded-xl border border-line bg-surface px-3 text-sm">
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
          <button className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent">Apply</button>
        </div>
      </form>

      <div className="flex items-baseline justify-between px-1 text-sm">
        <span className="text-muted">
          {expenses.length} transaction{expenses.length === 1 ? "" : "s"}
          {(cat || q) && " (filtered)"}
        </span>
        <span className="tabular font-semibold">{fmt(total)}</span>
      </div>

      {expenses.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{cat || q ? "Nothing matches these filters." : "No personal expenses this month."}</p>
        </Card>
      ) : (
        <TransactionList currency={settings.homeCurrency} days={groups} />
      )}
    </>
  );
}
