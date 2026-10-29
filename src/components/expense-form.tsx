"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { type ActionState, deleteExpense, saveExpense } from "@/app/(app)/actions";
import { CATEGORIES, type CategoryKey } from "@/lib/categories";
import { CURRENCIES, type CurrencyCode, currencyInfo, parseMinor, parseRate as parseFxRate, toFen } from "@/lib/currency";
import { addDays } from "@/lib/dates";
import { HOME_SYMBOL, type HomeCurrency, moneyFormat, parseYuan } from "@/lib/money";
import { safeCall } from "@/lib/safe-call";
import { uuid } from "@/lib/uuid";

/** Your home-currency accounts you can pay from (main first), e.g. a bank, Alipay, WeChat. */
export type PayAccount = { id: string; name: string; isMain: boolean };

/** Suggested rates (yuan per 1 unit) for foreign currencies: your own recent rate, else ECB. */
export type FxHints = {
  rates: Partial<Record<CurrencyCode, { rate: number; source: "last" | "ecb" }>>;
  ecbDate: string | null;
  defaultCurrency: CurrencyCode;
  home: HomeCurrency; // your home currency: amounts in it need no rate
};

type Props =
  | { mode: "create"; today: string; trackingStart: string; savingsBalanceFen: number; fx: FxHints; accounts: PayAccount[] }
  | {
      mode: "edit";
      today: string;
      trackingStart: string;
      expense: {
        id: string;
        amount: string;
        category: CategoryKey;
        date: string;
        note: string;
        currency: CurrencyCode;
        fxRate: number | null;
        paidWith: "bank" | "cash";
        paidFromAccount: string | null;
      };
      returnTo: string;
      fx: FxHints;
      accounts: PayAccount[];
    };

// The two quick buttons: your home currency first, then the other of RMB / HKD.
const quickFor = (home: HomeCurrency): CurrencyCode[] => (home === "HKD" ? ["HKD", "CNY"] : ["CNY", "HKD"]);

export function ExpenseForm(props: Props) {
  const router = useRouter();
  const initial = props.mode === "edit" ? props.expense : null;
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [cat, setCat] = useState<CategoryKey | null>(initial?.category ?? null);
  const [date, setDate] = useState(initial?.date ?? props.today);
  const [note, setNote] = useState(initial?.note ?? "");
  const [fundedBy, setFundedBy] = useState<"budget" | "savings" | "other">("budget");
  const [paidBy, setPaidBy] = useState("");
  const startCurrency = initial?.currency ?? props.fx.defaultCurrency;
  const [currency, setCurrency] = useState<CurrencyCode>(startCurrency);
  const hint = (c: CurrencyCode) => props.fx.rates[c];
  const [fxRate, setFxRate] = useState(initial?.fxRate ? String(initial.fxRate) : hint(startCurrency) ? String(Number(hint(startCurrency)!.rate.toFixed(4))) : "");
  const [fxSource, setFxSource] = useState<"ecb" | "last" | "manual">(initial?.fxRate ? "manual" : (hint(startCurrency)?.source ?? "manual"));
  const home = props.fx.home;
  const fmt = moneyFormat(home);
  const QUICK = quickFor(home);
  const foreign = currency !== home;
  const info = currencyInfo(currency);
  // Bank for the home currency; cash / own money for other currencies, unless you change it.
  // Paid from: one of your home-currency accounts (by id) or "cash". The main account by default.
  const mainId = props.accounts.find((a) => a.isMain)?.id ?? "";
  const [paidFrom, setPaidFrom] = useState<string>(
    initial ? (initial.paidWith === "cash" ? "cash" : (initial.paidFromAccount ?? mainId)) : startCurrency === props.fx.home ? mainId : "cash",
  );

  function pickCurrency(c: CurrencyCode) {
    setCurrency(c);
    setPaidFrom(c === home ? mainId : "cash");
    const h = hint(c);
    setFxRate(h ? String(Number(h.rate.toFixed(4))) : "");
    setFxSource(h?.source ?? "manual");
  }
  // Live "= ¥102.24" (or HK$) under a foreign amount.
  const minor = foreign ? parseMinor(amount, currency) : null;
  const rateNum = foreign ? parseFxRate(fxRate) : null;
  const previewFen = minor !== null && rateNum !== null ? toFen(minor, currency, rateNum) : null;
  const [result, setResult] = useState<ActionState | null>(null);
  const [lastSavedId, setLastSavedId] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  // Kept across retries so a resubmit after a network error can't create a duplicate.
  const pendingId = useRef<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  const yesterday = addDays(props.today, -1);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!cat) {
      setResult({ ok: false, message: "Pick a category." });
      return;
    }
    const id = props.mode === "edit" ? props.expense.id : (pendingId.current ??= uuid());
    const fd = new FormData();
    fd.set("id", id);
    fd.set("mode", props.mode);
    fd.set("amount", amount);
    fd.set("category", cat);
    fd.set("date", date);
    fd.set("note", note);
    fd.set("fundedBy", fundedBy);
    fd.set("currency", currency);
    fd.set("paidWith", paidFrom === "cash" ? "cash" : "bank");
    fd.set("paidFromAccount", paidFrom === "cash" || paidFrom === mainId ? "" : paidFrom);
    if (fundedBy === "other") fd.set("paidBy", paidBy);
    if (foreign) {
      fd.set("fxRate", fxRate);
      fd.set("fxSource", fxSource);
    }

    startTransition(async () => {
      const res = await safeCall(() => saveExpense({ ok: false, message: null }, fd));
      setResult(res);
      if (!res.ok) return;
      if (props.mode === "edit") {
        router.push(props.returnTo);
        return;
      }
      // Ready for the next entry; keep the date so a whole day can be entered in a row.
      pendingId.current = null;
      setLastSavedId(res.savedId ?? null);
      setAmount("");
      setNote("");
      setCat(null);
      setFundedBy("budget");
      amountRef.current?.focus();
    });
  }

  function undo() {
    if (!lastSavedId) return;
    const id = lastSavedId;
    startTransition(async () => {
      const res = await safeCall(() => deleteExpense(id), "Couldn't reach the app. Tap Undo again.");
      setResult({ ok: res.ok, message: res.ok ? "Removed." : res.message });
      if (res.ok) setLastSavedId(null);
    });
  }

  function remove() {
    if (props.mode !== "edit") return;
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    const { id } = props.expense;
    const returnTo = props.returnTo;
    startTransition(async () => {
      const res = await safeCall(() => deleteExpense(id), "Couldn't reach the app. Nothing was deleted; try again.");
      if (res.ok) router.push(returnTo);
      else setResult(res);
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 pt-1">
        <div className="flex items-center gap-1 rounded-xl bg-track p-1" role="group" aria-label="Currency">
          {QUICK.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={currency === c}
              onClick={() => pickCurrency(c)}
              className={`h-9 rounded-lg px-3 text-sm font-semibold ${currency === c ? "bg-surface shadow-card" : "text-muted"}`}
            >
              {currencyInfo(c).symbol} {c === "CNY" ? "RMB" : c}
            </button>
          ))}
          <label className="relative">
            <span className="sr-only">Other currency</span>
            <select
              value={QUICK.includes(currency) ? "" : currency}
              onChange={(e) => e.target.value && pickCurrency(e.target.value as CurrencyCode)}
              className={`h-9 appearance-none rounded-lg bg-transparent px-3 text-sm font-semibold ${QUICK.includes(currency) ? "text-muted" : "bg-surface shadow-card"}`}
            >
              <option value="">Other ▾</option>
              {CURRENCIES.filter((c) => !QUICK.includes(c.code)).map((c) => (
                <option key={c.code} value={c.code}>
                  {c.symbol} {c.code} · {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col items-center gap-1">
          <span className="sr-only">Amount in {info.name}</span>
          <span className="flex items-baseline gap-1">
            <span className="text-3xl font-semibold text-muted">{info.symbol}</span>
            <input
              ref={amountRef}
              value={amount}
              onChange={(e) => setAmount(info.decimals === 0 ? e.target.value.replace(/[^\d]/g, "") : e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""))}
              inputMode={info.decimals === 0 ? "numeric" : "decimal"}
              autoComplete="off"
              autoFocus={props.mode === "create"}
              placeholder="0"
              aria-label={`Amount in ${info.name}`}
              className="tabular w-48 bg-transparent text-center text-5xl font-semibold tracking-tight outline-none placeholder:text-line"
            />
          </span>
        </label>
        {foreign && (
          <div className="flex flex-col items-center gap-1 text-sm">
            <label className="flex items-center gap-2">
              <span className="text-muted">
                1 {currency} = {HOME_SYMBOL[home]}
              </span>
              <input
                value={fxRate}
                onChange={(e) => {
                  setFxRate(e.target.value.replace(/,/g, ".").replace(/[^\d.]/g, ""));
                  setFxSource("manual");
                }}
                inputMode="decimal"
                aria-label={`${home} for 1 ${currency}`}
                className="tabular h-10 w-24 rounded-lg border border-line bg-surface px-2 text-center text-base"
              />
            </label>
            <span className="text-xs text-muted">
              {fxSource === "last" ? "your rate from this trip" : fxSource === "ecb" ? `ECB rate${props.fx.ecbDate ? ` (${props.fx.ecbDate})` : ""}` : "your rate"} · change it to your exchange or card rate
            </span>
            <span className="tabular font-semibold">{previewFen !== null ? `= ${fmt(previewFen)}` : " "}</span>
          </div>
        )}
      </div>

      {fundedBy !== "other" && (
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Paid with</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            ...props.accounts.map((a) => [a.id, `🏦 ${a.name}`, `Lowers your ${a.name} balance`] as const),
            ["cash", "💵 Cash / own money", "HKD cash, Octopus, your USD…"] as const,
          ].map(([value, title, sub]) => (
            <button
              key={value}
              type="button"
              aria-pressed={paidFrom === value}
              onClick={() => setPaidFrom(value)}
              className={`rounded-xl border px-3 py-2 text-left ${paidFrom === value ? "border-accent bg-accent-soft" : "border-line bg-surface"}`}
            >
              <span className="block text-sm font-medium">{title}</span>
              <span className="block text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted">Either way it counts in your monthly budget.</p>
      </fieldset>
      )}

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Category</legend>
        <div className="grid grid-cols-4 gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={() => setCat(c.key)}
              aria-pressed={cat === c.key}
              className={`flex h-[4.5rem] flex-col items-center justify-center gap-1 rounded-2xl border text-[11px] font-medium leading-tight transition-colors ${
                cat === c.key ? "border-accent bg-accent-soft text-foreground" : "border-line bg-surface text-muted"
              }`}
            >
              <span className="text-xl" aria-hidden>
                {c.emoji}
              </span>
              <span className="px-1 text-center">{c.label.replace(" / ", "/")}</span>
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-muted">Date</legend>
        <div className="flex gap-2">
          {[
            { label: "Today", value: props.today },
            { label: "Yesterday", value: yesterday },
          ].map((d) => (
            <button
              key={d.label}
              type="button"
              onClick={() => setDate(d.value)}
              aria-pressed={date === d.value}
              className={`h-11 rounded-xl border px-4 text-sm font-medium ${
                date === d.value ? "border-accent bg-accent-soft" : "border-line bg-surface text-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            min={props.trackingStart}
            max={props.today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Pick a date"
            className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-sm"
          />
        </div>
      </fieldset>

      <label className="flex flex-col gap-2">
        <span className="text-sm font-medium text-muted">Note (optional)</span>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          placeholder="e.g. lunch with friends"
          className="h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
        />
      </label>

      {props.mode === "create" && (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-muted">Pay from</legend>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ["budget", "This month's budget", "counts in your budget"],
                ["savings", "Savings Box", `${fmt(props.savingsBalanceFen)} available`],
                ["other", "🎁 Someone else", `${fmt(0)} for you`],
              ] as const
            ).map(([value, title, sub]) => {
              const disabled = value === "savings" && props.savingsBalanceFen <= 0;
              return (
                <button
                  key={value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setFundedBy(value)}
                  aria-pressed={fundedBy === value}
                  className={`rounded-xl border px-3 py-2 text-left disabled:opacity-40 ${
                    fundedBy === value ? "border-accent bg-accent-soft" : "border-line bg-surface"
                  }`}
                >
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="block text-xs text-muted">{sub}</span>
                </button>
              );
            })}
          </div>
          {fundedBy === "savings" && ((foreign ? previewFen : parseYuan(amount)) ?? 0) > props.savingsBalanceFen && (
            <p className="mt-2 text-sm text-danger">That&apos;s more than the Savings Box has.</p>
          )}
          {fundedBy === "other" && (
            <label className="mt-3 flex flex-col gap-1.5">
              <span className="text-sm font-medium text-muted">Who paid? (optional)</span>
              <input
                value={paidBy}
                onChange={(e) => setPaidBy(e.target.value)}
                maxLength={60}
                placeholder="Koko"
                className="h-12 rounded-xl border border-line bg-surface px-4 text-base outline-none focus:border-accent"
              />
              <span className="text-xs text-muted">Saved in your history, but not counted in your budget, Savings Box or bank.</span>
            </label>
          )}
        </fieldset>
      )}

      {result?.message && (
        <div
          role={result.ok ? "status" : "alert"}
          className={`flex items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm ${
            result.ok ? "bg-accent-soft" : "bg-danger-soft text-danger"
          }`}
        >
          <span>{result.message}</span>
          {result.ok && lastSavedId && props.mode === "create" && (
            <button type="button" onClick={undo} disabled={pending} className="font-semibold text-accent">
              Undo
            </button>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={pending}
        className="h-14 rounded-2xl bg-accent text-base font-semibold text-on-accent shadow-card disabled:opacity-60"
      >
        {pending ? "Saving…" : props.mode === "edit" ? "Save changes" : "Save expense"}
      </button>

      {props.mode === "edit" && (
        <button
          type="button"
          onClick={remove}
          disabled={pending}
          className={`h-12 rounded-2xl border text-sm font-semibold disabled:opacity-60 ${
            confirmingDelete ? "border-danger bg-danger text-white" : "border-line text-danger"
          }`}
        >
          {confirmingDelete ? "Tap again to delete permanently" : "Delete expense"}
        </button>
      )}
    </form>
  );
}
