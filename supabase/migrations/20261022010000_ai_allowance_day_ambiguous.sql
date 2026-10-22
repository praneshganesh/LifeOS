-- Fix: Postgres rejects `u.day = day` when a PL/pgSQL variable is also named `day`
-- (column reference "day" is ambiguous). Rename the billing-day variable.

create or replace function public.get_ai_allowance(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  plan text;
  lim int;
  sk text;
  sid uuid;
  used int := 0;
  billing_day date := (timezone('utc', now()))::date;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- p_day is ignored on purpose (clients used to pass a forgeable local date).

  select coalesce(p.plan_id, 'trial') into plan
  from public.profiles p
  where p.id = uid;
  plan := coalesce(plan, 'trial');
  lim := public.ai_daily_limit_for_plan(plan);
  if public.trial_ended_for(uid) then
    lim := 0;
  end if;

  select s.scope_kind, s.scope_id into sk, sid
  from public.resolve_ai_usage_scope(plan) s;

  select coalesce(u.count, 0) into used
  from public.ai_daily_usage u
  where u.scope_kind = sk and u.scope_id = sid and u.day = billing_day;
  if not found then
    used := 0;
  end if;

  return jsonb_build_object(
    'ok', used < lim,
    'day', billing_day,
    'used', used,
    'limit', lim,
    'remaining', greatest(lim - used, 0),
    'planId', plan,
    'scopeKind', sk,
    'scopeId', sid
  );
end;
$$;

create or replace function public.consume_ai_turn(p_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  plan text;
  lim int;
  sk text;
  sid uuid;
  used int := 0;
  billing_day date := (timezone('utc', now()))::date;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(p.plan_id, 'trial') into plan
  from public.profiles p
  where p.id = uid;
  plan := coalesce(plan, 'trial');
  lim := public.ai_daily_limit_for_plan(plan);
  if public.trial_ended_for(uid) then
    lim := 0;
  end if;

  select s.scope_kind, s.scope_id into sk, sid
  from public.resolve_ai_usage_scope(plan) s;

  select coalesce(u.count, 0) into used
  from public.ai_daily_usage u
  where u.scope_kind = sk and u.scope_id = sid and u.day = billing_day;
  if not found then
    used := 0;
  end if;

  if used >= lim then
    return jsonb_build_object(
      'ok', false,
      'day', billing_day,
      'used', used,
      'limit', lim,
      'remaining', 0,
      'planId', plan,
      'scopeKind', sk,
      'scopeId', sid,
      'consumed', false
    );
  end if;

  insert into public.ai_daily_usage as u (scope_kind, scope_id, day, count, updated_at)
  values (sk, sid, billing_day, 1, now())
  on conflict (scope_kind, scope_id, day)
  do update set count = u.count + 1, updated_at = now()
  returning u.count into used;

  return jsonb_build_object(
    'ok', true,
    'day', billing_day,
    'used', used,
    'limit', lim,
    'remaining', greatest(lim - used, 0),
    'planId', plan,
    'scopeKind', sk,
    'scopeId', sid,
    'consumed', true
  );
end;
$$;
