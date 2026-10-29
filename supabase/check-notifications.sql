-- Pulse: notification check (read-only). Shows your saved briefing time/timezone,
-- your devices, and what the job has sent.
select 'setting' as what, timezone || ' · briefing ' || notify_briefing_time::text as detail, null::timestamp as at_beijing from public.settings
union all
select 'device', coalesce(device, '?') || ' · ' || left(endpoint, 40), created_at at time zone 'Asia/Shanghai' from public.push_subscriptions
union all
(select 'sent', key, sent_at at time zone 'Asia/Shanghai' from public.push_log order by sent_at desc limit 15);
