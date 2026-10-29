import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { familyPeople, familyTotals } from "@/lib/ledgers";
import { fetchAllRows } from "./backup";

export type FamilyRow = {
  id: string;
  txnDate: string;
  kind: "received" | "paid" | "kept";
  amountFen: number;
  from: string; // who entrusted the money
  keepRest: boolean;
  person: string | null;
  purpose: string | null;
  note: string | null;
  createdAt: string;
  balanceAfterFen: number; // that person's balance right after this entry
};

/** Family Money ledger, oldest first, with each person's running balance, per-person totals and overall totals. */
export async function listFamily(supabase: SupabaseClient) {
  const rows = (await fetchAllRows(supabase, "family_transactions"))
    .map((r) => ({
      id: String(r.id),
      txnDate: String(r.txn_date),
      kind: r.kind as FamilyRow["kind"],
      amountFen: Number(r.amount_fen),
      from: String(r.from_person),
      keepRest: Boolean(r.keep_rest),
      person: (r.person as string) ?? null,
      purpose: (r.purpose as string) ?? null,
      note: (r.note as string) ?? null,
      createdAt: String(r.created_at),
    }))
    .sort((a, b) => (a.txnDate === b.txnDate ? a.createdAt.localeCompare(b.createdAt) : a.txnDate < b.txnDate ? -1 : 1));

  const balances = new Map<string, number>();
  const withBalance: FamilyRow[] = rows.map((r) => {
    const balance = (balances.get(r.from) ?? 0) + (r.kind === "received" ? r.amountFen : -r.amountFen);
    balances.set(r.from, balance);
    return { ...r, balanceAfterFen: balance };
  });
  const people = familyPeople(rows);
  return { rows: withBalance, people, totals: familyTotals(people) };
}
