// Restaurant wallets, Family Money and the Savings Box. Each is its own ledger;
// balances are always derived from rows. Amounts are integer fen.

export type WalletTxn = {
  kind: "topup" | "usage" | "adjustment";
  cashPaidFen: number;
  creditDeltaFen: number; // +600 for a top-up, −80 for a meal
};

export type WalletSummary = {
  cashPaidFen: number;
  creditReceivedFen: number;
  bonusFen: number;
  creditUsedFen: number;
  adjustmentsFen: number;
  balanceFen: number;
};

export function summarizeWallet(txns: WalletTxn[]): WalletSummary {
  const s = { cashPaidFen: 0, creditReceivedFen: 0, creditUsedFen: 0, adjustmentsFen: 0, balanceFen: 0 };
  for (const t of txns) {
    s.balanceFen += t.creditDeltaFen;
    if (t.kind === "topup") {
      s.cashPaidFen += t.cashPaidFen;
      s.creditReceivedFen += t.creditDeltaFen;
    } else if (t.kind === "usage") {
      s.creditUsedFen -= t.creditDeltaFen;
    } else {
      s.adjustmentsFen += t.creditDeltaFen;
    }
  }
  return { ...s, bonusFen: s.creditReceivedFen - s.cashPaidFen };
}

/**
 * Split a restaurant bill between wallet credit and cash. A ¥110 bill with ¥80
 * credit → ¥80 credit + ¥30 cash (the cash part counts as a Food expense).
 */
export function splitRestaurantBill(balanceFen: number, billFen: number): { creditFen: number; cashFen: number } {
  const creditFen = Math.max(0, Math.min(balanceFen, billFen));
  return { creditFen, cashFen: billFen - creditFen };
}

// "kept": the rest of someone's money became yours (it stays in your account, but it's no longer theirs).
export type PersonTxn = { kind: "received" | "paid" | "kept"; amountFen: number };

export function summarizePerson(txns: PersonTxn[]): { receivedFen: number; paidFen: number; keptFen: number; balanceFen: number } {
  let receivedFen = 0;
  let paidFen = 0;
  let keptFen = 0;
  for (const t of txns) {
    if (t.kind === "received") receivedFen += t.amountFen;
    else if (t.kind === "paid") paidFen += t.amountFen;
    else keptFen += t.amountFen;
  }
  return { receivedFen, paidFen, keptFen, balanceFen: receivedFen - paidFen - keptFen };
}

export type FamilyTxn = PersonTxn & { from: string; keepRest: boolean };
export type FamilyPerson = ReturnType<typeof summarizePerson> & { name: string; keepRest: boolean };

/**
 * Family Money per person who entrusted it. Entries oldest first. keepRest comes from
 * their latest money received: "part is to pass on, the rest is mine".
 */
export function familyPeople(txns: FamilyTxn[]): FamilyPerson[] {
  const byName = new Map<string, FamilyTxn[]>();
  for (const t of txns) byName.set(t.from, [...(byName.get(t.from) ?? []), t]);
  return [...byName].map(([name, list]) => ({
    name,
    ...summarizePerson(list),
    keepRest: list.findLast((t) => t.kind === "received")?.keepRest ?? false,
  }));
}

/** Money you hold for others (not yours) and money they owe you, kept apart per person. */
export function familyTotals(people: { balanceFen: number }[]): { heldFen: number; owedFen: number } {
  return {
    heldFen: people.reduce((s, p) => s + Math.max(0, p.balanceFen), 0),
    owedFen: people.reduce((s, p) => s + Math.max(0, -p.balanceFen), 0),
  };
}

/**
 * How much of a payment for someone is lent from your own money: the part above their
 * (positive) balance. A negative balance means they owe you; money they send later
 * repays that first, because it's all one running balance.
 */
export function loanFen(balanceFen: number, amountFen: number): number {
  return Math.max(0, amountFen - Math.max(0, balanceFen));
}

/** A payment from someone's money must not exceed what they have sent (record their transfer first). */
export function canPayFromHeld(balanceFen: number, amountFen: number): boolean {
  return amountFen > 0 && amountFen <= balanceFen;
}

export function savingsBalance(txns: { amountFen: number }[]): number {
  return txns.reduce((sum, t) => sum + t.amountFen, 0);
}

/** "My Money": real balances minus family money sitting in your accounts. */
export function myMoney(accountsTotalFen: number, familyBalanceFen: number): { yoursFen: number; heldFen: number } {
  const heldFen = Math.max(0, familyBalanceFen);
  return { yoursFen: accountsTotalFen - heldFen, heldFen };
}
