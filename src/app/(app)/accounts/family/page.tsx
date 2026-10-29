import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { listFamily } from "@/lib/data/family";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { deleteFamilyEntry, keepFamilyRest } from "./actions";
import { FamilyForm } from "./family-form";

export const metadata: Metadata = { title: "Family Money · Pulse" };

export default async function FamilyPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const { rows, people, totals } = await listFamily(supabase);
  const payees = [...new Set(rows.filter((r) => r.person).map((r) => r.person as string))].slice(-20);

  return (
    <>
      <BackLink href="/accounts" label="Accounts" />
      <PageHeader title="Family Money" eyebrow="👪 Entrusted money" />

      <Card>
        <Label>To pass on</Label>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{fmt(totals.heldFen)}</p>
        {totals.owedFen > 0 && <p className="mt-1 text-sm text-warning">+ {fmt(totals.owedFen)} owed to you (loans)</p>}
        {people.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {people.map((p) => (
              <li key={p.name} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{p.name}</span>
                  <span className="block text-xs text-muted">
                    {p.keepRest ? "Part to pass on, rest is yours" : "All to pass on"} · received {fmt(p.receivedFen)} · paid {fmt(p.paidFen)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`tabular text-sm font-semibold ${p.balanceFen < 0 ? "text-warning" : ""}`}>{fmt(Math.abs(p.balanceFen))}</span>
                  {p.balanceFen < 0 && <span className="text-xs text-warning">owes you</span>}
                  {p.keepRest && p.balanceFen > 0 && <ConfirmButton action={keepFamilyRest} id={p.name} label="Rest is mine" />}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          Not your money. Never counted in your budget, spending, savings or arc. It does pass through your main
          balance, so My Money subtracts it to show what&apos;s really yours. Money someone owes you is paid back first
          when they send more.
        </p>
      </Card>

      <Card>
        <Label>Add</Label>
        <div className="mt-3">
          <FamilyForm
            currency={settings.homeCurrency}
            today={todayIn(settings.timezone)}
            people={people.map((p) => ({ name: p.name, balanceFen: p.balanceFen, keepRest: p.keepRest }))}
            payees={payees}
          />
        </div>
      </Card>

      <Card>
        <Label>History</Label>
        {rows.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nothing yet. When someone sends you money to look after, record it here first.</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {[...rows].reverse().map((r) => (
              <li key={r.id} className="flex items-start justify-between gap-3 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {r.kind === "received" ? `From ${r.from}` : r.kind === "kept" ? `Rest of ${r.from}'s money is yours` : `Paid ${r.person ?? `for ${r.from}`}`}
                    {r.purpose && <span className="font-normal text-muted"> · {r.purpose}</span>}
                  </span>
                  <span className="block text-xs text-muted">
                    {new Date(`${r.txnDate}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} ·
                    {r.kind === "paid" ? ` ${r.from}` : ""} balance after {fmt(r.balanceAfterFen)}
                    {r.keepRest && " · rest is yours"}
                    {r.note && ` · ${r.note}`}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className={`tabular text-sm font-semibold ${r.kind === "received" ? "text-accent" : ""}`}>
                    {r.kind === "received" ? "+" : "−"}
                    {fmt(r.amountFen)}
                  </span>
                  <ConfirmButton action={deleteFamilyEntry} id={r.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
