"use client";

import { useState } from "react";
import { type HomeCurrency, moneyFormat, parseYuan } from "@/lib/money";
import { useSafeForm } from "@/lib/use-safe-form";
import { type WalletActionState, adjustWallet, createWallet, topUp, useCredit } from "./actions";

const input = "h-11 rounded-xl border border-line bg-surface px-3 text-sm";
const label = "flex flex-col gap-1 text-sm text-muted";

function Message({ state }: { state: WalletActionState }) {
  if (!state.message) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={`rounded-xl px-4 py-3 text-sm ${state.ok ? "bg-accent-soft" : "bg-danger-soft text-danger"}`}>
      {state.message}
    </p>
  );
}

export function NewWalletForm({ today }: { today: string }) {
  const { state, formAction, pending, formRef } = useSafeForm(createWallet, { resetOnSuccess: false });
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <label className={label}>
        Restaurant
        <input name="name" required maxLength={100} placeholder="e.g. Noodle House" className={input} />
      </label>
      <p className="text-xs text-muted">First top-up (optional)</p>
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Cash paid
          <input name="cash" inputMode="decimal" placeholder="300" className={input} />
        </label>
        <label className={label}>
          Credit received
          <input name="credit" inputMode="decimal" placeholder="same if no bonus" className={input} />
        </label>
      </div>
      <label className={label}>
        Date
        <input name="date" type="date" defaultValue={today} max={today} className={input} />
      </label>
      <Message state={state} />
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Creating…" : "Create wallet"}
      </button>
    </form>
  );
}

type Mode = "use" | "topup" | "adjust";

export function WalletActions({ walletId, balanceFen, today, currency }: { walletId: string; balanceFen: number; today: string; currency: HomeCurrency }) {
  const fmt = moneyFormat(currency);
  const [mode, setMode] = useState<Mode>(balanceFen > 0 ? "use" : "topup");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-track p-1">
        {(
          [
            ["use", "🍜 Ate here"],
            ["topup", "＋ Top up"],
            ["adjust", "Adjust"],
          ] as const
        ).map(([m, text]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            aria-pressed={mode === m}
            className={`h-9 rounded-lg text-sm font-semibold ${mode === m ? "bg-surface shadow-card" : "text-muted"}`}
          >
            {text}
          </button>
        ))}
      </div>
      {mode === "use" && <UseForm walletId={walletId} balanceFen={balanceFen} today={today} fmt={fmt} />}
      {mode === "topup" && <TopupForm walletId={walletId} today={today} fmt={fmt} />}
      {mode === "adjust" && <AdjustForm walletId={walletId} today={today} />}
    </div>
  );
}

type Fmt = (cents: number) => string;

function UseForm({ walletId, balanceFen, today, fmt }: { walletId: string; balanceFen: number; today: string; fmt: Fmt }) {
  const { state, formAction, pending, formRef } = useSafeForm(useCredit);
  const [bill, setBill] = useState("");
  const billFen = parseYuan(bill) ?? 0;
  const short = billFen > balanceFen;
  // The cash confirmation only applies to the exact bill it was asked for.
  const confirmCash = Boolean(state.needsCash && state.needsCash.creditFen + state.needsCash.cashFen === billFen);
  return (
    <form ref={formRef} action={formAction} onReset={() => setBill("")} className="flex flex-col gap-3">
      <input type="hidden" name="walletId" value={walletId} />
      <input type="hidden" name="allowCash" value={confirmCash ? "1" : "0"} />
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Bill
          <input name="bill" inputMode="decimal" required value={bill} onChange={(e) => setBill(e.target.value)} placeholder="80" className={input} />
        </label>
        <label className={label}>
          Date
          <input name="date" type="date" defaultValue={today} max={today} className={input} />
        </label>
      </div>
      <input name="note" maxLength={500} placeholder="Note (optional)" className={input} />
      {short && billFen > 0 && !confirmCash && (
        <p className="text-xs text-muted">
          Only {fmt(balanceFen)} credit left: the other {fmt(billFen - balanceFen)} will be asked as cash.
        </p>
      )}
      {(confirmCash || !state.needsCash) && <Message state={state} />}
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending
          ? "Saving…"
          : confirmCash && state.needsCash
            ? `Yes: ${fmt(state.needsCash.creditFen)} credit + ${fmt(state.needsCash.cashFen)} cash`
            : "Use credit"}
      </button>
      <p className="text-xs text-muted">Using credit doesn&apos;t count toward your budget. The cash you paid when topping up already did.</p>
    </form>
  );
}

function TopupForm({ walletId, today, fmt }: { walletId: string; today: string; fmt: Fmt }) {
  const { state, formAction, pending, formRef } = useSafeForm(topUp);
  const [cash, setCash] = useState("");
  const [credit, setCredit] = useState("");
  const cashFen = parseYuan(cash) ?? 0;
  const creditFen = credit ? (parseYuan(credit) ?? 0) : cashFen;
  return (
    <form
      ref={formRef}
      action={formAction}
      onReset={() => {
        setCash("");
        setCredit("");
      }}
      className="flex flex-col gap-3"
    >
      <input type="hidden" name="walletId" value={walletId} />
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Cash paid
          <input name="cash" inputMode="decimal" required value={cash} onChange={(e) => setCash(e.target.value)} placeholder="300" className={input} />
        </label>
        <label className={label}>
          Credit received
          <input name="credit" inputMode="decimal" value={credit} onChange={(e) => setCredit(e.target.value)} placeholder="same if no bonus" className={input} />
        </label>
      </div>
      <label className={label}>
        Date
        <input name="date" type="date" defaultValue={today} max={today} className={input} />
      </label>
      <input name="note" maxLength={500} placeholder="Note (optional)" className={input} />
      {cashFen > 0 && creditFen > cashFen && <p className="text-xs text-accent">Promo bonus: +{fmt(creditFen - cashFen)}</p>}
      <Message state={state} />
      <button disabled={pending} className="h-11 rounded-xl bg-accent text-sm font-semibold text-on-accent disabled:opacity-60">
        {pending ? "Saving…" : "Top up"}
      </button>
      <p className="text-xs text-muted">The cash you pay counts once as 🍜 Food spending this month.</p>
    </form>
  );
}

function AdjustForm({ walletId, today }: { walletId: string; today: string }) {
  const { state, formAction, pending, formRef } = useSafeForm(adjustWallet);
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="walletId" value={walletId} />
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          Change
          <select name="direction" className={input} defaultValue="remove">
            <option value="remove">Remove credit</option>
            <option value="add">Add credit</option>
          </select>
        </label>
        <label className={label}>
          Amount
          <input name="amount" inputMode="decimal" required className={input} />
        </label>
      </div>
      <input type="hidden" name="date" value={today} />
      <input name="note" maxLength={500} placeholder="Why? e.g. expired, restaurant closed" className={input} />
      <Message state={state} />
      <button disabled={pending} className="h-11 rounded-xl border border-line text-sm font-semibold disabled:opacity-60">
        {pending ? "Saving…" : "Save adjustment"}
      </button>
      <p className="text-xs text-muted">For expired credit or corrections. Doesn&apos;t affect your budget.</p>
    </form>
  );
}
