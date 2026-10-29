import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExpenseForm } from "@/components/expense-form";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { currencyInfo } from "@/lib/currency";
import { fxHints, getExpense } from "@/lib/data/expenses";
import { payAccounts } from "@/lib/data/my-money";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { isLinkedToWallet } from "@/lib/expense-source";

export const metadata: Metadata = { title: "Edit expense · Pulse" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditExpensePage({ params, searchParams }: PageProps<"/transactions/[id]">) {
  const { id } = await params;
  const from = (await searchParams).from;
  const returnTo = typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/transactions";
  if (!UUID_RE.test(id)) notFound();

  const { supabase, user } = await requireUser();
  const [settings, expense] = await Promise.all([getSettings(supabase, user.id), getExpense(supabase, id)]);
  if (!expense) notFound();

  const [fx, accounts] = await Promise.all([fxHints(supabase, todayIn(settings.timezone), settings.homeCurrency), payAccounts(supabase, settings.homeCurrency)]);
  // Foreign expenses are edited in the currency they were paid in.
  const amount =
    expense.originalMinor !== null
      ? (expense.originalMinor / 10 ** currencyInfo(expense.currency).decimals).toFixed(currencyInfo(expense.currency).decimals).replace(/\.00$/, "")
      : (expense.amountFen / 100).toFixed(2).replace(/\.00$/, "");
  const linked = isLinkedToWallet(expense.source);
  const walletLink = linked
    ? (await supabase.from("restaurant_wallet_transactions").select("wallet_id").eq("personal_expense_id", expense.id).maybeSingle()).data
    : null;

  return (
    <>
      <BackLink href={returnTo} label="Back" />
      <PageHeader title="Edit expense" eyebrow="Personal" />
      {expense.fundedBy === "other" && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">
          🎁 Paid by {expense.paidBy ?? "someone else"}, so it isn&apos;t counted in your budget, Savings Box or bank.
        </p>
      )}
      {expense.fundedBy === "savings" && (
        <p className="rounded-xl bg-accent-soft px-4 py-3 text-sm">
          🏦 Paid from the Savings Box, so it doesn&apos;t count toward the monthly budget. Changing the amount updates the
          Savings Box too.
        </p>
      )}
      {linked ? (
        <p className="rounded-xl bg-warning-soft px-4 py-3 text-sm text-warning">
          This expense was created by a restaurant wallet (a top-up, or cash paid when credit ran out). Change it from{" "}
          {walletLink ? (
            <a href={`/accounts/restaurants/${walletLink.wallet_id}`} className="font-semibold underline">
              the wallet
            </a>
          ) : (
            "the wallet"
          )}
          .
        </p>
      ) : (
        <ExpenseForm
          mode="edit"
          today={todayIn(settings.timezone)}
          trackingStart={settings.trackingStartDate}
          returnTo={returnTo}
          expense={{ id: expense.id, amount, category: expense.category, date: expense.txnDate, note: expense.note ?? "", currency: expense.currency, fxRate: expense.fxRate, paidWith: expense.paidWith, paidFromAccount: expense.paidFromAccount }}
          fx={fx}
          accounts={accounts}
        />
      )}
    </>
  );
}
