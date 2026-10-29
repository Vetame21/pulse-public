import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { ensureRentBill, listRentPayments, listUtilityBills } from "@/lib/data/apartment";
import { ensureAccounts, latestChecks, mainAccountBalance } from "@/lib/data/my-money";
import { listWallets } from "@/lib/data/restaurants";
import { listFamily } from "@/lib/data/family";
import { listThinkAgain } from "@/lib/data/think-again";
import { groupItems } from "@/lib/think-again";
import { getSettings } from "@/lib/data/settings";
import { monthStart, todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { monthlyAverageFen } from "@/lib/utilities";

export default async function AccountsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const { features } = settings;
  const billP = features.rent ? ensureRentBill(supabase, settings) : Promise.resolve(null);
  const [bill, payments, utilities, wallets, mainBalance, family, thinkItems] = await Promise.all([
    billP,
    billP.then((b) => (b ? listRentPayments(supabase, b.id) : [])),
    listUtilityBills(supabase),
    listWallets(supabase),
    ensureAccounts(supabase).then(async (accounts) => {
      const main = accounts.find((a) => a.isMain)!;
      const checks = await latestChecks(supabase, [main.id]);
      const balance = await mainAccountBalance(supabase, settings, main, checks.get(main.id));
      return balance && { name: main.name, balanceFen: balance.balanceFen };
    }),
    listFamily(supabase),
    listThinkAgain(supabase),
  ]);
  const think = groupItems(thinkItems, todayIn(settings.timezone));
  const credit = wallets.filter((w) => !w.archived).reduce((s, w) => s + w.summary.balanceFen, 0);
  const walletCount = wallets.filter((w) => !w.archived).length;
  const paidThisMonth = payments.some((p) => p.month === monthStart(todayIn(settings.timezone)));
  const latest = utilities[utilities.length - 1];

  const live = [
    {
      href: "/accounts/money",
      emoji: "💳",
      title: "My Money",
      text: mainBalance ? `${mainBalance.name} ≈ ${fmt(mainBalance.balanceFen)}` : `Record your bank balances`,
    },
    {
      href: "/accounts/restaurants",
      emoji: "🍲",
      title: "Restaurant Wallets",
      text: walletCount ? `${fmt(credit)} credit left · ${walletCount} wallet${walletCount === 1 ? "" : "s"}` : "Prepaid credit like Noodle House",
    },
  ];
  if (features.family) {
    live.push({
      href: "/accounts/family",
      emoji: "👪",
      title: "Family Money",
      text: family.rows.length
        ? `${fmt(family.totals.heldFen)} to pass on${family.totals.owedFen > 0 ? ` · ${fmt(family.totals.owedFen)} owed to you` : ""}`
        : "Money family trusts you with",
    });
  }
  live.push({
    href: "/accounts/think-again",
    emoji: "🤔",
    title: "Think Again",
    text: think.ready.length
      ? `${think.ready.length} ready to decide · ${think.waiting.length} waiting`
      : think.waiting.length
        ? `${think.waiting.length} on your waitlist`
        : "Your waitlist of things to buy",
  });

  return (
    <>
      <PageHeader title="Accounts" />
      {bill && (
      <Link href="/accounts/apartment" className="block">
        <Card className="flex items-center gap-4">
          <span className="text-2xl" aria-hidden>🏠</span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Apartment</p>
            <p className="text-sm text-muted">
              {fmt(bill.defaultAmountFen)}/month · this month {paidThisMonth ? "paid ✓" : "unpaid"}
              {latest && ` · utilities ≈ ${fmt(monthlyAverageFen(latest))}/month`}
            </p>
          </div>
          <span className="text-muted" aria-hidden>›</span>
        </Card>
      </Link>
      )}
      {live.map((l) => (
        <Link key={l.href} href={l.href} className="block">
          <Card className="flex items-center gap-4">
            <span className="text-2xl" aria-hidden>{l.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{l.title}</p>
              <p className="text-sm text-muted">{l.text}</p>
            </div>
            <span className="text-muted" aria-hidden>›</span>
          </Card>
        </Link>
      ))}
    </>
  );
}
