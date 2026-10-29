import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PersonalExpense } from "@/lib/budget";
import type { CategoryKey } from "@/lib/categories";
import type { FxHints } from "@/components/expense-form";
import { type CurrencyCode, foreignFor, isCurrency, suggestRate } from "@/lib/currency";
import { addDays } from "@/lib/dates";
import { ecbRates } from "@/lib/fx";
import { monthEnd, monthStart } from "@/lib/dates";

export type ExpenseRow = PersonalExpense & {
  id: string;
  category: CategoryKey;
  source: string;
  note: string | null;
  createdAt: string;
  currency: CurrencyCode; // what you paid in (amountFen is always the yuan amount)
  originalMinor: number | null;
  fxRate: number | null;
  paidWith: "bank" | "cash"; // cash / own money doesn't change the bank balance
  paidBy: string | null; // who paid, when fundedBy is "other"
  paidFromAccount: string | null; // which RMB account (null = main account)
};

const SELECT = "id, txn_date, amount_fen, category, kind, source, funded_by, note, created_at, currency, original_minor, fx_rate, paid_with, paid_by, paid_from_account";

type DbRow = {
  id: string;
  txn_date: string;
  amount_fen: number | string;
  category: CategoryKey;
  kind: "expense" | "refund";
  source: string;
  funded_by: "budget" | "savings" | "other";
  note: string | null;
  created_at: string;
  currency: string;
  original_minor: number | string | null;
  fx_rate: number | string | null;
  paid_with: "bank" | "cash";
  paid_by: string | null;
  paid_from_account: string | null;
};

function toExpense(r: DbRow): ExpenseRow {
  return {
    id: r.id,
    txnDate: r.txn_date,
    amountFen: Number(r.amount_fen),
    category: r.category,
    kind: r.kind,
    source: r.source,
    fundedBy: r.funded_by,
    note: r.note,
    createdAt: r.created_at,
    currency: isCurrency(r.currency) ? r.currency : "CNY",
    originalMinor: r.original_minor === null ? null : Number(r.original_minor),
    fxRate: r.fx_rate === null ? null : Number(r.fx_rate),
    paidWith: r.paid_with === "cash" ? "cash" : "bank",
    paidBy: r.paid_by,
    paidFromAccount: r.paid_from_account,
  };
}

/** Rate hints for the expense form: your last rate per currency (last 30 days) and the newest currency you used. */
export async function recentCurrencyUse(supabase: SupabaseClient, since: string) {
  const { data, error } = await supabase
    .from("personal_expenses")
    .select("currency, fx_rate, txn_date, created_at")
    .gte("txn_date", since)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`Couldn't load recent rates: ${error.message}`);
  const lastRate: Partial<Record<CurrencyCode, { rate: number; date: string }>> = {};
  for (const r of data) {
    if (r.fx_rate !== null && isCurrency(r.currency) && !lastRate[r.currency]) lastRate[r.currency] = { rate: Number(r.fx_rate), date: r.txn_date };
  }
  const latest = data[0];
  return { lastRate, latest: latest && isCurrency(latest.currency) ? { currency: latest.currency, createdAt: latest.created_at as string } : null };
}

export type ExpenseFilter = {
  month: string;
  category?: CategoryKey;
  search?: string;
  sort?: "newest" | "oldest";
};

export async function listExpenses(supabase: SupabaseClient, filter: ExpenseFilter): Promise<ExpenseRow[]> {
  const ascending = filter.sort === "oldest";
  let query = supabase
    .from("personal_expenses")
    .select(SELECT)
    .gte("txn_date", monthStart(filter.month))
    .lte("txn_date", monthEnd(filter.month))
    .order("txn_date", { ascending })
    .order("created_at", { ascending });
  if (filter.category) query = query.eq("category", filter.category);
  if (filter.search) {
    // Escape LIKE wildcards so a search for "50%" means the text "50%".
    query = query.ilike("note", `%${filter.search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  const { data, error } = await query.returns<DbRow[]>();
  if (error) throw new Error(`Couldn't load transactions: ${error.message}`);
  return data.map(toExpense);
}

export async function getExpense(supabase: SupabaseClient, id: string): Promise<ExpenseRow | null> {
  const { data, error } = await supabase.from("personal_expenses").select(SELECT).eq("id", id).maybeSingle<DbRow>();
  if (error) throw new Error(`Couldn't load the transaction: ${error.message}`);
  return data ? toExpense(data) : null;
}

/**
 * Rate hints for the expense form: your own rate per currency from the last 30 days
 * (e.g. the money changer's), else the ECB rate; and a default currency that stays on
 * HKD while you're entering HKD expenses (newest expense within 2 days).
 */
export async function fxHints(supabase: SupabaseClient, today: string, home: "CNY" | "HKD"): Promise<FxHints> {
  const [recent, ecb] = await Promise.all([recentCurrencyUse(supabase, addDays(today, -30)), ecbRates(home)]);
  const rates: FxHints["rates"] = {};
  for (const code of foreignFor(home)) {
    const s = suggestRate(recent.lastRate[code] ?? null, ecb.rates[code] ?? null, today);
    if (s) rates[code] = s;
  }
  const fresh = recent.latest && Date.now() - new Date(recent.latest.createdAt).getTime() < 2 * 86_400_000;
  return { rates, ecbDate: ecb.date, defaultCurrency: fresh ? recent.latest!.currency : home, home };
}
