import type { Metadata } from "next";
import Link from "next/link";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listWallets } from "@/lib/data/restaurants";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { NewWalletForm } from "./wallet-controls";

export const metadata: Metadata = { title: "Restaurant wallets · Pulse" };

export default async function RestaurantsPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const wallets = await listWallets(supabase);
  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);
  const total = active.reduce((s, w) => s + w.summary.balanceFen, 0);

  return (
    <>
      <BackLink href="/accounts" label="Accounts" />
      <PageHeader title="Restaurant wallets" eyebrow="Prepaid credit" />

      <Card>
        <Label>Credit left</Label>
        <p className="mt-2 text-4xl font-semibold tracking-tight">{fmt(total)}</p>
        <p className="mt-3 text-xs text-muted">
          Prepaid credit you can still eat. The cash you paid already counted as Food when you topped up, so this isn&apos;t
          added to your savings or balance.
        </p>
      </Card>

      {active.map((w) => {
        const discount = w.summary.creditReceivedFen > 0 ? (w.summary.bonusFen / w.summary.creditReceivedFen) * 100 : 0;
        return (
          <Link key={w.id} href={`/accounts/restaurants/${w.id}`} className="block">
            <Card className="flex items-center justify-between gap-3">
              <span>
                <span className="block font-semibold">🍲 {w.name}</span>
                <span className="block text-xs text-muted">
                  Paid {fmt(w.summary.cashPaidFen)} · used {fmt(w.summary.creditUsedFen)}
                  {discount > 0 && ` · ${discount.toFixed(1)}% bonus`}
                </span>
              </span>
              <span className="tabular text-xl font-semibold">{fmt(w.summary.balanceFen)}</span>
            </Card>
          </Link>
        );
      })}

      <Card>
        <Label>New wallet</Label>
        <div className="mt-3">
          <NewWalletForm today={todayIn(settings.timezone)} />
        </div>
      </Card>

      {archived.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold text-muted">Archived ({archived.length})</summary>
            <ul className="mt-2 divide-y divide-line">
              {archived.map((w) => (
                <li key={w.id}>
                  <Link href={`/accounts/restaurants/${w.id}`} className="flex justify-between py-2 text-sm">
                    <span>{w.name}</span>
                    <span className="tabular text-muted">{fmt(w.summary.balanceFen)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </Card>
      )}
    </>
  );
}
