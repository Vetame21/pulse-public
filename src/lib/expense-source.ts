/**
 * Expenses created by a restaurant wallet must be changed from the wallet
 * (they're tied to its credit). Everything else, typed in by hand or bought
 * from the Think Again list, can be edited and deleted normally.
 */
export function isLinkedToWallet(source: string): boolean {
  return source === "restaurant_topup" || source === "restaurant_cash";
}
