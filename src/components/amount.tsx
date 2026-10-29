import { type HomeCurrency, formatMoney } from "@/lib/money";

/** An amount in your home currency. */
export function Amount({
  fen,
  currency,
  className = "",
  sign = false,
}: {
  fen: number;
  currency: HomeCurrency;
  className?: string;
  sign?: boolean;
}) {
  return <span className={`tabular ${className}`}>{formatMoney(fen, currency, { sign })}</span>;
}
