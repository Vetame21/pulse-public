-- Pulse demo data: made-up names, amounts and classes, dated around today.
-- Demo mode (PULSE_DEMO=1) runs this inside the app to fill each visitor's own
-- sandbox. You can also run it on your own Supabase project, after
-- supabase/migrations/0001_schema.sql, to fill a test user:
--   select public.reset_demo('test-user@example.com');
-- reset_demo deletes everything that user owns first. Never point it at a real account.

create or replace function public.reset_demo(p_email text) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  today date := (now() at time zone 'Asia/Shanghai')::date;
  m0 date := date_trunc('month', today)::date;            -- this month
  m1 date := (date_trunc('month', today) - interval '1 month')::date;
  m2 date := (date_trunc('month', today) - interval '2 months')::date;
  budget bigint := 200000;                                -- ¥2,000 a month
  main_acc uuid := gen_random_uuid();
  alipay uuid := gen_random_uuid();
  wechat uuid := gen_random_uuid();
  rent_bill uuid := gen_random_uuid();
  wallet uuid := gen_random_uuid();
  topup_exp uuid := gen_random_uuid();
  sem uuid := gen_random_uuid();
  g_money uuid := gen_random_uuid();
  g_habit uuid := gen_random_uuid();
  g_steps uuid := gen_random_uuid();
  closing uuid;
  m date;
  spent bigint;
  t text;
begin
  select id into uid from auth.users where lower(email) = lower(trim(p_email));
  if uid is null then raise exception 'No user with the email %', p_email; end if;

  -- Wipe: children before parents.
  foreach t in array array[
    'goal_checkins', 'goal_entries', 'goal_steps', 'goals', 'day_plans', 'notices', 'birthdays', 'classes', 'semesters',
    'calendar_events', 'think_again_items', 'account_transfers', 'income_transactions', 'balance_checks',
    'restaurant_wallet_transactions', 'restaurant_wallets', 'family_transactions', 'utility_bills', 'bill_payments',
    'recurring_bills', 'savings_transactions', 'monthly_closings', 'personal_expenses', 'money_accounts',
    'monthly_budgets', 'push_subscriptions', 'push_log', 'ai_usage', 'settings'
  ] loop
    execute format('delete from public.%I where user_id = $1', t) using uid;
  end loop;

  insert into settings (user_id, region, home_currency, timezone, default_budget_fen, tracking_start_date, onboarded, family_enabled, rent_enabled, last_backup_at)
  values (uid, 'mainland', 'CNY', 'Asia/Shanghai', budget, m2, true, true, true, now()); -- no backup reminder in the demo

  insert into monthly_budgets (user_id, month, budget_fen)
  select uid, mm, budget from unnest(array[m2, m1, m0]) mm;

  -- Accounts and balance checks (checked on the 1st of this month).
  insert into money_accounts (id, user_id, name, currency, is_main, sort_order) values
    (main_acc, uid, 'Bank card', 'CNY', true, 0),
    (alipay, uid, 'Alipay', 'CNY', false, 1),
    (wechat, uid, 'WeChat Pay', 'CNY', false, 2);
  insert into balance_checks (user_id, account_id, checked_on, balance_minor, checked_at) values
    (uid, main_acc, m0, 852000, m0 + time '09:00'),
    (uid, alipay, m0, 64000, m0 + time '09:00'),
    (uid, wechat, m0, 21050, m0 + time '09:00');
  insert into income_transactions (user_id, account_id, txn_date, amount_fen, source) values
    (uid, main_acc, least(m0 + 2, today), 300000, 'Part-time job');
  insert into account_transfers (user_id, from_account, to_account, txn_date, amount_fen, note) values
    (uid, main_acc, alipay, least(m0 + 3, today), 50000, 'Top up');

  -- Everyday spending: 1–3 made-up expenses a day, same pattern every reset.
  insert into personal_expenses (user_id, txn_date, amount_fen, category, note, paid_from_account)
  select uid, d::date,
         x.base + ((extract(doy from d)::int * 37 + n * 101) % x.spread),
         x.cat, x.note,
         case when n = 2 then alipay when n = 3 then wechat else null end
  from generate_series(m2, today, interval '1 day') d
  cross join generate_series(1, 3) n
  cross join lateral (
    select * from (values
      (0, 'food', 'Canteen lunch', 1200, 1800),
      (1, 'food', 'Bubble tea', 1500, 1200),
      (2, 'transport', 'Metro', 300, 600),
      (3, 'food', 'Groceries', 3000, 6000),
      (4, 'household', 'Laundry detergent', 1500, 2500),
      (5, 'entertainment', 'Cinema', 4500, 2000),
      (6, 'shopping', 'Notebook and pens', 1000, 3000)
    ) v(k, cat, note, base, spread)
    where v.k = (extract(doy from d)::int + n * 3) % 7
  ) x
  where (extract(doy from d)::int + n) % 2 = 0;            -- about 1.5 a day, varying

  insert into personal_expenses (user_id, txn_date, amount_fen, category, note, currency, original_minor, fx_rate, fx_source, paid_with) values
    (uid, m1 + 14, 23050, 'travel', 'Ferry ticket', 'HKD', 25000, 0.922, 'ecb', 'cash');
  insert into personal_expenses (user_id, txn_date, amount_fen, category, note, funded_by, paid_by) values
    (uid, m1 + 20, 12800, 'food', 'Birthday dinner', 'other', 'Alex');

  -- Close the two past months: what's left of the budget goes to the Savings Box.
  foreach m in array array[m2, m1] loop
    select coalesce(sum(case when kind = 'refund' then -amount_fen else amount_fen end), 0) into spent
      from personal_expenses where user_id = uid and funded_by = 'budget' and date_trunc('month', txn_date) = m;
    insert into monthly_closings (user_id, month, budget_fen, spent_fen, saved_fen, over_fen)
    values (uid, m, budget, spent, greatest(0, budget - spent), greatest(0, spent - budget))
    returning id into closing;
    if budget > spent then
      insert into savings_transactions (user_id, txn_date, amount_fen, kind, closing_id, note)
      values (uid, (m + interval '1 month')::date, budget - spent, 'month_close', closing, 'Month closed');
    end if;
  end loop;
  insert into savings_transactions (user_id, txn_date, amount_fen, kind, note) values (uid, m2 + 5, 20000, 'deposit', 'Red packet');
  -- Paid from the Savings Box (the trigger records the withdrawal).
  insert into personal_expenses (user_id, txn_date, amount_fen, category, note, funded_by)
  values (uid, least(m0 + 4, today), 15900, 'shopping', 'Phone case', 'savings');

  -- Apartment: rent and one electricity + water bill.
  insert into recurring_bills (id, user_id, name, kind, default_amount_fen, starts_month)
  values (rent_bill, uid, 'Rent + Management', 'rent', 300000, m2);
  insert into bill_payments (user_id, bill_id, month, amount_fen, paid_date) values
    (uid, rent_bill, m2, 300000, m2 + 2),
    (uid, rent_bill, m1, 300000, m1 + 3);
  insert into utility_bills (user_id, period_start, period_end, electricity_fen, water_fen, total_fen, paid_date)
  values (uid, (m2 - interval '3 months')::date, m2 - 1, 28000, 8000, 36000, m2 + 6);

  -- A restaurant wallet: the top-up cash counts once as Food, meals from credit don't.
  insert into restaurant_wallets (id, user_id, name) values (wallet, uid, 'Noodle House');
  insert into personal_expenses (id, user_id, txn_date, amount_fen, category, source, note)
  values (topup_exp, uid, m1 + 2, 30000, 'food', 'restaurant_topup', 'Top-up: Noodle House');
  insert into restaurant_wallet_transactions (user_id, wallet_id, txn_date, kind, cash_paid_fen, credit_delta_fen, personal_expense_id) values
    (uid, wallet, m1 + 2, 'topup', 30000, 33000, topup_exp),
    (uid, wallet, m1 + 9, 'usage', 0, -2800, null),
    (uid, wallet, m1 + 23, 'usage', 0, -3200, null),
    (uid, wallet, least(m0 + 5, today), 'usage', 0, -2600, null);

  -- Family Money: someone sends money to pass on.
  insert into family_transactions (user_id, txn_date, kind, amount_fen, from_person, person, purpose) values
    (uid, m1 + 1, 'received', 100000, 'Aunt Mei', null, null),
    (uid, m1 + 6, 'paid', 60000, 'Aunt Mei', 'Bookshop', 'Textbooks for cousin');

  insert into think_again_items (user_id, name, price_fen, category, added_on, decide_after) values
    (uid, 'Mechanical keyboard', 45000, 'shopping', today - 2, today + 5),
    (uid, 'Concert ticket', 38000, 'entertainment', today - 9, today - 2);

  -- Calendar: a semester with four classes, events, deadlines, birthdays.
  insert into semesters (id, user_id, name, start_date, weeks)
  values (sem, uid, 'Autumn term', date_trunc('week', m2)::date, 18);
  insert into classes (user_id, semester_id, title, room, weekday, start_time, end_time, weeks)
  select uid, sem, c.title, c.room, c.wd, c.st, c.et, array(select generate_series(1, 18))::smallint[]
  from (values
    ('Intro to Databases', 'B101', 1, time '09:00', time '10:35'),
    ('Linear Algebra', 'B204', 2, time '14:00', time '15:35'),
    ('Statistics', 'C310', 3, time '10:50', time '12:25'),
    ('Academic English', 'A115', 4, time '08:00', time '09:35')
  ) c(title, room, wd, st, et);
  insert into calendar_events (user_id, title, date, start_time, end_time, location, kind, lead_days) values
    (uid, 'Study group', today + 1, '19:00', '21:00', 'Library 3F', 'event', null),
    (uid, 'Dentist', today + 6, '10:00', null, null, 'event', null),
    (uid, 'Statistics homework 4', today + 4, null, null, null, 'deadline', 7),
    (uid, 'Database project report', today + 12, null, null, null, 'deadline', 14);
  insert into birthdays (user_id, name, month, day, year) values
    (uid, 'Alex', extract(month from today + 3)::smallint, extract(day from today + 3)::smallint, null),
    (uid, 'Sam', extract(month from today + 20)::smallint, extract(day from today + 20)::smallint, 2001);
  insert into notices (user_id, body, source, pinned, related_date) values
    (uid, 'Library hours change next week: open 08:00–22:00.', 'Class group', true, today + 7);

  -- Goals: money, a weekly habit and a milestone with steps.
  insert into goals (id, user_id, title, kind, due_date, target_fen, money_source) values
    (g_money, uid, 'Summer trip fund', 'money', (m0 + interval '6 months')::date, 500000, 'manual');
  insert into goal_entries (user_id, goal_id, date, amount_fen) values
    (uid, g_money, m2 + 10, 50000), (uid, g_money, m1 + 10, 80000);
  insert into goals (id, user_id, title, kind, habit_period, habit_times) values
    (g_habit, uid, 'Gym', 'habit', 'week', 3);
  insert into goal_checkins (user_id, goal_id, date)
  select uid, g_habit, d::date from generate_series(today - 13, today - 1, interval '2 days') d;
  insert into goals (id, user_id, title, kind) values (g_steps, uid, 'Pass the driving test', 'milestone');
  insert into goal_steps (user_id, goal_id, title, position, done_at) values
    (uid, g_steps, 'Theory exam', 0, now() - interval '20 days'),
    (uid, g_steps, 'Ten driving lessons', 1, null),
    (uid, g_steps, 'Road test', 2, null);

  insert into day_plans (user_id, date, body, items) values
    (uid, today, 'Gym at 7. Finish stats homework. Call home.',
     '[{"text": "Gym at 7.", "done": true}, {"text": "Finish stats homework.", "done": false}, {"text": "Call home.", "done": false}]');
end;
$$;

revoke all on function public.reset_demo(text) from public, anon, authenticated;
