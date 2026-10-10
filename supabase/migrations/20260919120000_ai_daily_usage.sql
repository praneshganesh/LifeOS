-- Server-enforced Talk/Ask AI daily caps (auth-scoped).
-- Local AsyncStorage mirrors for UX only.

alter table public.profiles
  add column if not exists plan_id text not null default 'trial';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'profiles_plan_id_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_id_check
      check (plan_id in ('trial', 'pro', 'family'));
  end if;
end $$;

create table if not exists public.ai_daily_usage (
  scope_kind text not null check (scope_kind in ('user', 'household')),
  scope_id uuid not null,
  day date not null,
  count int not null default 0 check (count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope_kind, scope_id, day)
);

create index if not exists ai_daily_usage_day_idx
  on public.ai_daily_usage (day);

alter table public.ai_daily_usage enable row level security;

drop policy if exists "ai_usage_select_own_or_household" on public.ai_daily_usage;
create policy "ai_usage_select_own_or_household"
  on public.ai_daily_usage for select
  using (
    (scope_kind = 'user' and scope_id = auth.uid())
    or (
      scope_kind = 'household'
      and scope_id in (select public.user_household_ids())
    )
  );

create or replace function public.ai_daily_limit_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'trial')
    when 'pro' then 30
    when 'family' then 80
    else 5
  end;
$$;

create or replace function public.resolve_ai_usage_scope(p_plan text)
returns table (scope_kind text, scope_id uuid)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  hid uuid;
begin
  if coalesce(p_plan, 'trial') = 'family' then
    select hm.household_id into hid
    from public.household_members hm
    where hm.user_id = auth.uid()
    order by case hm.permission when 'owner' then 0 else 1 end, hm.created_at
    limit 1;
    if hid is not null then
      return query select 'household'::text, hid;
      return;
    end if;
  end if;
  return query select 'user'::text, auth.uid();
end;
$$;

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

  select s.scope_kind, s.scope_id into sk, sid
  from public.resolve_ai_usage_scope(plan) s;

  select coalesce(u.count, 0) into used
  from public.ai_daily_usage u
  where u.scope_kind = sk and u.scope_id = sid and u.day = p_day;

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

  select s.scope_kind, s.scope_id into sk, sid
  from public.resolve_ai_usage_scope(plan) s;

  select coalesce(u.count, 0) into used
  from public.ai_daily_usage u
  where u.scope_kind = sk and u.scope_id = sid and u.day = p_day;

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

create or replace function public.set_my_plan_id(p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_plan not in ('trial', 'pro', 'family') then
    raise exception 'invalid plan';
  end if;
  insert into public.profiles (id, plan_id, updated_at)
  values (auth.uid(), p_plan, now())
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        updated_at = now();
end;
$$;

revoke all on function public.ai_daily_limit_for_plan(text) from public, anon;
revoke all on function public.resolve_ai_usage_scope(text) from public, anon;
revoke all on function public.get_ai_allowance(date) from public, anon;
revoke all on function public.consume_ai_turn(date) from public, anon;
revoke all on function public.set_my_plan_id(text) from public, anon;

grant execute on function public.ai_daily_limit_for_plan(text) to authenticated;
grant execute on function public.resolve_ai_usage_scope(text) to authenticated;
grant execute on function public.get_ai_allowance(date) to authenticated;
grant execute on function public.consume_ai_turn(date) to authenticated;
grant execute on function public.set_my_plan_id(text) to authenticated;
