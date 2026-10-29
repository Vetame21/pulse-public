// Backup file format (shared by export, validation and restore).
import { z } from "zod";
import { isValidISODate } from "./dates";
import { version as APP_VERSION } from "../../package.json";

export { APP_VERSION };
export const BACKUP_FORMAT = "pulse-backup";
/** Bump when the database schema changes in a way that affects backups. */
export const BACKUP_SCHEMA_VERSION = 1;

/** Every table in the backup. Order doesn't matter here; the database restores parents first. */
export const BACKUP_TABLES = [
  "settings",
  "monthly_budgets",
  "personal_expenses",
  "monthly_closings",
  "savings_transactions",
  "recurring_bills",
  "bill_payments",
  "utility_bills",
  "restaurant_wallets",
  "restaurant_wallet_transactions",
  "family_transactions",
  "money_accounts",
  "income_transactions",
  "balance_checks",
  "think_again_items",
  "calendar_events",
  "semesters",
  "classes",
  "birthdays",
  "notices",
  "goals",
  "goal_steps",
  "goal_entries",
  "goal_checkins",
  "day_plans",
  "account_transfers",
] as const;

export type BackupTable = (typeof BACKUP_TABLES)[number];
type Row = Record<string, unknown>;

const uuid = z.uuid();
const isoDate = z.string().refine(isValidISODate, "invalid date");
const fen = z.number().int().safe();

const row = z.record(z.string(), z.unknown());
const rowWithId = row.refine((r) => uuid.safeParse(r.id).success, "every row needs a valid id");

// Light checks on the columns the app relies on most; the database enforces the rest.
const personalExpense = rowWithId.refine(
  (r) => isoDate.safeParse(r.txn_date).success && fen.safeParse(r.amount_fen).success && Number(r.amount_fen) > 0,
  "personal expense with an invalid date or amount",
);
const datedAmount = rowWithId.refine(
  (r) => isoDate.safeParse(r.txn_date).success && fen.safeParse(r.amount_fen).success,
  "row with an invalid date or amount",
);

// Every Family Money entry says whose money it is.
const familyEntry = datedAmount.refine((r) => typeof r.from_person === "string" && r.from_person.trim() !== "", "Family Money entry without a name");

const tablesShape = Object.fromEntries(
  BACKUP_TABLES.map((t) => [
    t,
    z
      .array(
        t === "settings" ? row : t === "personal_expenses" ? personalExpense
          : t === "family_transactions" ? familyEntry
          : t === "savings_transactions" || t === "income_transactions" ? datedAmount : rowWithId,
      )
      .default([]),
  ]),
) as Record<BackupTable, z.ZodDefault<z.ZodArray<typeof row>>>;

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, { message: "This file isn't a Pulse backup." }),
  schema_version: z
    .number()
    .int()
    .max(BACKUP_SCHEMA_VERSION, "This backup was made by a newer version of the app. Update the app first."),
  app_version: z.string(),
  exported_at: z.string(),
  timezone: z.string().optional(),
  tables: z.object(tablesShape),
});

export type Backup = z.infer<typeof BackupSchema>;

export type BackupSummary = {
  exportedAt: string;
  appVersion: string;
  transactions: number;
  personalExpenses: number;
  months: string[]; // "2026-08", …
  savingsRecords: number;
  closings: number;
  familyRecords: number;
  restaurantWallets: number;
  restaurantTransactions: number;
  totalRows: number;
};

export function summarizeBackup(b: Backup): BackupSummary {
  const t = b.tables;
  const months = new Set<string>();
  for (const r of t.personal_expenses as Row[]) months.add(String(r.txn_date).slice(0, 7));
  for (const r of t.monthly_budgets as Row[]) months.add(String(r.month).slice(0, 7));
  const count = (name: BackupTable) => t[name].length;
  return {
    exportedAt: b.exported_at,
    appVersion: b.app_version,
    transactions:
      count("personal_expenses") + count("savings_transactions") + count("bill_payments") + count("utility_bills") +
      count("restaurant_wallet_transactions") + count("family_transactions") + count("income_transactions"),
    personalExpenses: count("personal_expenses"),
    months: [...months].filter((m) => /^\d{4}-\d{2}$/.test(m)).sort(),
    savingsRecords: count("savings_transactions"),
    closings: count("monthly_closings"),
    familyRecords: count("family_transactions"),
    restaurantWallets: count("restaurant_wallets"),
    restaurantTransactions: count("restaurant_wallet_transactions"),
    totalRows: BACKUP_TABLES.reduce((sum, name) => sum + count(name), 0),
  };
}

export function backupFilename(date: string) {
  return `pulse-backup-${date}.json`;
}
