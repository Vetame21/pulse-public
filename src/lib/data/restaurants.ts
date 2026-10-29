import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type WalletSummary, summarizeWallet } from "@/lib/ledgers";
import { fetchAllRows } from "./backup";

export type Wallet = { id: string; name: string; note: string | null; archived: boolean; summary: WalletSummary };
export type WalletTxnRow = {
  id: string;
  walletId: string;
  txnDate: string;
  kind: "topup" | "usage" | "adjustment";
  cashPaidFen: number;
  creditDeltaFen: number;
  personalExpenseId: string | null;
  note: string | null;
  createdAt: string;
};

function toTxn(r: Record<string, unknown>): WalletTxnRow {
  return {
    id: String(r.id),
    walletId: String(r.wallet_id),
    txnDate: String(r.txn_date),
    kind: r.kind as WalletTxnRow["kind"],
    cashPaidFen: Number(r.cash_paid_fen),
    creditDeltaFen: Number(r.credit_delta_fen),
    personalExpenseId: (r.personal_expense_id as string) ?? null,
    note: (r.note as string) ?? null,
    createdAt: String(r.created_at),
  };
}

export async function listWallets(supabase: SupabaseClient): Promise<Wallet[]> {
  const [wallets, txns] = await Promise.all([
    fetchAllRows(supabase, "restaurant_wallets"),
    fetchAllRows(supabase, "restaurant_wallet_transactions"),
  ]);
  const byWallet = new Map<string, WalletTxnRow[]>();
  for (const t of txns.map(toTxn)) byWallet.set(t.walletId, [...(byWallet.get(t.walletId) ?? []), t]);
  return wallets
    .map((w) => ({
      id: String(w.id),
      name: String(w.name),
      note: (w.note as string) ?? null,
      archived: Boolean(w.archived),
      summary: summarizeWallet(byWallet.get(String(w.id)) ?? []),
    }))
    .sort((a, b) => Number(a.archived) - Number(b.archived) || b.summary.balanceFen - a.summary.balanceFen || a.name.localeCompare(b.name));
}

export async function getWallet(supabase: SupabaseClient, id: string) {
  const [{ data: wallet, error }, { data: txns, error: txnError }] = await Promise.all([
    supabase.from("restaurant_wallets").select("id, name, note, archived").eq("id", id).maybeSingle(),
    supabase
      .from("restaurant_wallet_transactions")
      .select("*")
      .eq("wallet_id", id)
      .order("txn_date", { ascending: false })
      .order("created_at", { ascending: false }),
  ]);
  if (error) throw new Error(`Couldn't load the wallet: ${error.message}`);
  if (txnError) throw new Error(`Couldn't load the wallet: ${txnError.message}`);
  if (!wallet) return null;
  const rows = txns.map(toTxn);
  return { ...wallet, summary: summarizeWallet(rows), txns: rows };
}
