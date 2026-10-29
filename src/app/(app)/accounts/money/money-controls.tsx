"use client";

import { useTransition } from "react";
import { safeCall } from "@/lib/safe-call";
import { useSafeForm } from "@/lib/use-safe-form";
import { addAccount, addIncome, addTransfer, recordBalance } from "./actions";

const input = "h-11 rounded-xl border border-line bg-surface px-3 text-sm";

function Msg({ ok, message }: { ok: boolean; message: string | null }) {
  return message ? <p className={`text-sm ${ok ? "text-accent" : "text-danger"}`}>{message}</p> : null;
}

export function BalanceForm({ accountId, expectedText }: { accountId: string; expectedText: string | null }) {
  const { state, formAction, pending, formRef } = useSafeForm(recordBalance, { withId: false });
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="accountId" value={accountId} />
      <div className="flex gap-2">
        <input
          name="amount"
          inputMode="decimal"
          required
          placeholder="Balance now"
          aria-label="Balance now"
          className={`${input} min-w-0 flex-1`}
        />
        <button disabled={pending} className="h-11 rounded-xl bg-accent px-4 text-sm font-semibold text-on-accent disabled:opacity-60">
          {pending ? "…" : "Save"}
        </button>
      </div>
      {expectedText && <p className="text-xs text-muted">The app expects {expectedText} right now. Type what your bank app actually shows.</p>}
      <Msg {...state} />
    </form>
  );
}

const SOURCES = ["Allowance", "Salary", "Transfer", "Other"];

export function IncomeForm({ today }: { today: string }) {
  const { state, formAction, pending, formRef } = useSafeForm(addIncome);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex gap-2">
        <input name="amount" inputMode="decimal" required placeholder="Amount" className={`${input} min-w-0 flex-1`} />
        <input name="date" type="date" defaultValue={today} max={today} aria-label="Date" className={input} />
      </div>
      <div className="flex flex-wrap gap-2">
        {SOURCES.map((s, i) => (
          <label key={s} className="cursor-pointer">
            <input type="radio" name="source" value={s} defaultChecked={i === 0} className="peer sr-only" />
            <span className="block rounded-full border border-line px-3 py-1.5 text-sm text-muted peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-foreground">
              {s}
            </span>
          </label>
        ))}
      </div>
      <input name="note" maxLength={500} placeholder="Note (optional)" className={input} />
      <Msg {...state} />
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Saving…" : "Add money in"}
      </button>
    </form>
  );
}

export function AddAccountForm({ existing, home }: { existing: string[]; home: "CNY" | "HKD" }) {
  const { state, formAction, pending, formRef } = useSafeForm(addAccount, { withId: false });
  const [adding, startAdding] = useTransition();
  // One tap for the usual wallets; hidden once you have them.
  const presets = ["Alipay", "WeChat"].filter((n) => !existing.some((e) => e.toLowerCase() === n.toLowerCase()));
  const addPreset = (name: string) =>
    startAdding(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("currency", home);
      await safeCall(() => addAccount({ ok: false, message: null }, fd));
    });
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      {presets.length > 0 && (
        <div className="flex gap-2">
          {presets.map((n) => (
            <button key={n} type="button" disabled={adding} onClick={() => addPreset(n)} className="h-11 flex-1 rounded-xl bg-accent-soft text-sm font-semibold disabled:opacity-60">
              ＋ {n} balance
            </button>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input name="name" required maxLength={100} placeholder="e.g. Cash, WeChat" className={`${input} min-w-0 flex-1`} />
        <button disabled={pending} className="h-11 rounded-xl border border-line px-3 text-sm font-semibold disabled:opacity-60">
          Add
        </button>
      </div>
      <p className="text-xs text-muted">Accounts change with expenses you pay from them and money you move.</p>
      <Msg {...state} />
    </form>
  );
}

/** Move money between your accounts, e.g. top up Alipay from your bank. */
export function TransferForm({ accounts, mainId, today }: { accounts: { id: string; name: string }[]; mainId: string; today: string }) {
  const { state, formAction, pending, formRef } = useSafeForm(addTransfer);
  const other = accounts.find((a) => a.id !== mainId)?.id ?? "";
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
        <select name="from" defaultValue={mainId} aria-label="From" className={input}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <span className="text-muted" aria-hidden>
          →
        </span>
        <select name="to" defaultValue={other} aria-label="To" className={input}>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input name="amount" inputMode="decimal" required placeholder="Amount" className={`${input} min-w-0 flex-1`} />
        <input name="date" type="date" defaultValue={today} max={today} aria-label="Date" className={input} />
      </div>
      <input name="note" maxLength={200} placeholder="Note (optional), e.g. top up" className={input} />
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Moving…" : "Move money"}
      </button>
      <Msg {...state} />
    </form>
  );
}
