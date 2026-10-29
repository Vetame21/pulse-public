import type { Metadata } from "next";
import Link from "next/link";
import { ExpenseForm } from "@/components/expense-form";
import { BackLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fxHints } from "@/lib/data/expenses";
import { payAccounts } from "@/lib/data/my-money";
import { getSavingsBalance } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";

export const metadata: Metadata = { title: "Add expense · Pulse" };

export default async function AddPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const today = todayIn(settings.timezone);
  const [savingsBalanceFen, fx, accounts] = await Promise.all([
    getSavingsBalance(supabase),
    fxHints(supabase, today, settings.homeCurrency),
    payAccounts(supabase, settings.homeCurrency),
  ]);

  return (
    <>
      <BackLink href="/money" label="Money" />
      <PageHeader title="Add expense" eyebrow="Personal" />
      <ExpenseForm
        mode="create"
        today={today}
        trackingStart={settings.trackingStartDate}
        savingsBalanceFen={savingsBalanceFen}
        fx={fx}
        accounts={accounts}
      />
      <Link href="/accounts/restaurants" className="text-center text-sm font-medium text-accent">
        🍲 Ate with restaurant credit or topped up? Use a wallet →
      </Link>
    </>
  );
}
