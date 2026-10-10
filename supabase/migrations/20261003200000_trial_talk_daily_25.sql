-- Trial Talk is 25 turns/day.

create or replace function public.ai_daily_limit_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'trial')
    when 'pro' then 100
    when 'family' then 100
    when 'lapsed' then 0
    when 'trial' then 25
    else 0
  end;
$$;
