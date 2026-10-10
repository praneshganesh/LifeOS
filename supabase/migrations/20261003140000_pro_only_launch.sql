-- Launch sells Pro only. Family profiles become Pro.
-- Talk fair-use is 150 turns/day for Pro (and any leftover family row).

update public.profiles
set plan_id = 'pro',
    updated_at = now()
where plan_id = 'family';

create or replace function public.ai_daily_limit_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'trial')
    when 'pro' then 150
    when 'family' then 150
    when 'lapsed' then 0
    when 'trial' then 5
    else 0
  end;
$$;
