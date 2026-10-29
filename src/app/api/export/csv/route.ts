import { fetchAllRows } from "@/lib/data/backup";
import { getSettings } from "@/lib/data/settings";
import { category } from "@/lib/categories";
import { type CurrencyCode, formatMinor } from "@/lib/currency";
import { toCsv } from "@/lib/csv";
import { todayIn } from "@/lib/dates";
import { fenToDecimal } from "@/lib/money";
import { unauthorized, userForRoute } from "@/lib/route-auth";

type R = Record<string, unknown>;
// "Amount" is in your home currency (RMB or HKD).
const HEADER = ["Date", "Account", "Type", "Category", "Amount", "Note"];
const NUMERIC = new Set([4]);

const SAVINGS_TYPES: Record<string, string> = {
  month_close: "Month close",
  deposit: "Deposit",
  withdrawal: "Withdrawal",
  adjustment: "Adjustment",
};
const WALLET_TYPES: Record<string, string> = { topup: "Top-up", usage: "Credit used", adjustment: "Adjustment" };

function line(date: string, account: string, type: string, cat: string, fen: number, note: string | null) {
  return [date, account, type, cat, fenToDecimal(fen), note];
}

// GET /api/export/csv → every transaction across all accounts, one row each.
// Amounts are signed from each account's point of view (money out is negative).
export async function GET() {
  const auth = await userForRoute();
  if (!auth) return unauthorized();
  try {
    const { supabase } = auth;
    const settings = await getSettings(supabase, auth.userId);
    const [expenses, savings, bills, payments, utilities, wallets, walletTxns, family, accounts, income] = await Promise.all(
      ["personal_expenses", "savings_transactions", "recurring_bills", "bill_payments", "utility_bills",
        "restaurant_wallets", "restaurant_wallet_transactions", "family_transactions", "money_accounts",
        "income_transactions"].map((t) => fetchAllRows(supabase, t)),
    );
    const accountName = new Map(accounts.map((a: R) => [a.id, String(a.name)]));
    const billName = new Map(bills.map((b: R) => [b.id, String(b.name)]));
    const walletName = new Map(wallets.map((w: R) => [w.id, String(w.name)]));
    const rows: ReturnType<typeof line>[] = [];

    for (const e of expenses as R[]) {
      const fen = Number(e.amount_fen) * (e.kind === "refund" ? 1 : -1);
      const type = `${e.kind === "refund" ? "Refund" : "Expense"}${e.funded_by === "savings" ? " (from Savings Box)" : e.funded_by === "other" ? ` (paid by ${(e.paid_by as string) || "someone else"}, not yours)` : ""}`;
      // Paid in another currency: keep what was paid and the rate in the note column.
      const paid = e.currency && e.original_minor ? `${formatMinor(Number(e.original_minor), e.currency as CurrencyCode)} at ${Number(e.fx_rate)}` : null;
      const note = [(e.note as string) || null, paid].filter(Boolean).join(" · ") || null;
      rows.push(line(String(e.txn_date), "Personal", type, category(String(e.category)).label, fen, note));
    }
    for (const s of savings as R[]) {
      rows.push(line(String(s.txn_date), "Savings", SAVINGS_TYPES[String(s.kind)] ?? String(s.kind), "", Number(s.amount_fen), (s.note as string) ?? null));
    }
    for (const p of payments as R[]) {
      rows.push(line(String(p.paid_date), "Apartment", billName.get(p.bill_id) ?? "Bill", `For ${String(p.month).slice(0, 7)}`, -Number(p.amount_fen), (p.note as string) ?? null));
    }
    for (const u of utilities as R[]) {
      const note = [u.paid_date ? null : "Unpaid", u.note].filter(Boolean).join(" · ") || null;
      rows.push(line(String(u.paid_date ?? u.period_end), "Utilities", "Electricity + Water", `${u.period_start} – ${u.period_end}`, -Number(u.total_fen), note));
    }
    for (const w of walletTxns as R[]) {
      const cash = Number(w.cash_paid_fen);
      const note = [cash > 0 ? `Cash paid ${fenToDecimal(cash)}` : null, w.note].filter(Boolean).join(" · ") || null;
      rows.push(line(String(w.txn_date), "Restaurant", WALLET_TYPES[String(w.kind)] ?? String(w.kind), walletName.get(w.wallet_id) ?? "", Number(w.credit_delta_fen), note));
    }
    for (const m of family as R[]) {
      const note = [m.purpose, m.note].filter(Boolean).join(" · ") || null;
      const type = m.kind === "received" ? "Received" : m.kind === "kept" ? "Rest is yours" : "Paid";
      rows.push(line(String(m.txn_date), `Family (${m.from_person})`, type, (m.person as string) ?? "", Number(m.amount_fen) * (m.kind === "received" ? 1 : -1), note));
    }

    for (const i of income as R[]) {
      rows.push(line(String(i.txn_date), "Money in", accountName.get(i.account_id) ?? "Income", (i.source as string) ?? "", Number(i.amount_fen), (i.note as string) ?? null));
    }

    rows.sort((a, b) => (a[0] === b[0] ? String(a[1]).localeCompare(String(b[1])) : String(a[0]) < String(b[0]) ? -1 : 1));

    return new Response(toCsv(HEADER, rows, NUMERIC), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="transactions-${todayIn(settings.timezone)}.csv"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("CSV export failed", error);
    return Response.json({ error: "Couldn't create the CSV. Try again." }, { status: 503 });
  }
}
