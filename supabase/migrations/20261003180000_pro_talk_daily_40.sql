-- Pro Talk is 40 turns/day. 150 was more than a household app uses,
-- and a maxed month cost about as much as the subscription keeps.

create or replace function public.ai_daily_limit_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'trial')
    when 'pro' then 40
    when 'family' then 40
    when 'lapsed' then 0
    when 'trial' then 5
    else 0
  end;
$$;
