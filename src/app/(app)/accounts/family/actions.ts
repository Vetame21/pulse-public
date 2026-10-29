"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { listFamily } from "@/lib/data/family";
import { getSettings } from "@/lib/data/settings";
import { isValidISODate, todayIn } from "@/lib/dates";
import { friendlyDbError } from "@/lib/db-errors";
import { loanFen } from "@/lib/ledgers";
import { moneyFormat, parseYuan } from "@/lib/money";
import type { ActionState } from "../../actions";

const FamilySchema = z.object({
  id: z.uuid(),
  kind: z.enum(["received", "paid"]),
  from: z.string().trim().min(1, "Whose money is it? e.g. Alex").max(60),
  amount: z.string(),
  date: z.string().refine(isValidISODate, "Pick a valid date."),
  person: z.string().trim().max(100),
  purpose: z.string().trim().max(200),
  note: z.string().trim().max(500),
});

/** Record money someone in your family sent you, or money you paid on for them. Never touches your budget. */
export async function addFamilyEntry(_prev: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = FamilySchema.safeParse(Object.fromEntries(["id", "kind", "from", "amount", "date", "person", "purpose", "note"].map((k) => [k, fd.get(k) ?? ""])));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the form." };
  const f = parsed.data;
  const amountFen = parseYuan(f.amount);
  if (!amountFen) return { ok: false, message: "Enter an amount like 800." };

  try {
    const { supabase, user } = await requireUser();
    const settings = await getSettings(supabase, user.id);
    const fmt = moneyFormat(settings.homeCurrency);
    if (f.date > todayIn(settings.timezone)) return { ok: false, message: "That date is in the future." };

    // Paying more than they have is a loan from your own money: only with an explicit tick.
    let lentFen = 0;
    if (f.kind === "paid") {
      const { people } = await listFamily(supabase);
      lentFen = loanFen(people.find((p) => p.name === f.from)?.balanceFen ?? 0, amountFen);
      if (lentFen > 0 && fd.get("confirmLoan") !== "on") {
        return { ok: false, message: `That lends ${fmt(lentFen)} of your own money to ${f.from}. Tick "Lend the rest" to confirm.` };
      }
    }

    const { error } = await supabase.from("family_transactions").insert({
      id: f.id,
      txn_date: f.date,
      kind: f.kind,
      from_person: f.from,
      keep_rest: f.kind === "received" && fd.get("keepRest") === "on",
      amount_fen: amountFen,
      person: f.person || null,
      purpose: f.purpose || null,
      note: f.note || null,
    });
    if (error && error.code !== "23505") return { ok: false, message: friendlyDbError(error, "Couldn't save. Try again.") };
    refresh();
    return {
      ok: true,
      message:
        f.kind === "received"
          ? `${f.from} sent +${fmt(amountFen)}.`
          : `Paid ${fmt(amountFen)}${f.person ? ` to ${f.person}` : ""}${lentFen > 0 ? ` (${fmt(lentFen)} lent to ${f.from})` : ""}.`,
    };
  } catch (error) {
    console.error("addFamilyEntry failed", error);
    return { ok: false, message: "Couldn't reach the database. Nothing was saved; try again." };
  }
}

export async function deleteFamilyEntry(id: string): Promise<ActionState> {
  if (!z.uuid().safeParse(id).success) return { ok: false, message: "Invalid entry." };
  try {
    const { supabase } = await requireUser();
    const { error } = await supabase.from("family_transactions").delete().eq("id", id);
    if (error) return { ok: false, message: friendlyDbError(error, "Couldn't delete. Try again.") };
    refresh();
    return { ok: true, message: "Deleted." };
  } catch (error) {
    console.error("deleteFamilyEntry failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}

/** "The rest is mine": what's left of someone's money becomes yours (it stays in your account). */
export async function keepFamilyRest(from: string): Promise<ActionState> {
  const name = z.string().trim().min(1).max(60).safeParse(from);
  if (!name.success) return { ok: false, message: "Pick whose money it is." };
  try {
    const { supabase, user } = await requireUser();
    const [settings, { people }] = await Promise.all([getSettings(supabase, user.id), listFamily(supabase)]);
    const fmt = moneyFormat(settings.homeCurrency);
    const person = people.find((p) => p.name === name.data);
    if (!person || !person.keepRest) return { ok: false, message: `${name.data}'s money is all to pass on.` };
    if (person.balanceFen <= 0) return { ok: false, message: `Nothing left of ${person.name}'s money.` };
    const { error } = await supabase.from("family_transactions").insert({
      txn_date: todayIn(settings.timezone),
      kind: "kept",
      from_person: person.name,
      amount_fen: person.balanceFen,
    });
    if (error) return { ok: false, message: friendlyDbError(error, "Couldn't save. Try again.") };
    refresh();
    return { ok: true, message: `${fmt(person.balanceFen)} is yours now.` };
  } catch (error) {
    console.error("keepFamilyRest failed", error);
    return { ok: false, message: "Couldn't reach the database. Try again." };
  }
}
