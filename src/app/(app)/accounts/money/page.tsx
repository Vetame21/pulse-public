import type { Metadata } from "next";
import { ConfirmButton } from "@/components/confirm-button";
import { BackLink, Card, Label, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { fetchAllRows } from "@/lib/data/backup";
import { accountBalance, checkHistory, ensureAccounts, latestChecks } from "@/lib/data/my-money";
import { listWallets } from "@/lib/data/restaurants";
import { getSettings } from "@/lib/data/settings";
import { todayIn } from "@/lib/dates";
import { familyPeople, familyTotals, type PersonTxn } from "@/lib/ledgers";
import { moneyFormat } from "@/lib/money";
import { deleteAccount, deleteBalanceCheck, deleteIncome, deleteTransfer } from "./actions";
import { AddAccountForm, BalanceForm, IncomeForm, TransferForm } from "./money-controls";

export const metadata: Metadata = { title: "My Money · Pulse" };

export default async function MyMoneyPage() {
  const { supabase, user } = await requireUser();
  const settings = await getSettings(supabase, user.id);
  const fmt = moneyFormat(settings.homeCurrency);
  const today = todayIn(settings.timezone);
  const { features } = settings;
  const accountsP = ensureAccounts(supabase);
  const checksP = accountsP.then((a) => latestChecks(supabase, a.map((x) => x.id)));
  const [accounts, checks, familyRows, wallets, incomeRes, live, mainHistory, transfersRes] = await Promise.all([
    accountsP,
    checksP,
    fetchAllRows(supabase, "family_transactions"),
    listWallets(supabase),
    supabase.from("income_transactions").select("id, txn_date, amount_fen, source, note").order("txn_date", { ascending: false }).limit(20),
    // Every RMB account's live balance: last check + expenses paid from it, money in and transfers since.
    Promise.all([accountsP, checksP]).then(async ([a, c]) => {
      const rmb = a.filter((x) => x.currency === settings.homeCurrency);
      const balances = await Promise.all(rmb.map((x) => accountBalance(supabase, settings, x, c.get(x.id))));
      return new Map(rmb.map((x, i) => [x.id, balances[i]]));
    }),
    accountsP.then((a) => checkHistory(supabase, a.find((x) => x.isMain)!.id)),
    supabase.from("account_transfers").select("id, from_account, to_account, txn_date, amount_fen, note").order("txn_date", { ascending: false }).limit(10),
  ]);
  const transfers = transfersRes.data ?? [];
  const nameOf = (id: string) => accounts.find((a) => a.id === id)?.name ?? "Deleted account";
  const main = accounts.find((a) => a.isMain)!;
  const rmbAccounts = accounts.filter((a) => a.currency === settings.homeCurrency);
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { timeZone: settings.timezone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

  // Current value of each account in home-currency fen
  const valueFen = (id: string): number | null => {
    const a = accounts.find((x) => x.id === id)!;
    if (a.currency === settings.homeCurrency) return live.get(id)?.balanceFen ?? null;
    const c = checks.get(id);
    if (!c) return null;
    return c.balanceMinor;
  };
  const known = accounts.map((a) => valueFen(a.id)).filter((v): v is number => v !== null);
  const totalFen = known.reduce((s, v) => s + v, 0);
  // Family money sitting in your account isn't yours; money they borrowed (negative balance) is owed to you.
  const family = familyTotals(
    features.family
      ? familyPeople(familyRows.map((m) => ({ kind: m.kind as PersonTxn["kind"], amountFen: Number(m.amount_fen), from: String(m.from_person), keepRest: false })))
      : [],
  );
  const heldFen = family.heldFen;
  const loanFen = family.owedFen;
  const restaurantFen = wallets.filter((w) => !w.archived).reduce((s, w) => s + w.summary.balanceFen, 0);
  const income = incomeRes.data ?? [];

  return (
    <>
      <BackLink href="/accounts" label="Accounts" />
      <PageHeader title="My Money" eyebrow="Real balances" />

      <Card>
        <Label>Yours</Label>
        <p className="mt-2 text-5xl font-semibold tracking-tight">{fmt(totalFen - heldFen + loanFen)}</p>
        <dl className="mt-4 flex flex-col gap-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">In your accounts</dt>
            <dd className="tabular">{fmt(totalFen)}</dd>
          </div>
          {heldFen > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">− Family money (in your main account, not yours)</dt>
              <dd className="tabular">{fmt(heldFen)}</dd>
            </div>
          )}
          {loanFen > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted">+ Family owes you (loan)</dt>
              <dd className="tabular">{fmt(loanFen)}</dd>
            </div>
          )}
          {restaurantFen > 0 && (
            <div className="flex justify-between text-muted">
              <dt>Restaurant credit (prepaid, not counted)</dt>
              <dd className="tabular">{fmt(restaurantFen)}</dd>
            </div>
          )}
        </dl>
        {known.length < accounts.length && (
          <p className="mt-3 text-xs text-warning">Some accounts have no balance yet. Record them below.</p>
        )}
      </Card>


      {accounts.map((a) => {
        const c = checks.get(a.id);
        const isMain = a.isMain;
        const now = live.get(a.id) ?? null;
        return (
          <Card key={a.id}>
            <div className="flex items-baseline justify-between">
              <Label>
                🏦 {a.name}
                {isMain && " · main"}
              </Label>
              <span className="flex items-baseline gap-3">
                {c && <span className="text-xs text-muted">checked {fmtTime(c.checkedAt)}</span>}
                {!isMain && <ConfirmButton action={deleteAccount} id={a.id} label="Delete account" />}
              </span>
            </div>

            {!c ? (
              <p className="mt-2 text-sm text-muted">No balance recorded yet. Open your bank app and type the balance you see.</p>
            ) : now ? (
              <>
                <p className="mt-2 text-4xl font-semibold tracking-tight">{fmt(now.balanceFen)}</p>
                <p className="mt-2 text-sm text-muted">
                  {fmt(c.balanceMinor)} at the check
                  {now.outFen > 0 && <> · −{fmt(now.outFen)} out</>}
                  {now.inFen > 0 && <> · +{fmt(now.inFen)} in</>}
                  {now.counted.length === 0 && " · nothing recorded since"}
                </p>
                {now.counted.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-medium text-accent">
                      {now.counted.length} change{now.counted.length === 1 ? "" : "s"} since the check
                    </summary>
                    <ul className="mt-2 divide-y divide-line text-sm">
                      {now.counted.map((e) => (
                        <li key={e.key} className="flex justify-between gap-3 py-1.5">
                          <span className="min-w-0 truncate">
                            {e.label}
                            <span className="text-xs text-muted"> · {e.date.slice(5).replace("-", "/")}</span>
                          </span>
                          <span className={`tabular shrink-0 ${e.deltaFen > 0 ? "text-accent" : ""}`}>{fmt(e.deltaFen, { sign: true })}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <p className="mt-2 text-4xl font-semibold tracking-tight">{fmt(c.balanceMinor)}</p>
            )}

            <div className="mt-4">
              <BalanceForm
                accountId={a.id}
                expectedText={now && now.counted.length > 0 ? fmt(now.balanceFen) : null}
              />
            </div>

            {isMain && mainHistory.length > 1 && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium text-muted">Earlier checks</summary>
                <ul className="mt-2 divide-y divide-line text-sm">
                  {mainHistory.map((h) => (
                    <li key={h.id} className="flex items-center justify-between py-1.5">
                      <span className="text-muted">{fmtTime(h.checkedAt)}</span>
                      <span className="flex items-center gap-3">
                        <span className="tabular">{fmt(h.balanceMinor)}</span>
                        <ConfirmButton action={deleteBalanceCheck} id={h.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </Card>
        );
      })}

      {rmbAccounts.length > 1 && (
        <Card>
          <Label>Move money</Label>
          <p className="mt-1 text-xs text-muted">Top up a wallet from {main.name}, or move money back. One goes down, the other goes up.</p>
          <div className="mt-3">
            <TransferForm accounts={rmbAccounts.map((a) => ({ id: a.id, name: a.name }))} mainId={main.id} today={today} />
          </div>
          {transfers.length > 0 && (
            <ul className="mt-4 divide-y divide-line border-t border-line">
              {transfers.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {nameOf(t.from_account)} → {nameOf(t.to_account)}
                      {t.note && ` · ${t.note}`}
                    </span>
                    <span className="block text-xs text-muted">{t.txn_date}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="tabular text-sm font-semibold">{fmt(Number(t.amount_fen))}</span>
                    <ConfirmButton action={deleteTransfer} id={t.id} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <Card>
        <Label>Money in → {main.name}</Label>
        <p className="mt-1 text-xs text-muted">Allowance, salary or transfers. Raises your {main.name} balance until the next check.</p>
        <div className="mt-3">
          <IncomeForm today={today} />
        </div>
        {income.length > 0 && (
          <ul className="mt-4 divide-y divide-line border-t border-line">
            {income.map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-3 py-2.5">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{i.source || "Money in"}{i.note && ` · ${i.note}`}</span>
                  <span className="block text-xs text-muted">{i.txn_date}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end">
                  <span className="tabular text-sm font-semibold text-accent">+{fmt(Number(i.amount_fen))}</span>
                  <ConfirmButton action={deleteIncome} id={i.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <details>
          <summary className="cursor-pointer text-sm font-semibold text-muted">Add another account</summary>
          <div className="mt-3">
            <AddAccountForm existing={accounts.map((a) => a.name)} home={settings.homeCurrency} />
          </div>
        </details>
      </Card>

      <p className="px-1 text-center text-xs text-muted">
        Accounts in your currency change automatically with everything you record after a balance check: expenses paid from them, money
        you move, and for {main.name} also rent, utilities, restaurant top-ups, Family Money and money in. Re-check now and then
        to keep them exact.
      </p>
    </>
  );
}
