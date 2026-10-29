-- Pulse: the whole database schema in one file.
-- Run it once in the Supabase SQL editor on a new, empty project.
-- Every table has Row Level Security and anon gets nothing. User tables have an owner-only
-- policy; the internal ones (ai_usage, login_attempts, push_log) have none and are reached
-- only through security definer functions or the notification job.
-- Money columns (*_fen) are integer cents of the account's home currency.

CREATE FUNCTION public.check_savings_balance() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtext('savings:' || auth.uid()::text));
  end if;
  if exists (
    select 1 from public.savings_transactions group by user_id having sum(amount_fen) < 0
  ) then
    raise exception 'SAVINGS_NEGATIVE: The Savings Box can''t go below ¥0.';
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.check_wallet_balances() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null then
    perform pg_advisory_xact_lock(hashtext('wallets:' || auth.uid()::text));
  end if;
  if exists (
    select 1 from public.restaurant_wallet_transactions group by wallet_id having sum(credit_delta_fen) < 0
  ) then
    raise exception 'WALLET_NEGATIVE: A restaurant wallet can''t go below ¥0.';
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.close_month(p_month date, p_budget_fen bigint, p_is_partial boolean, p_today date) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  next_month date := (p_month + interval '1 month')::date;
  v_spent bigint;
  v_saved bigint;
  v_over bigint;
  v_closing uuid;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if extract(day from p_month) <> 1 then raise exception 'Invalid month'; end if;
  if p_today < next_month then raise exception 'MONTH_NOT_ENDED: This month hasn''t ended yet.'; end if;
  if p_budget_fen < 0 then raise exception 'Invalid budget'; end if;

  perform pg_advisory_xact_lock(hashtext('savings:' || uid::text));

  if exists (select 1 from public.monthly_closings where user_id = uid and month = p_month) then
    raise exception 'ALREADY_CLOSED: This month is already closed.';
  end if;

  select coalesce(sum(case when kind = 'refund' then -amount_fen else amount_fen end), 0)
    into v_spent
    from public.personal_expenses
   where user_id = uid and funded_by = 'budget' and txn_date >= p_month and txn_date < next_month;

  v_saved := greatest(0, p_budget_fen - v_spent);
  v_over := greatest(0, v_spent - p_budget_fen);

  insert into public.monthly_budgets (user_id, month, budget_fen, is_partial)
  values (uid, p_month, p_budget_fen, p_is_partial)
  on conflict (user_id, month) do update set budget_fen = excluded.budget_fen, is_partial = excluded.is_partial;

  insert into public.monthly_closings (user_id, month, budget_fen, spent_fen, saved_fen, over_fen, is_partial)
  values (uid, p_month, p_budget_fen, v_spent, v_saved, v_over, p_is_partial)
  returning id into v_closing;

  if v_saved > 0 then
    insert into public.savings_transactions
      (user_id, txn_date, amount_fen, kind, closing_id, note)
    values
      (uid, next_month - 1, v_saved, 'month_close', v_closing,
       'Saved from ' || trim(to_char(p_month, 'Month')) || ' ' || to_char(p_month, 'YYYY'));
  end if;

  return jsonb_build_object('budget_fen', p_budget_fen, 'spent_fen', v_spent, 'saved_fen', v_saved, 'over_fen', v_over);
end;
$$;

CREATE FUNCTION public.delete_restaurant_txn(p_id uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_expense uuid;
  v_wallet uuid;
begin
  select personal_expense_id, wallet_id into v_expense, v_wallet
    from public.restaurant_wallet_transactions where id = p_id;
  if v_wallet is null then return; end if;
  perform 1 from public.restaurant_wallets where id = v_wallet for update;
  delete from public.restaurant_wallet_transactions where id = p_id;
  if v_expense is not null then
    delete from public.personal_expenses where id = v_expense;
  end if;
end;
$$;

CREATE FUNCTION public.login_guard(p_key text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_until timestamptz;
begin
  if p_key !~ '^[0-9a-f]{64}$' then raise exception 'Invalid key'; end if;
  select locked_until into v_until from public.login_attempts where key = p_key;
  if v_until is null or v_until <= now() then return 0; end if;
  return ceil(extract(epoch from (v_until - now())))::integer;
end;
$_$;

CREATE FUNCTION public.login_record(p_key text, p_success boolean, p_limit integer) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
declare
  v_failures integer;
  window_len constant interval := interval '15 minutes';
  lock_len constant interval := interval '15 minutes';
begin
  if p_key !~ '^[0-9a-f]{64}$' or p_limit not between 1 and 100 then
    raise exception 'Invalid input';
  end if;

  -- Housekeeping: forget old, unlocked entries.
  delete from public.login_attempts
   where window_started_at < now() - interval '1 day'
     and (locked_until is null or locked_until < now());

  if p_success then
    delete from public.login_attempts where key = p_key;
    return jsonb_build_object('locked_seconds', 0, 'tries_left', p_limit);
  end if;

  insert into public.login_attempts as a (key, failures, window_started_at)
  values (p_key, 1, now())
  on conflict (key) do update set
    failures = case when a.window_started_at < now() - window_len then 1 else a.failures + 1 end,
    window_started_at = case when a.window_started_at < now() - window_len then now() else a.window_started_at end
  returning failures into v_failures;

  if v_failures >= p_limit then
    update public.login_attempts
       set locked_until = now() + lock_len, failures = 0, window_started_at = now()
     where key = p_key;
    return jsonb_build_object('locked_seconds', extract(epoch from lock_len)::integer, 'tries_left', 0);
  end if;

  return jsonb_build_object('locked_seconds', 0, 'tries_left', p_limit - v_failures);
end;
$_$;

CREATE FUNCTION public.reopen_month(p_month date) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Not signed in'; end if;
  delete from public.monthly_closings where user_id = uid and month = p_month;
  if not found then raise exception 'NOT_CLOSED: This month isn''t closed.'; end if;
end;
$$;

CREATE FUNCTION public.restaurant_topup(p_id uuid, p_wallet uuid, p_date date, p_cash_fen bigint, p_credit_fen bigint, p_note text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
  v_expense uuid := gen_random_uuid();
begin
  if p_cash_fen <= 0 or p_credit_fen < p_cash_fen then
    raise exception 'INVALID_TOPUP: Credit received must be at least the cash paid.';
  end if;
  if exists (select 1 from public.restaurant_wallet_transactions where id = p_id) then
    return; -- already saved (a retry)
  end if;
  select name into v_name from public.restaurant_wallets where id = p_wallet;
  if v_name is null then raise exception 'Wallet not found'; end if;

  insert into public.personal_expenses (id, txn_date, amount_fen, category, source, note)
  values (v_expense, p_date, p_cash_fen, 'food', 'restaurant_topup', 'Top-up: ' || v_name);

  insert into public.restaurant_wallet_transactions
    (id, wallet_id, txn_date, kind, cash_paid_fen, credit_delta_fen, personal_expense_id, note)
  values
    (p_id, p_wallet, p_date, 'topup', p_cash_fen, p_credit_fen, v_expense, p_note);
end;
$$;

CREATE FUNCTION public.restaurant_use(p_id uuid, p_wallet uuid, p_date date, p_bill_fen bigint, p_note text, p_allow_cash boolean) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v_name text;
  v_balance bigint;
  v_credit bigint;
  v_cash bigint;
  v_expense uuid;
begin
  if p_bill_fen <= 0 then raise exception 'Invalid amount'; end if;
  if exists (select 1 from public.restaurant_wallet_transactions where id = p_id) then
    return jsonb_build_object('duplicate', true);
  end if;

  select name into v_name from public.restaurant_wallets where id = p_wallet for update;
  if v_name is null then raise exception 'Wallet not found'; end if;
  select coalesce(sum(credit_delta_fen), 0) into v_balance
    from public.restaurant_wallet_transactions where wallet_id = p_wallet;

  v_credit := least(v_balance, p_bill_fen);
  v_cash := p_bill_fen - v_credit;
  if v_cash > 0 and not p_allow_cash then
    raise exception 'INSUFFICIENT_CREDIT:%', v_balance;
  end if;

  if v_cash > 0 then
    v_expense := gen_random_uuid();
    insert into public.personal_expenses (id, txn_date, amount_fen, category, source, note)
    values (v_expense, p_date, v_cash, 'food', 'restaurant_cash',
            v_name || ': paid in cash (credit ran out)' || coalesce(' · ' || p_note, ''));
  end if;

  if v_credit > 0 then
    insert into public.restaurant_wallet_transactions
      (id, wallet_id, txn_date, kind, cash_paid_fen, credit_delta_fen, personal_expense_id, note)
    values
      (p_id, p_wallet, p_date, 'usage', 0, -v_credit, v_expense, p_note);
  end if;

  return jsonb_build_object('credit_fen', v_credit, 'cash_fen', v_cash);
end;
$$;

CREATE FUNCTION public.restore_backup(payload jsonb, mode text) RETURNS jsonb
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $_$
declare
  uid uuid := auth.uid();
  tables text[] := array[
    'monthly_budgets', 'family_transactions', 'utility_bills',
    'money_accounts', 'income_transactions', 'account_transfers', 'calendar_events', 'semesters', 'classes', 'birthdays', 'notices', 'goals', 'goal_steps', 'goal_entries', 'goal_checkins', 'day_plans', 'recurring_bills', 'restaurant_wallets', 'monthly_closings',
    'personal_expenses', 'balance_checks', 'bill_payments',
    'restaurant_wallet_transactions', 'savings_transactions', 'think_again_items'
  ];
  t text;
  rows_in_backup integer;
  inserted integer;
  summary jsonb := '{}'::jsonb;
  s jsonb;
begin
  if uid is null then raise exception 'Not signed in'; end if;
  if mode not in ('merge', 'replace') then raise exception 'Unknown restore mode: %', mode; end if;
  if payload->>'format' is distinct from 'pulse-backup' then
    raise exception 'This file is not a Pulse backup';
  end if;

  perform set_config('app.restoring', 'on', true);

  if mode = 'replace' then
    for i in reverse array_length(tables, 1)..1 loop
      execute format('delete from public.%I where user_id = $1', tables[i]) using uid;
    end loop;
  end if;

  foreach t in array tables loop
    rows_in_backup := coalesce(jsonb_array_length(payload->'tables'->t), 0);
    inserted := 0;
    if rows_in_backup > 0 then
      execute format(
        'insert into public.%1$I
           select * from jsonb_populate_recordset(
             null::public.%1$I,
             (select jsonb_agg(e || jsonb_build_object(''user_id'', $1))
                from jsonb_array_elements($2) e))
         on conflict do nothing',
        t) using uid, payload->'tables'->t;
      get diagnostics inserted = row_count;
    end if;
    summary := summary || jsonb_build_object(t, jsonb_build_object('in_backup', rows_in_backup, 'added', inserted));
  end loop;

  s := payload->'tables'->'settings'->0;
  if mode = 'replace' and s is not null then
    update public.settings set
      timezone            = coalesce(s->>'timezone', timezone),
      tracking_start_date = coalesce((s->>'tracking_start_date')::date, tracking_start_date),
      default_budget_fen  = coalesce((s->>'default_budget_fen')::bigint, default_budget_fen),
      think_again_days    = coalesce((s->>'think_again_days')::integer, think_again_days)
    where user_id = uid;
  end if;

  perform set_config('app.restoring', 'off', true);
  return summary;
end;
$_$;

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

CREATE FUNCTION public.sync_savings_expense() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(current_setting('app.restoring', true), '') = 'on' then
    return null;
  end if;

  if tg_op = 'INSERT' then
    if new.funded_by = 'savings' then
      insert into public.savings_transactions
        (user_id, txn_date, amount_fen, kind, personal_expense_id, note)
      values
        (new.user_id, new.txn_date, -new.amount_fen, 'withdrawal', new.id,
         coalesce('Spent: ' || new.note, 'Spent from the Savings Box'));
    end if;
  elsif tg_op = 'UPDATE' then
    if old.funded_by <> new.funded_by then
      raise exception 'Can''t change where an expense was paid from. Delete it and add it again.';
    end if;
    if new.funded_by = 'savings' then
      update public.savings_transactions
         set amount_fen = -new.amount_fen,
             txn_date = new.txn_date,
             note = coalesce('Spent: ' || new.note, 'Spent from the Savings Box')
       where personal_expense_id = new.id;
    end if;
  end if;
  return null;
end;
$$;

CREATE FUNCTION public.take_ai_quota(p_kind text, p_limit integer) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  uid uuid := auth.uid();
  n integer;
begin
  if uid is null or p_limit not between 1 and 100 then
    return false;
  end if;
  insert into ai_usage (user_id, day, kind, count)
  values (uid, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update
    set count = ai_usage.count + 1
    where ai_usage.count < p_limit
  returning count into n;
  return n is not null;
end;
$$;

CREATE FUNCTION public.think_again_buy(p_item uuid, p_expense uuid, p_date date, p_amount_fen bigint, p_funded_by text) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v record;
begin
  select * into v from public.think_again_items where id = p_item for update;
  if v.id is null then raise exception 'Item not found'; end if;
  if v.status = 'bought' and v.personal_expense_id = p_expense then return; end if; -- retry
  if v.status <> 'waiting' then raise exception 'ALREADY_DECIDED: This item was already decided.'; end if;
  if p_amount_fen <= 0 then raise exception 'Invalid amount'; end if;

  insert into public.personal_expenses (id, txn_date, amount_fen, category, source, funded_by, note)
  values (p_expense, p_date, p_amount_fen, v.category, 'think_again', p_funded_by, v.name);

  update public.think_again_items
     set status = 'bought', decided_on = p_date, personal_expense_id = p_expense
   where id = p_item;
end;
$$;

CREATE FUNCTION public.think_again_undo(p_item uuid) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
declare
  v record;
begin
  select * into v from public.think_again_items where id = p_item for update;
  if v.id is null then raise exception 'Item not found'; end if;
  update public.think_again_items
     set status = 'waiting', decided_on = null, personal_expense_id = null
   where id = p_item;
  if v.personal_expense_id is not null then
    delete from public.personal_expenses where id = v.personal_expense_id;
  end if;
end;
$$;

SET default_tablespace = '';

SET default_table_access_method = heap;

CREATE TABLE public.account_transfers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    from_account uuid NOT NULL,
    to_account uuid NOT NULL,
    txn_date date NOT NULL,
    amount_fen bigint NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT account_transfers_amount_fen_check CHECK ((amount_fen > 0)),
    CONSTRAINT account_transfers_check CHECK ((from_account <> to_account)),
    CONSTRAINT account_transfers_note_check CHECK ((char_length(note) <= 200))
);

CREATE TABLE public.ai_usage (
    user_id uuid NOT NULL,
    day date NOT NULL,
    kind text NOT NULL,
    count integer DEFAULT 0 NOT NULL,
    CONSTRAINT ai_usage_kind_check CHECK ((char_length(kind) <= 40))
);

CREATE TABLE public.balance_checks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    account_id uuid NOT NULL,
    checked_on date NOT NULL,
    balance_minor bigint NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    checked_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT balance_checks_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.bill_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    bill_id uuid NOT NULL,
    month date NOT NULL,
    amount_fen bigint NOT NULL,
    paid_date date NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT bill_payments_amount_fen_check CHECK ((amount_fen > 0)),
    CONSTRAINT bill_payments_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT bill_payments_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.birthdays (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    month smallint NOT NULL,
    day smallint NOT NULL,
    year smallint,
    in_memory boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT birthdays_check CHECK ((((day >= 1) AND (day <= 31)) AND (make_date(2000, (month)::integer, (day)::integer) IS NOT NULL))),
    CONSTRAINT birthdays_month_check CHECK (((month >= 1) AND (month <= 12))),
    CONSTRAINT birthdays_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT birthdays_year_check CHECK (((year >= 1900) AND (year <= 2100)))
);

CREATE TABLE public.calendar_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    date date NOT NULL,
    end_date date,
    start_time time without time zone,
    end_time time without time zone,
    location text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    kind text DEFAULT 'event'::text NOT NULL,
    lead_days smallint,
    done_at timestamp with time zone,
    CONSTRAINT calendar_events_check CHECK (((end_date IS NULL) OR (end_date >= date))),
    CONSTRAINT calendar_events_check1 CHECK (((end_time IS NULL) OR (start_time IS NOT NULL))),
    CONSTRAINT calendar_events_kind_check CHECK ((kind = ANY (ARRAY['event'::text, 'deadline'::text]))),
    CONSTRAINT calendar_events_lead_days_check CHECK (((lead_days >= 1) AND (lead_days <= 90))),
    CONSTRAINT calendar_events_location_check CHECK ((char_length(location) <= 200)),
    CONSTRAINT calendar_events_notes_check CHECK ((char_length(notes) <= 2000)),
    CONSTRAINT calendar_events_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);

CREATE TABLE public.classes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    semester_id uuid NOT NULL,
    title text NOT NULL,
    title_zh text,
    teacher text,
    room text,
    weekday smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    weeks smallint[] NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT classes_check CHECK ((end_time > start_time)),
    CONSTRAINT classes_room_check CHECK ((char_length(room) <= 50)),
    CONSTRAINT classes_teacher_check CHECK ((char_length(teacher) <= 100)),
    CONSTRAINT classes_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200))),
    CONSTRAINT classes_title_zh_check CHECK ((char_length(title_zh) <= 200)),
    CONSTRAINT classes_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7))),
    CONSTRAINT classes_weeks_check CHECK ((((cardinality(weeks) >= 1) AND (cardinality(weeks) <= 30)) AND (1 <= ALL (weeks)) AND (30 >= ALL (weeks))))
);

CREATE TABLE public.personal_expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    txn_date date NOT NULL,
    amount_fen bigint NOT NULL,
    category text NOT NULL,
    kind text DEFAULT 'expense'::text NOT NULL,
    source text DEFAULT 'manual'::text NOT NULL,
    funded_by text DEFAULT 'budget'::text NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    currency text DEFAULT 'CNY'::text NOT NULL,
    original_minor bigint,
    fx_rate numeric,
    fx_source text,
    paid_with text DEFAULT 'bank'::text NOT NULL,
    paid_by text,
    paid_from_account uuid,
    CONSTRAINT personal_expenses_amount_fen_check CHECK ((amount_fen > 0)),
    CONSTRAINT personal_expenses_category_check CHECK ((category = ANY (ARRAY['food'::text, 'transport'::text, 'household'::text, 'toys'::text, 'entertainment'::text, 'shopping'::text, 'travel'::text, 'other'::text]))),
    CONSTRAINT personal_expenses_currency_check CHECK ((currency ~ '^[A-Z]{3}$'::text)),
    CONSTRAINT personal_expenses_currency_complete CHECK (((original_minor IS NULL) = (fx_rate IS NULL))),
    CONSTRAINT personal_expenses_funded_by_check CHECK ((funded_by = ANY (ARRAY['budget'::text, 'savings'::text, 'other'::text]))),
    CONSTRAINT personal_expenses_fx_rate_check CHECK (((fx_rate IS NULL) OR ((fx_rate > (0)::numeric) AND (fx_rate < (100000)::numeric)))),
    CONSTRAINT personal_expenses_fx_source_check CHECK ((fx_source = ANY (ARRAY['ecb'::text, 'last'::text, 'manual'::text]))),
    CONSTRAINT personal_expenses_kind_check CHECK ((kind = ANY (ARRAY['expense'::text, 'refund'::text]))),
    CONSTRAINT personal_expenses_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT personal_expenses_original_minor_check CHECK (((original_minor IS NULL) OR (original_minor > 0))),
    CONSTRAINT personal_expenses_paid_by_check CHECK ((char_length(paid_by) <= 60)),
    CONSTRAINT personal_expenses_paid_with_check CHECK ((paid_with = ANY (ARRAY['bank'::text, 'cash'::text]))),
    CONSTRAINT personal_expenses_savings_only_expense CHECK (((funded_by = 'budget'::text) OR (kind = 'expense'::text))),
    CONSTRAINT personal_expenses_source_check CHECK ((source = ANY (ARRAY['manual'::text, 'restaurant_topup'::text, 'restaurant_cash'::text, 'think_again'::text])))
);

CREATE VIEW public.daily_personal_spending WITH (security_invoker='true') AS
 SELECT user_id,
    txn_date,
    (sum(
        CASE
            WHEN (kind = 'refund'::text) THEN (- amount_fen)
            ELSE amount_fen
        END))::bigint AS spent_fen,
    (count(*))::integer AS entries
   FROM public.personal_expenses
  WHERE (funded_by = 'budget'::text)
  GROUP BY user_id, txn_date;

CREATE TABLE public.day_plans (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    date date NOT NULL,
    body text NOT NULL,
    items jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT day_plans_body_check CHECK ((char_length(body) <= 10000)),
    CONSTRAINT day_plans_items_check CHECK ((jsonb_typeof(items) = 'array'::text))
);

CREATE TABLE public.goal_checkins (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    goal_id uuid NOT NULL,
    date date NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE public.goal_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    goal_id uuid NOT NULL,
    date date NOT NULL,
    value numeric,
    amount_fen bigint,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_entries_check CHECK (((value IS NULL) <> (amount_fen IS NULL))),
    CONSTRAINT goal_entries_note_check CHECK ((char_length(note) <= 200)),
    CONSTRAINT goal_entries_value_check CHECK (((value IS NULL) OR (abs(value) < '1000000000000'::numeric)))
);

CREATE TABLE public.goal_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    goal_id uuid NOT NULL,
    title text NOT NULL,
    "position" integer DEFAULT 0 NOT NULL,
    done_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goal_steps_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 200)))
);

CREATE TABLE public.goals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    title text NOT NULL,
    kind text NOT NULL,
    due_date date,
    target_fen bigint,
    money_source text,
    baseline_fen bigint DEFAULT 0 NOT NULL,
    habit_period text,
    habit_times smallint,
    target_value numeric,
    start_value numeric,
    unit text,
    number_mode text,
    completed_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT goals_check CHECK (((kind <> 'money'::text) OR ((target_fen IS NOT NULL) AND (money_source IS NOT NULL)))),
    CONSTRAINT goals_check1 CHECK (((kind <> 'habit'::text) OR ((habit_period IS NOT NULL) AND (habit_times IS NOT NULL)))),
    CONSTRAINT goals_check2 CHECK (((kind <> 'number'::text) OR ((target_value IS NOT NULL) AND (number_mode IS NOT NULL)))),
    CONSTRAINT goals_habit_period_check CHECK ((habit_period = ANY (ARRAY['day'::text, 'week'::text]))),
    CONSTRAINT goals_habit_times_check CHECK (((habit_times >= 1) AND (habit_times <= 7))),
    CONSTRAINT goals_kind_check CHECK ((kind = ANY (ARRAY['money'::text, 'habit'::text, 'number'::text, 'milestone'::text]))),
    CONSTRAINT goals_money_source_check CHECK ((money_source = ANY (ARRAY['manual'::text, 'savings'::text, 'main_account'::text]))),
    CONSTRAINT goals_number_mode_check CHECK ((number_mode = ANY (ARRAY['add'::text, 'set'::text]))),
    CONSTRAINT goals_start_value_check CHECK (((start_value IS NULL) OR (abs(start_value) < '1000000000000'::numeric))),
    CONSTRAINT goals_target_fen_check CHECK (((target_fen IS NULL) OR (target_fen > 0))),
    CONSTRAINT goals_target_value_check CHECK (((target_value IS NULL) OR (abs(target_value) < '1000000000000'::numeric))),
    CONSTRAINT goals_title_check CHECK (((char_length(title) >= 1) AND (char_length(title) <= 100))),
    CONSTRAINT goals_unit_check CHECK ((char_length(unit) <= 20))
);

CREATE TABLE public.income_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    account_id uuid NOT NULL,
    txn_date date NOT NULL,
    amount_fen bigint NOT NULL,
    source text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT income_transactions_amount_fen_check CHECK ((amount_fen > 0)),
    CONSTRAINT income_transactions_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT income_transactions_source_check CHECK ((char_length(source) <= 100))
);

CREATE TABLE public.login_attempts (
    key text NOT NULL,
    failures integer DEFAULT 0 NOT NULL,
    window_started_at timestamp with time zone DEFAULT now() NOT NULL,
    locked_until timestamp with time zone,
    CONSTRAINT login_attempts_key_check CHECK ((key ~ '^[0-9a-f]{64}$'::text))
);

CREATE TABLE public.family_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    txn_date date NOT NULL,
    kind text NOT NULL,
    amount_fen bigint NOT NULL,
    person text,
    purpose text,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    from_person text NOT NULL,
    keep_rest boolean DEFAULT false NOT NULL,
    CONSTRAINT family_transactions_amount_fen_check CHECK ((amount_fen > 0)),
    CONSTRAINT family_transactions_from_person_check CHECK (((char_length(from_person) >= 1) AND (char_length(from_person) <= 60))),
    CONSTRAINT family_transactions_kind_check CHECK ((kind = ANY (ARRAY['received'::text, 'paid'::text, 'kept'::text]))),
    CONSTRAINT family_transactions_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT family_transactions_person_check CHECK ((char_length(person) <= 100)),
    CONSTRAINT family_transactions_purpose_check CHECK ((char_length(purpose) <= 200))
);

CREATE TABLE public.money_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    currency text DEFAULT 'CNY'::text NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    is_main boolean DEFAULT false NOT NULL,
    CONSTRAINT money_accounts_currency_check CHECK ((currency = ANY (ARRAY['CNY'::text, 'HKD'::text]))),
    CONSTRAINT money_accounts_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100)))
);

CREATE TABLE public.monthly_budgets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    month date NOT NULL,
    budget_fen bigint NOT NULL,
    is_partial boolean DEFAULT false NOT NULL,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT monthly_budgets_budget_fen_check CHECK ((budget_fen >= 0)),
    CONSTRAINT monthly_budgets_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT monthly_budgets_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.monthly_closings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    month date NOT NULL,
    budget_fen bigint NOT NULL,
    spent_fen bigint NOT NULL,
    saved_fen bigint NOT NULL,
    over_fen bigint NOT NULL,
    is_partial boolean DEFAULT false NOT NULL,
    closed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT monthly_closings_budget_fen_check CHECK ((budget_fen >= 0)),
    CONSTRAINT monthly_closings_month_check CHECK ((EXTRACT(day FROM month) = (1)::numeric)),
    CONSTRAINT monthly_closings_over_fen_check CHECK ((over_fen >= 0)),
    CONSTRAINT monthly_closings_saved_fen_check CHECK ((saved_fen >= 0))
);

CREATE TABLE public.notices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    body text NOT NULL,
    source text,
    pinned boolean DEFAULT false NOT NULL,
    related_date date,
    linked_event_id uuid,
    archived_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT notices_body_check CHECK (((char_length(body) >= 1) AND (char_length(body) <= 5000))),
    CONSTRAINT notices_source_check CHECK ((char_length(source) <= 100))
);

CREATE TABLE public.push_log (
    user_id uuid NOT NULL,
    key text NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_log_key_check CHECK ((char_length(key) <= 200))
);

CREATE TABLE public.push_subscriptions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    device text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT push_subscriptions_auth_check CHECK (((char_length(auth) >= 16) AND (char_length(auth) <= 30))),
    CONSTRAINT push_subscriptions_device_check CHECK ((char_length(device) <= 200)),
    CONSTRAINT push_subscriptions_endpoint_check CHECK (((endpoint ~~ 'https://%'::text) AND (char_length(endpoint) <= 1000))),
    CONSTRAINT push_subscriptions_p256dh_check CHECK (((char_length(p256dh) >= 80) AND (char_length(p256dh) <= 100)))
);

CREATE TABLE public.recurring_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    kind text NOT NULL,
    default_amount_fen bigint NOT NULL,
    starts_month date NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT recurring_bills_default_amount_fen_check CHECK ((default_amount_fen >= 0)),
    CONSTRAINT recurring_bills_kind_check CHECK ((kind = ANY (ARRAY['rent'::text, 'phone'::text, 'other'::text]))),
    CONSTRAINT recurring_bills_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT recurring_bills_starts_month_check CHECK ((EXTRACT(day FROM starts_month) = (1)::numeric))
);

CREATE TABLE public.restaurant_wallet_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    wallet_id uuid NOT NULL,
    txn_date date NOT NULL,
    kind text NOT NULL,
    cash_paid_fen bigint DEFAULT 0 NOT NULL,
    credit_delta_fen bigint NOT NULL,
    personal_expense_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT restaurant_wallet_transactions_cash_paid_fen_check CHECK ((cash_paid_fen >= 0)),
    CONSTRAINT restaurant_wallet_transactions_check CHECK (((kind <> 'topup'::text) OR ((cash_paid_fen > 0) AND (credit_delta_fen >= cash_paid_fen)))),
    CONSTRAINT restaurant_wallet_transactions_check1 CHECK (((kind <> 'usage'::text) OR (credit_delta_fen < 0))),
    CONSTRAINT restaurant_wallet_transactions_credit_delta_fen_check CHECK ((credit_delta_fen <> 0)),
    CONSTRAINT restaurant_wallet_transactions_kind_check CHECK ((kind = ANY (ARRAY['topup'::text, 'usage'::text, 'adjustment'::text]))),
    CONSTRAINT restaurant_wallet_transactions_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.restaurant_wallets (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    note text,
    archived boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT restaurant_wallets_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT restaurant_wallets_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.savings_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    txn_date date NOT NULL,
    amount_fen bigint NOT NULL,
    kind text NOT NULL,
    closing_id uuid,
    personal_expense_id uuid,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT savings_transactions_amount_fen_check CHECK ((amount_fen <> 0)),
    CONSTRAINT savings_transactions_check CHECK (((kind <> 'month_close'::text) OR ((closing_id IS NOT NULL) AND (amount_fen > 0)))),
    CONSTRAINT savings_transactions_check1 CHECK (((kind <> 'deposit'::text) OR (amount_fen > 0))),
    CONSTRAINT savings_transactions_check2 CHECK (((kind <> 'withdrawal'::text) OR (amount_fen < 0))),
    CONSTRAINT savings_transactions_kind_check CHECK ((kind = ANY (ARRAY['month_close'::text, 'deposit'::text, 'withdrawal'::text, 'adjustment'::text]))),
    CONSTRAINT savings_transactions_note_check CHECK ((char_length(note) <= 500))
);

CREATE TABLE public.semesters (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    start_date date NOT NULL,
    weeks smallint NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT semesters_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 100))),
    CONSTRAINT semesters_start_date_check CHECK ((EXTRACT(isodow FROM start_date) = (1)::numeric)),
    CONSTRAINT semesters_weeks_check CHECK (((weeks >= 1) AND (weeks <= 30)))
);

CREATE TABLE public.settings (
    user_id uuid DEFAULT auth.uid() NOT NULL,
    timezone text DEFAULT 'Asia/Shanghai'::text NOT NULL,
    tracking_start_date date DEFAULT CURRENT_DATE NOT NULL,
    default_budget_fen bigint DEFAULT 0 NOT NULL,
    think_again_days integer DEFAULT 7 NOT NULL,
    last_backup_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    notify_briefing_time time without time zone DEFAULT '07:00:00'::time without time zone NOT NULL,
    notify_classes boolean DEFAULT true NOT NULL,
    notify_events boolean DEFAULT true NOT NULL,
    notify_deadlines boolean DEFAULT true NOT NULL,
    family_enabled boolean DEFAULT false NOT NULL,
    rent_enabled boolean DEFAULT false NOT NULL,
    region text DEFAULT 'mainland'::text NOT NULL,
    home_currency text DEFAULT 'CNY'::text NOT NULL,
    onboarded boolean DEFAULT false NOT NULL,
    CONSTRAINT settings_default_budget_fen_check CHECK ((default_budget_fen >= 0)),
    CONSTRAINT settings_home_currency_check CHECK ((home_currency = ANY (ARRAY['CNY'::text, 'HKD'::text]))),
    CONSTRAINT settings_region_check CHECK ((region = ANY (ARRAY['mainland'::text, 'hk'::text]))),
    CONSTRAINT settings_think_again_days_check CHECK (((think_again_days >= 0) AND (think_again_days <= 365)))
);

CREATE TABLE public.think_again_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    name text NOT NULL,
    price_fen bigint NOT NULL,
    category text NOT NULL,
    note text,
    added_on date NOT NULL,
    decide_after date NOT NULL,
    status text DEFAULT 'waiting'::text NOT NULL,
    decided_on date,
    personal_expense_id uuid,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT think_again_items_category_check CHECK ((category = ANY (ARRAY['food'::text, 'transport'::text, 'household'::text, 'toys'::text, 'entertainment'::text, 'shopping'::text, 'travel'::text, 'other'::text]))),
    CONSTRAINT think_again_items_check CHECK ((decide_after >= added_on)),
    CONSTRAINT think_again_items_name_check CHECK (((char_length(name) >= 1) AND (char_length(name) <= 200))),
    CONSTRAINT think_again_items_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT think_again_items_price_fen_check CHECK ((price_fen > 0)),
    CONSTRAINT think_again_items_status_check CHECK ((status = ANY (ARRAY['waiting'::text, 'bought'::text, 'skipped'::text])))
);

CREATE TABLE public.utility_bills (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid DEFAULT auth.uid() NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    electricity_fen bigint,
    water_fen bigint,
    total_fen bigint NOT NULL,
    paid_date date,
    note text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT utility_bills_check CHECK ((period_end >= period_start)),
    CONSTRAINT utility_bills_check1 CHECK (((electricity_fen IS NULL) OR (water_fen IS NULL) OR (total_fen = (electricity_fen + water_fen)))),
    CONSTRAINT utility_bills_electricity_fen_check CHECK ((electricity_fen >= 0)),
    CONSTRAINT utility_bills_note_check CHECK ((char_length(note) <= 500)),
    CONSTRAINT utility_bills_total_fen_check CHECK ((total_fen > 0)),
    CONSTRAINT utility_bills_water_fen_check CHECK ((water_fen >= 0))
);

ALTER TABLE ONLY public.account_transfers
    ADD CONSTRAINT account_transfers_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_pkey PRIMARY KEY (user_id, day, kind);

ALTER TABLE ONLY public.balance_checks
    ADD CONSTRAINT balance_checks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.bill_payments
    ADD CONSTRAINT bill_payments_bill_id_month_key UNIQUE (bill_id, month);

ALTER TABLE ONLY public.bill_payments
    ADD CONSTRAINT bill_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.birthdays
    ADD CONSTRAINT birthdays_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.birthdays
    ADD CONSTRAINT birthdays_user_id_name_month_day_key UNIQUE (user_id, name, month, day);

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.day_plans
    ADD CONSTRAINT day_plans_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.day_plans
    ADD CONSTRAINT day_plans_user_id_date_key UNIQUE (user_id, date);

ALTER TABLE ONLY public.goal_checkins
    ADD CONSTRAINT goal_checkins_goal_id_date_key UNIQUE (goal_id, date);

ALTER TABLE ONLY public.goal_checkins
    ADD CONSTRAINT goal_checkins_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.goal_entries
    ADD CONSTRAINT goal_entries_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.goal_steps
    ADD CONSTRAINT goal_steps_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.income_transactions
    ADD CONSTRAINT income_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (key);

ALTER TABLE ONLY public.family_transactions
    ADD CONSTRAINT family_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.money_accounts
    ADD CONSTRAINT money_accounts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.monthly_budgets
    ADD CONSTRAINT monthly_budgets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.monthly_budgets
    ADD CONSTRAINT monthly_budgets_user_id_month_key UNIQUE (user_id, month);

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_user_id_month_key UNIQUE (user_id, month);

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.personal_expenses
    ADD CONSTRAINT personal_expenses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_pkey PRIMARY KEY (user_id, key);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_key UNIQUE (endpoint);

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.restaurant_wallet_transactions
    ADD CONSTRAINT restaurant_wallet_transactions_personal_expense_id_key UNIQUE (personal_expense_id);

ALTER TABLE ONLY public.restaurant_wallet_transactions
    ADD CONSTRAINT restaurant_wallet_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.restaurant_wallets
    ADD CONSTRAINT restaurant_wallets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_closing_id_key UNIQUE (closing_id);

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_personal_expense_id_key UNIQUE (personal_expense_id);

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (user_id);

ALTER TABLE ONLY public.think_again_items
    ADD CONSTRAINT think_again_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT utility_bills_pkey PRIMARY KEY (id);

CREATE INDEX account_transfers_user_date_idx ON public.account_transfers USING btree (user_id, txn_date);

CREATE INDEX balance_checks_account_time_idx ON public.balance_checks USING btree (account_id, checked_at DESC);

CREATE INDEX calendar_events_user_date_idx ON public.calendar_events USING btree (user_id, date);

CREATE INDEX classes_user_semester_idx ON public.classes USING btree (user_id, semester_id);

CREATE INDEX goal_entries_goal_idx ON public.goal_entries USING btree (goal_id, date);

CREATE INDEX goal_steps_goal_idx ON public.goal_steps USING btree (goal_id, "position");

CREATE INDEX goals_user_idx ON public.goals USING btree (user_id, created_at);

CREATE INDEX income_transactions_user_date_idx ON public.income_transactions USING btree (user_id, txn_date);

CREATE INDEX family_transactions_user_date_idx ON public.family_transactions USING btree (user_id, txn_date);

CREATE UNIQUE INDEX money_accounts_one_main ON public.money_accounts USING btree (user_id) WHERE is_main;

CREATE INDEX notices_user_created_idx ON public.notices USING btree (user_id, created_at DESC);

CREATE INDEX personal_expenses_user_date_idx ON public.personal_expenses USING btree (user_id, txn_date);

CREATE INDEX push_subscriptions_user_idx ON public.push_subscriptions USING btree (user_id);

CREATE UNIQUE INDEX recurring_bills_one_active_rent ON public.recurring_bills USING btree (user_id) WHERE ((kind = 'rent'::text) AND active);

CREATE INDEX restaurant_wallet_txns_wallet_idx ON public.restaurant_wallet_transactions USING btree (wallet_id, txn_date);

CREATE INDEX savings_transactions_user_date_idx ON public.savings_transactions USING btree (user_id, txn_date);

CREATE TRIGGER balance_checks_set_updated_at BEFORE UPDATE ON public.balance_checks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER bill_payments_set_updated_at BEFORE UPDATE ON public.bill_payments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER calendar_events_set_updated_at BEFORE UPDATE ON public.calendar_events FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER day_plans_set_updated_at BEFORE UPDATE ON public.day_plans FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER goals_set_updated_at BEFORE UPDATE ON public.goals FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER income_transactions_set_updated_at BEFORE UPDATE ON public.income_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER family_transactions_set_updated_at BEFORE UPDATE ON public.family_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER money_accounts_set_updated_at BEFORE UPDATE ON public.money_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER monthly_budgets_set_updated_at BEFORE UPDATE ON public.monthly_budgets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER monthly_closings_set_updated_at BEFORE UPDATE ON public.monthly_closings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER notices_set_updated_at BEFORE UPDATE ON public.notices FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER personal_expenses_set_updated_at BEFORE UPDATE ON public.personal_expenses FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER personal_expenses_sync_savings AFTER INSERT OR UPDATE ON public.personal_expenses FOR EACH ROW EXECUTE FUNCTION public.sync_savings_expense();

CREATE TRIGGER recurring_bills_set_updated_at BEFORE UPDATE ON public.recurring_bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER restaurant_wallet_not_negative AFTER INSERT OR DELETE OR UPDATE ON public.restaurant_wallet_transactions FOR EACH STATEMENT EXECUTE FUNCTION public.check_wallet_balances();

CREATE TRIGGER restaurant_wallet_transactions_set_updated_at BEFORE UPDATE ON public.restaurant_wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER restaurant_wallets_set_updated_at BEFORE UPDATE ON public.restaurant_wallets FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER savings_balance_not_negative AFTER INSERT OR DELETE OR UPDATE ON public.savings_transactions FOR EACH STATEMENT EXECUTE FUNCTION public.check_savings_balance();

CREATE TRIGGER savings_transactions_set_updated_at BEFORE UPDATE ON public.savings_transactions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER settings_set_updated_at BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER think_again_items_set_updated_at BEFORE UPDATE ON public.think_again_items FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER utility_bills_set_updated_at BEFORE UPDATE ON public.utility_bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE ONLY public.account_transfers
    ADD CONSTRAINT account_transfers_from_account_fkey FOREIGN KEY (from_account) REFERENCES public.money_accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.account_transfers
    ADD CONSTRAINT account_transfers_to_account_fkey FOREIGN KEY (to_account) REFERENCES public.money_accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.account_transfers
    ADD CONSTRAINT account_transfers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.ai_usage
    ADD CONSTRAINT ai_usage_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.balance_checks
    ADD CONSTRAINT balance_checks_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.money_accounts(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.balance_checks
    ADD CONSTRAINT balance_checks_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.bill_payments
    ADD CONSTRAINT bill_payments_bill_id_fkey FOREIGN KEY (bill_id) REFERENCES public.recurring_bills(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.bill_payments
    ADD CONSTRAINT bill_payments_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.birthdays
    ADD CONSTRAINT birthdays_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.calendar_events
    ADD CONSTRAINT calendar_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_semester_id_fkey FOREIGN KEY (semester_id) REFERENCES public.semesters(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.classes
    ADD CONSTRAINT classes_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.day_plans
    ADD CONSTRAINT day_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_checkins
    ADD CONSTRAINT goal_checkins_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_checkins
    ADD CONSTRAINT goal_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_entries
    ADD CONSTRAINT goal_entries_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_entries
    ADD CONSTRAINT goal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_steps
    ADD CONSTRAINT goal_steps_goal_id_fkey FOREIGN KEY (goal_id) REFERENCES public.goals(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goal_steps
    ADD CONSTRAINT goal_steps_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.goals
    ADD CONSTRAINT goals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.income_transactions
    ADD CONSTRAINT income_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.money_accounts(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.income_transactions
    ADD CONSTRAINT income_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.family_transactions
    ADD CONSTRAINT family_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.money_accounts
    ADD CONSTRAINT money_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.monthly_budgets
    ADD CONSTRAINT monthly_budgets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.monthly_closings
    ADD CONSTRAINT monthly_closings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_linked_event_id_fkey FOREIGN KEY (linked_event_id) REFERENCES public.calendar_events(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.notices
    ADD CONSTRAINT notices_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.personal_expenses
    ADD CONSTRAINT personal_expenses_paid_from_account_fkey FOREIGN KEY (paid_from_account) REFERENCES public.money_accounts(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.personal_expenses
    ADD CONSTRAINT personal_expenses_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_log
    ADD CONSTRAINT push_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.push_subscriptions
    ADD CONSTRAINT push_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.recurring_bills
    ADD CONSTRAINT recurring_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.restaurant_wallet_transactions
    ADD CONSTRAINT restaurant_wallet_transactions_personal_expense_id_fkey FOREIGN KEY (personal_expense_id) REFERENCES public.personal_expenses(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.restaurant_wallet_transactions
    ADD CONSTRAINT restaurant_wallet_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.restaurant_wallet_transactions
    ADD CONSTRAINT restaurant_wallet_transactions_wallet_id_fkey FOREIGN KEY (wallet_id) REFERENCES public.restaurant_wallets(id) ON DELETE RESTRICT;

ALTER TABLE ONLY public.restaurant_wallets
    ADD CONSTRAINT restaurant_wallets_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_closing_id_fkey FOREIGN KEY (closing_id) REFERENCES public.monthly_closings(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_personal_expense_id_fkey FOREIGN KEY (personal_expense_id) REFERENCES public.personal_expenses(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.savings_transactions
    ADD CONSTRAINT savings_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.semesters
    ADD CONSTRAINT semesters_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.think_again_items
    ADD CONSTRAINT think_again_items_personal_expense_id_fkey FOREIGN KEY (personal_expense_id) REFERENCES public.personal_expenses(id) ON DELETE SET NULL;

ALTER TABLE ONLY public.think_again_items
    ADD CONSTRAINT think_again_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE ONLY public.utility_bills
    ADD CONSTRAINT utility_bills_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE public.account_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY account_transfers_owner_only ON public.account_transfers TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.balance_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY balance_checks_owner_only ON public.balance_checks TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.bill_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY bill_payments_owner_only ON public.bill_payments TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.birthdays ENABLE ROW LEVEL SECURITY;

CREATE POLICY birthdays_owner_only ON public.birthdays TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_owner_only ON public.calendar_events TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

CREATE POLICY classes_owner_only ON public.classes TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.day_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_plans_owner_only ON public.day_plans TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.goal_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_checkins_owner_only ON public.goal_checkins TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.goal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_entries_owner_only ON public.goal_entries TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.goal_steps ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_steps_owner_only ON public.goal_steps TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY goals_owner_only ON public.goals TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.income_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY income_transactions_owner_only ON public.income_transactions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.family_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY family_transactions_owner_only ON public.family_transactions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.money_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY money_accounts_owner_only ON public.money_accounts TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.monthly_budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_budgets_owner_only ON public.monthly_budgets TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.monthly_closings ENABLE ROW LEVEL SECURITY;

CREATE POLICY monthly_closings_owner_only ON public.monthly_closings TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.notices ENABLE ROW LEVEL SECURITY;

CREATE POLICY notices_owner_only ON public.notices TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.personal_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY personal_expenses_owner_only ON public.personal_expenses TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.push_log ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_subscriptions_owner_only ON public.push_subscriptions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.recurring_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY recurring_bills_owner_only ON public.recurring_bills TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.restaurant_wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_wallet_transactions_owner_only ON public.restaurant_wallet_transactions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.restaurant_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY restaurant_wallets_owner_only ON public.restaurant_wallets TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.savings_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY savings_transactions_owner_only ON public.savings_transactions TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.semesters ENABLE ROW LEVEL SECURITY;

CREATE POLICY semesters_owner_only ON public.semesters TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY settings_owner_only ON public.settings TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.think_again_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY think_again_items_owner_only ON public.think_again_items TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

ALTER TABLE public.utility_bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY utility_bills_owner_only ON public.utility_bills TO authenticated USING ((user_id = ( SELECT auth.uid() AS uid))) WITH CHECK ((user_id = ( SELECT auth.uid() AS uid)));

GRANT ALL ON FUNCTION public.check_savings_balance() TO anon;
GRANT ALL ON FUNCTION public.check_savings_balance() TO authenticated;
GRANT ALL ON FUNCTION public.check_savings_balance() TO service_role;

GRANT ALL ON FUNCTION public.check_wallet_balances() TO anon;
GRANT ALL ON FUNCTION public.check_wallet_balances() TO authenticated;
GRANT ALL ON FUNCTION public.check_wallet_balances() TO service_role;

REVOKE ALL ON FUNCTION public.close_month(p_month date, p_budget_fen bigint, p_is_partial boolean, p_today date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.close_month(p_month date, p_budget_fen bigint, p_is_partial boolean, p_today date) TO authenticated;
GRANT ALL ON FUNCTION public.close_month(p_month date, p_budget_fen bigint, p_is_partial boolean, p_today date) TO service_role;

REVOKE ALL ON FUNCTION public.delete_restaurant_txn(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.delete_restaurant_txn(p_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.delete_restaurant_txn(p_id uuid) TO service_role;

REVOKE ALL ON FUNCTION public.login_guard(p_key text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_guard(p_key text) TO anon;
GRANT ALL ON FUNCTION public.login_guard(p_key text) TO authenticated;
GRANT ALL ON FUNCTION public.login_guard(p_key text) TO service_role;

REVOKE ALL ON FUNCTION public.login_record(p_key text, p_success boolean, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.login_record(p_key text, p_success boolean, p_limit integer) TO anon;
GRANT ALL ON FUNCTION public.login_record(p_key text, p_success boolean, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.login_record(p_key text, p_success boolean, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.reopen_month(p_month date) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reopen_month(p_month date) TO authenticated;
GRANT ALL ON FUNCTION public.reopen_month(p_month date) TO service_role;

REVOKE ALL ON FUNCTION public.restaurant_topup(p_id uuid, p_wallet uuid, p_date date, p_cash_fen bigint, p_credit_fen bigint, p_note text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restaurant_topup(p_id uuid, p_wallet uuid, p_date date, p_cash_fen bigint, p_credit_fen bigint, p_note text) TO authenticated;
GRANT ALL ON FUNCTION public.restaurant_topup(p_id uuid, p_wallet uuid, p_date date, p_cash_fen bigint, p_credit_fen bigint, p_note text) TO service_role;

REVOKE ALL ON FUNCTION public.restaurant_use(p_id uuid, p_wallet uuid, p_date date, p_bill_fen bigint, p_note text, p_allow_cash boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restaurant_use(p_id uuid, p_wallet uuid, p_date date, p_bill_fen bigint, p_note text, p_allow_cash boolean) TO authenticated;
GRANT ALL ON FUNCTION public.restaurant_use(p_id uuid, p_wallet uuid, p_date date, p_bill_fen bigint, p_note text, p_allow_cash boolean) TO service_role;

REVOKE ALL ON FUNCTION public.restore_backup(payload jsonb, mode text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.restore_backup(payload jsonb, mode text) TO authenticated;
GRANT ALL ON FUNCTION public.restore_backup(payload jsonb, mode text) TO service_role;

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;

GRANT ALL ON FUNCTION public.sync_savings_expense() TO anon;
GRANT ALL ON FUNCTION public.sync_savings_expense() TO authenticated;
GRANT ALL ON FUNCTION public.sync_savings_expense() TO service_role;

REVOKE ALL ON FUNCTION public.take_ai_quota(p_kind text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.take_ai_quota(p_kind text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.take_ai_quota(p_kind text, p_limit integer) TO service_role;

REVOKE ALL ON FUNCTION public.think_again_buy(p_item uuid, p_expense uuid, p_date date, p_amount_fen bigint, p_funded_by text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.think_again_buy(p_item uuid, p_expense uuid, p_date date, p_amount_fen bigint, p_funded_by text) TO authenticated;
GRANT ALL ON FUNCTION public.think_again_buy(p_item uuid, p_expense uuid, p_date date, p_amount_fen bigint, p_funded_by text) TO service_role;

REVOKE ALL ON FUNCTION public.think_again_undo(p_item uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.think_again_undo(p_item uuid) TO authenticated;
GRANT ALL ON FUNCTION public.think_again_undo(p_item uuid) TO service_role;

GRANT ALL ON TABLE public.account_transfers TO authenticated;
GRANT ALL ON TABLE public.account_transfers TO service_role;

GRANT ALL ON TABLE public.ai_usage TO service_role;

GRANT ALL ON TABLE public.balance_checks TO authenticated;
GRANT ALL ON TABLE public.balance_checks TO service_role;

GRANT ALL ON TABLE public.bill_payments TO authenticated;
GRANT ALL ON TABLE public.bill_payments TO service_role;

GRANT ALL ON TABLE public.birthdays TO authenticated;
GRANT ALL ON TABLE public.birthdays TO service_role;

GRANT ALL ON TABLE public.calendar_events TO authenticated;
GRANT ALL ON TABLE public.calendar_events TO service_role;

GRANT ALL ON TABLE public.classes TO authenticated;
GRANT ALL ON TABLE public.classes TO service_role;

GRANT ALL ON TABLE public.personal_expenses TO authenticated;
GRANT ALL ON TABLE public.personal_expenses TO service_role;

GRANT ALL ON TABLE public.daily_personal_spending TO authenticated;
GRANT ALL ON TABLE public.daily_personal_spending TO service_role;

GRANT ALL ON TABLE public.day_plans TO authenticated;
GRANT ALL ON TABLE public.day_plans TO service_role;

GRANT ALL ON TABLE public.goal_checkins TO authenticated;
GRANT ALL ON TABLE public.goal_checkins TO service_role;

GRANT ALL ON TABLE public.goal_entries TO authenticated;
GRANT ALL ON TABLE public.goal_entries TO service_role;

GRANT ALL ON TABLE public.goal_steps TO authenticated;
GRANT ALL ON TABLE public.goal_steps TO service_role;

GRANT ALL ON TABLE public.goals TO authenticated;
GRANT ALL ON TABLE public.goals TO service_role;

GRANT ALL ON TABLE public.income_transactions TO authenticated;
GRANT ALL ON TABLE public.income_transactions TO service_role;

GRANT ALL ON TABLE public.login_attempts TO service_role;

GRANT ALL ON TABLE public.family_transactions TO authenticated;
GRANT ALL ON TABLE public.family_transactions TO service_role;

GRANT ALL ON TABLE public.money_accounts TO authenticated;
GRANT ALL ON TABLE public.money_accounts TO service_role;

GRANT ALL ON TABLE public.monthly_budgets TO authenticated;
GRANT ALL ON TABLE public.monthly_budgets TO service_role;

GRANT ALL ON TABLE public.monthly_closings TO authenticated;
GRANT ALL ON TABLE public.monthly_closings TO service_role;

GRANT ALL ON TABLE public.notices TO authenticated;
GRANT ALL ON TABLE public.notices TO service_role;

GRANT ALL ON TABLE public.push_log TO service_role;

GRANT ALL ON TABLE public.push_subscriptions TO authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

GRANT ALL ON TABLE public.recurring_bills TO authenticated;
GRANT ALL ON TABLE public.recurring_bills TO service_role;

GRANT ALL ON TABLE public.restaurant_wallet_transactions TO authenticated;
GRANT ALL ON TABLE public.restaurant_wallet_transactions TO service_role;

GRANT ALL ON TABLE public.restaurant_wallets TO authenticated;
GRANT ALL ON TABLE public.restaurant_wallets TO service_role;

GRANT ALL ON TABLE public.savings_transactions TO authenticated;
GRANT ALL ON TABLE public.savings_transactions TO service_role;

GRANT ALL ON TABLE public.semesters TO authenticated;
GRANT ALL ON TABLE public.semesters TO service_role;

GRANT ALL ON TABLE public.settings TO authenticated;
GRANT ALL ON TABLE public.settings TO service_role;

GRANT ALL ON TABLE public.think_again_items TO authenticated;
GRANT ALL ON TABLE public.think_again_items TO service_role;

GRANT ALL ON TABLE public.utility_bills TO authenticated;
GRANT ALL ON TABLE public.utility_bills TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

--
-- PostgreSQL database dump complete
--

-- Permissions. Supabase grants every new table and function to anon and authenticated
-- by default; Pulse closes all of that and opens only what the app needs.
revoke all on all tables in schema public from anon;
revoke all on table public.ai_usage, public.login_attempts, public.push_log from authenticated;
revoke all on function public.close_month, public.reopen_month, public.delete_restaurant_txn,
  public.restaurant_topup, public.restaurant_use, public.restore_backup, public.take_ai_quota,
  public.think_again_buy, public.think_again_undo
  from public, anon;
