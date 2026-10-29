// Checks that a signed-out visitor can't read any financial table.
// Run: npm run check:security   (reads SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY from .env.local)
import { createClient } from "@supabase/supabase-js";

const TABLES = [
  "settings", "monthly_budgets", "personal_expenses", "monthly_closings",
  "savings_transactions", "recurring_bills", "bill_payments", "utility_bills",
  "restaurant_wallets", "restaurant_wallet_transactions", "family_transactions",
  "money_accounts", "balance_checks", "think_again_items",
  "income_transactions", "calendar_events", "semesters", "classes", "birthdays", "notices", "goals", "goal_steps", "goal_entries", "goal_checkins", "day_plans", "account_transfers", "ai_usage", "login_attempts", "push_subscriptions", "push_log",
];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY in .env.local");
  process.exit(1);
}

const anon = createClient(url, key, { auth: { persistSession: false } });
let leaks = 0;

for (const table of TABLES) {
  const { data, error } = await anon.from(table).select("*").limit(1);
  if (error) {
    console.log(`  ok   ${table.padEnd(32)} blocked (${error.code ?? error.message})`);
  } else if (data.length === 0) {
    console.log(`  ok   ${table.padEnd(32)} returns nothing`);
  } else {
    leaks++;
    console.log(`  LEAK ${table.padEnd(32)} signed-out visitor can read rows!`);
  }

  const { error: writeError } = await anon.from(table).insert({});
  if (!writeError) {
    leaks++;
    console.log(`  LEAK ${table.padEnd(32)} signed-out visitor can insert!`);
  }
}

console.log(leaks === 0 ? "\nAll tables are private." : `\n${leaks} problem(s) found — do not use the app until fixed.`);
process.exit(leaks === 0 ? 0 : 1);
