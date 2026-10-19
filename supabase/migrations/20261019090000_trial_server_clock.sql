-- The trial clock lives on the profile, not on the phone, so the server can
-- enforce it and support can end or extend a trial with one update.
-- Clients may only read their profile. Plan and trial change through the
-- security-definer functions and the service-role RevenueCat webhook.

alter table public.profiles add column if not exists trial_started_at timestamptz;
update public.profiles set trial_started_at = created_at where trial_started_at is null;
alter table public.profiles alter column trial_started_at set default now();
alter table public.profiles alter column trial_started_at set not null;

drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
revoke insert, update, delete on public.profiles from anon, authenticated;

-- Keep in sync with TRIAL_DAYS in lib/planLimits.ts.
create or replace function public.trial_days()
returns int
language sql
immutable
as $$
  select 7;
$$;

create or replace function public.trial_ended_for(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(p.plan_id, 'trial') = 'trial'
        and p.trial_started_at + make_interval(days => public.trial_days()) <= now()
      from public.profiles p
      where p.id = p_uid
    ),
    false
  );
$$;

revoke all on function public.trial_ended_for(uuid) from public, anon, authenticated;

create or replace function public.get_ai_allowance(p_day date default (timezone('utc', now()))::date)
returns jsonb
language plpgsql
stable
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
  where u.scope_kind = sk and u.scope_id = sid and u.day = p_day;
  if not found then
    used := 0;
  end if;

  return jsonb_build_object(
    'ok', used < lim,
    'day', p_day,
    'used', used,
    'limit', lim,
    'remaining', greatest(lim - used, 0),
    'planId', plan,
    'scopeKind', sk,
    'scopeId', sid
  );
end;
$$;

create or replace function public.consume_ai_turn(p_day date default (timezone('utc', now()))::date)
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
  where u.scope_kind = sk and u.scope_id = sid and u.day = p_day;
  if not found then
    used := 0;
  end if;

  if used >= lim then
    return jsonb_build_object(
      'ok', false,
      'day', p_day,
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
  values (sk, sid, p_day, 1, now())
  on conflict (scope_kind, scope_id, day)
  do update set count = u.count + 1, updated_at = now()
  returning u.count into used;

  return jsonb_build_object(
    'ok', true,
    'day', p_day,
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
