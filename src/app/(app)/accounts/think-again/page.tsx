import type { Metadata } from "next";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { category } from "@/lib/categories";
import { getSavingsBalance } from "@/lib/data/savings";
import { getSettings } from "@/lib/data/settings";
import { listThinkAgain } from "@/lib/data/think-again";
import { todayIn } from "@/lib/dates";
import { moneyFormat } from "@/lib/money";
import { daysLeft, groupItems, savedBySkipping } from "@/lib/think-again";
import { AddThinkForm, DecideActions, DecidedActions, RemoveItem } from "./think-controls";

export const metadata: Metadata = { title: "Think Again · Pulse" };

function shortDate(d: string) {
  return new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

export default async function ThinkAgainPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const [items, savingsBalanceFen] = await Promise.all([listThinkAgain(supabase), getSavingsBalance(supabase)]);
  const g = groupItems(items, today);
  const saved = savedBySkipping(items);
  const bought = items.filter((i) => i.status === "bought").length;
  const skipped = items.filter((i) => i.status === "skipped").length;

  return (
    <>
      <BackLink href="/accounts" label="Accounts" />
      <PageHeader title="Think Again" eyebrow="🤔 Waitlist" />

      <Card>
        <Label>Not spent thanks to thinking again</Label>
        <p className="mt-2 text-4xl font-semibold tracking-tight">{fmt(saved)}</p>
        <p className="mt-1 text-sm text-muted">
          {skipped} skipped · {bought} bought · {g.ready.length + g.waiting.length} waiting
        </p>
        <p className="mt-3 text-xs text-muted">Items on the waitlist never count as spending until you actually buy them.</p>
      </Card>

      {g.ready.length > 0 && (
        <Card>
          <Label>Ready to decide</Label>
          <ul className="mt-2 divide-y divide-line">
            {g.ready.map((i) => (
              <li key={i.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {category(i.category).emoji} {i.name}
                    </span>
                    <span className="block text-xs text-muted">
                      Waited since {shortDate(i.addedOn)}
                      {i.note && ` · ${i.note}`}
                    </span>
                  </span>
                  <span className="tabular shrink-0 text-sm font-semibold">{fmt(i.priceFen)}</span>
                </div>
                <p className="mt-2 text-sm">Do you still want it?</p>
                <DecideActions currency={settings.homeCurrency} itemId={i.id} priceFen={i.priceFen} today={today} savingsBalanceFen={savingsBalanceFen} ready />
              </li>
            ))}
          </ul>
        </Card>
      )}

      {g.waiting.length > 0 && (
        <Card>
          <Label>Still waiting</Label>
          <ul className="mt-2 divide-y divide-line">
            {g.waiting.map((i) => {
              const left = daysLeft(i, today);
              return (
                <li key={i.id} className="py-3">
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {category(i.category).emoji} {i.name}
                      </span>
                      <span className="block text-xs text-muted">
                        Decide in {left} day{left === 1 ? "" : "s"} ({shortDate(i.decideAfter)})
                        {i.note && ` · ${i.note}`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end">
                      <span className="tabular text-sm font-semibold">{fmt(i.priceFen)}</span>
                      <RemoveItem itemId={i.id} />
                    </span>
                  </div>
                  <DecideActions currency={settings.homeCurrency} itemId={i.id} priceFen={i.priceFen} today={today} savingsBalanceFen={savingsBalanceFen} ready={false} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <Card>
        <Label>Add something you want</Label>
        <div className="mt-3">
          <AddThinkForm defaultWait={[3, 7, 14, 30].includes(settings.thinkAgainDays) ? settings.thinkAgainDays : 7} />
        </div>
      </Card>

      {g.decided.length > 0 && (
        <Card>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Decided ({g.decided.length})</summary>
            <ul className="mt-2 divide-y divide-line">
              {[...g.decided]
                .sort((a, b) => ((a.decidedOn ?? "") < (b.decidedOn ?? "") ? 1 : -1))
                .map((i) => (
                  <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">
                        {i.status === "skipped" ? "🎉" : "🛒"} {i.name}
                      </span>
                      <span className="block text-xs text-muted">
                        {i.status === "skipped" ? "Skipped" : "Bought"}
                        {i.decidedOn && ` ${shortDate(i.decidedOn)}`}
                        {i.status === "bought" && !i.personalExpenseId && " · expense deleted"}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className={`tabular text-sm font-semibold ${i.status === "skipped" ? "text-accent" : ""}`}>{fmt(i.priceFen)}</span>
                      <DecidedActions itemId={i.id} />
                    </span>
                  </li>
                ))}
            </ul>
          </details>
        </Card>
      )}
    </>
  );
}
