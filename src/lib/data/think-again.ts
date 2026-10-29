import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CategoryKey } from "@/lib/categories";
import type { WaitItem } from "@/lib/think-again";
import { fetchAllRows } from "./backup";

export type ThinkItem = WaitItem & {
  name: string;
  category: CategoryKey;
  note: string | null;
  decidedOn: string | null;
  personalExpenseId: string | null;
};

export async function listThinkAgain(supabase: SupabaseClient): Promise<ThinkItem[]> {
  const rows = await fetchAllRows(supabase, "think_again_items");
  return rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    priceFen: Number(r.price_fen),
    category: r.category as CategoryKey,
    note: (r.note as string) ?? null,
    addedOn: String(r.added_on),
    decideAfter: String(r.decide_after),
    status: r.status as ThinkItem["status"],
    decidedOn: (r.decided_on as string) ?? null,
    personalExpenseId: (r.personal_expense_id as string) ?? null,
  }));
}
