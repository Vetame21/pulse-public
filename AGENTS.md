<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working on Pulse

Rules for anyone changing this repo, human or coding agent (Claude Code reads this file through `CLAUDE.md`; Codex reads it directly). If a rule here and your habit disagree, follow this file.

## What Pulse is

A private life app (day, money, plans) for people in Mainland China or Hong Kong. Next.js 16 App Router + TypeScript, Tailwind 4, Supabase (Postgres + Auth), Zod, Vitest. See the README for features and setup.

## How to work

- Work on a branch and open a pull request. Keep diffs focused: no drive-by refactors or reformatting.
- **Pull requests say:** what changed, *why* it was done that way (1–2 lines), and *what could break*.
- Before opening a PR, run: `npm test`, `npm run typecheck`, `npm run lint`, `npm run build`.
- UI text is English. Keep it short and plain.

## Data and secrets

- **Never commit personal data** (real names, timetables, balances, birthdays) or secrets. Test fixtures and demo data are clearly fake.
- `.env.local` is git-ignored. **Never paste keys into code, chat, issues or PRs.** Server secrets (`SUPABASE_SECRET_KEY`, `VAPID_PRIVATE_KEY`, `GEMINI_API_KEY`) live only in your host's environment settings.
- **Develop against your own Supabase project**: create a free one, run the SQL in `supabase/`, and put its URL + publishable key in `.env.local`.

## Database rules

- Schema changes are **new numbered files** in `supabase/migrations/` (`0002_…sql`, …). Pull `main` first and take the next free number; never edit a migration that production already ran (write a new one).
- Migrations are applied by pasting them into the Supabase SQL editor, in order, **before** the code that needs them is deployed. Make them safe to run twice where possible (`if not exists`, `drop … if exists`).
- **Every user table:** a `user_id uuid not null default auth.uid() references auth.users on delete cascade` column, `enable row level security`, `revoke all … from anon`, and an owner-only policy (`user_id = (select auth.uid())`).
- If the table holds user data worth keeping, add it to `BACKUP_TABLES` in `src/lib/backup.ts` (bump `BACKUP_SCHEMA_VERSION`), to the `restore_backup` table list in the migration (parents before children), and to `scripts/check-security.mjs`. Then `npm run check:security` must print "All tables are private."
- `security definer` functions: `set search_path = public`, check `auth.uid()` yourself, and `revoke all … from public, anon` before granting to `authenticated`.

## Code rules

- **The browser never talks to Supabase.** Database access happens only in server code (`src/lib/data/*`, server actions, route handlers) with the signed-in user's session, so Row Level Security applies. The only exception is the scheduled notification job (`src/lib/push/run.ts`), which uses the secret key and must filter every query by `user_id`.
- **Money is integer cents of the account's home currency** (`*_fen` columns; ¥ for Mainland accounts, HK$ for Hong Kong ones). Never use floats for stored money. Format with `moneyFormat(settings.homeCurrency)` / `formatMoney`, never a hard-coded "¥". Parse input with `parseYuan` / `parseMinor` (they accept a decimal comma).
- **Dates are `ISODate` strings** (`"2026-10-21"`) in the account's timezone (`todayIn(settings.timezone)`); use the helpers in `src/lib/dates.ts`.
- **Server actions** validate input with Zod, return `ActionState` (`{ ok, message }`) instead of throwing, and call `refresh()` after a write. Create forms send a client-generated id so a retry can't save twice (`useSafeForm`, error `23505` = already saved). Wrap calls from the browser in `safeCall`.
- **Per-account features** (`settings.features`, `region`, `homeCurrency`) decide what's shown; don't hard-code one person's setup (bank names, rent, family money).
- Put logic in **pure, tested functions** in `src/lib/` and keep pages thin. Add or update Vitest tests for every change in logic.
- Paid or AI APIs need a per-account daily limit (`take_ai_quota`).
- **Demo mode** (`PULSE_DEMO=1`) runs the same data code against in-memory Postgres through `src/lib/demo-db`. If you use a Supabase query method the adapter doesn't know yet, it throws: add it there with a test, and check the app with `PULSE_DEMO=1 npm run dev`.
- No new dependencies without agreeing in the PR why the standard library or existing code can't do it.
- No pie or donut charts.
