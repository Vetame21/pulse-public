import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getWallet } from "@/lib/data/restaurants";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { deleteWalletTxn, setWalletArchived } from "../actions";
import { WalletActions } from "../wallet-controls";

export const metadata: Metadata = { title: "Wallet · Pulse" };

const KIND = { topup: "Top-up", usage: "Ate here", adjustment: "Adjustment" };

async function archive(id: string) {
  "use server";
  return setWalletArchived(id, true);
}
async function unarchive(id: string) {
  "use server";
  return setWalletArchived(id, false);
}

export default async function WalletPage({ params }: PageProps<"/accounts/restaurants/[id]">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const wallet = await getWallet(supabase, id);
  if (!wallet) notFound();
  const s = wallet.summary;
  const discount = s.creditReceivedFen > 0 ? (s.bonusFen / s.creditReceivedFen) * 100 : 0;

  return (
    <>
      <BackLink href="/accounts/restaurants" label="Restaurant wallets" />
      <PageHeader title={wallet.name} eyebrow={wallet.archived ? "Archived wallet" : "Restaurant wallet"} />

      <Card>
        <Label>Remaining credit</Label>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{fmt(s.balanceFen)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          {[
            ["Cash paid", fmt(s.cashPaidFen), "counted as Food"],
            ["Credit received", fmt(s.creditReceivedFen), null],
            ["Promo bonus", `+${fmt(s.bonusFen)}`, discount > 0 ? `${discount.toFixed(1)}% extra value` : null],
            ["Credit used", fmt(s.creditUsedFen), null],
          ].map(([k, v, sub]) => (
            <div key={k as string} className="rounded-xl bg-track/60 p-3">
              <dt className="text-xs text-muted">{k}</dt>
              <dd className="tabular mt-0.5 font-semibold">{v}</dd>
              {sub && <dd className="text-[11px] text-muted">{sub}</dd>}
            </div>
          ))}
        </dl>
        {s.adjustmentsFen !== 0 && <p className="mt-2 text-xs text-muted">Adjustments: {fmt(s.adjustmentsFen, { sign: true })}</p>}
      </Card>

      {!wallet.archived && (
        <Card>
          <WalletActions currency={settings.homeCurrency} walletId={wallet.id} balanceFen={s.balanceFen} today={todayIn(settings.timezone)} />
        </Card>
      )}

      <Card>
        <Label>History</Label>
        {wallet.txns.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {wallet.txns.map((t) => (
              <li key={t.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{t.note || KIND[t.kind]}</span>
                  <span className="block text-xs text-muted">
                    {new Date(`${t.txnDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} ·{" "}
                    {KIND[t.kind]}
                    {t.kind === "topup" && ` · paid ${fmt(t.cashPaidFen)}`}
                    {t.kind === "usage" && t.personalExpenseId && " · plus cash"}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`tabular text-sm font-semibold ${t.creditDeltaFen > 0 ? "text-accent" : ""}`}>
                    {fmt(t.creditDeltaFen, { sign: true })}
                  </span>
                  <ConfirmButton action={deleteWalletTxn} id={t.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="text-center">
        {wallet.archived ? (
          <ConfirmButton action={unarchive} id={wallet.id} label="Restore this wallet" confirmLabel="Tap again to restore" />
        ) : s.balanceFen === 0 ? (
          <ConfirmButton action={archive} id={wallet.id} label="Archive this wallet" confirmLabel="Tap again to archive" />
        ) : (
          <p className="text-xs text-muted">To archive, use up or remove the remaining credit first.</p>
        )}
      </div>
    </>
  );
}
