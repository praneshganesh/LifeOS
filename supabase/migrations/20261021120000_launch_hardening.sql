-- Launch hardening:
-- 1) Talk allowance day is always server UTC (ignore client p_day).
-- 2) Client cannot downgrade an active paid plan via set_my_plan_id.
-- 3) admin_set_plan_id no-ops when the auth user is gone (RC webhooks after delete).
-- 4) Soft rate limit on recovery code fetches.

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
  day date := (timezone('utc', now()))::date;
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
  where u.scope_kind = sk and u.scope_id = sid and u.day = day;
  if not found then
    used := 0;
  end if;

  return jsonb_build_object(
    'ok', used < lim,
    'day', day,
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
  day date := (timezone('utc', now()))::date;
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
  where u.scope_kind = sk and u.scope_id = sid and u.day = day;
  if not found then
    used := 0;
  end if;

  if used >= lim then
    return jsonb_build_object(
      'ok', false,
      'day', day,
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
  values (sk, sid, day, 1, now())
  on conflict (scope_kind, scope_id, day)
  do update set count = u.count + 1, updated_at = now()
  returning u.count into used;

  return jsonb_build_object(
    'ok', true,
    'day', day,
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

create or replace function public.set_my_plan_id(
  p_plan text,
  p_cadence text default null,
  p_product_id text default null,
  p_renews_at timestamptz default null,
  p_pending_product_id text default null,
  p_update_pending boolean default false
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur_plan text;
  cur_renews timestamptz;
  ended boolean := p_plan in ('trial', 'lapsed');
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_plan not in ('trial', 'pro', 'family', 'lapsed') then
    raise exception 'invalid plan';
  end if;
  if p_cadence is not null and p_cadence not in ('monthly', 'yearly') then
    raise exception 'invalid cadence';
  end if;
  if p_product_id is not null and char_length(p_product_id) > 128 then
    raise exception 'invalid product';
  end if;
  if p_pending_product_id is not null and char_length(p_pending_product_id) > 128 then
    raise exception 'invalid product';
  end if;

  select plan_id, renews_at into cur_plan, cur_renews
  from public.profiles
  where id = uid;

  -- Client cannot wipe an active paid period (RevenueCat webhook / Restore owns that).
  if ended
     and cur_plan in ('pro', 'family')
     and cur_renews is not null
     and cur_renews > now()
  then
    return;
  end if;

  insert into public.profiles (
    id, plan_id, billing_cadence, store_product_id, renews_at, pending_store_product_id, updated_at
  )
  values (
    uid,
    p_plan,
    case when ended then null else p_cadence end,
    case when ended then null else p_product_id end,
    case when ended then null else p_renews_at end,
    case
      when ended then null
      when p_update_pending then nullif(p_pending_product_id, '')
      else null
    end,
    now()
  )
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        billing_cadence = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when excluded.store_product_id is not null then excluded.billing_cadence
          else profiles.billing_cadence
        end,
        store_product_id = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when excluded.store_product_id is not null then excluded.store_product_id
          else profiles.store_product_id
        end,
        renews_at = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when excluded.store_product_id is not null then excluded.renews_at
          else profiles.renews_at
        end,
        pending_store_product_id = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when p_update_pending then nullif(p_pending_product_id, '')
          else profiles.pending_store_product_id
        end,
        updated_at = now();
end;
$$;

create or replace function public.admin_set_plan_id(
  p_user uuid,
  p_plan text,
  p_cadence text default null,
  p_product_id text default null,
  p_renews_at timestamptz default null,
  p_pending_product_id text default null,
  p_update_pending boolean default false
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  ended boolean := p_plan in ('trial', 'lapsed');
begin
  if p_plan not in ('trial', 'pro', 'family', 'lapsed') then
    raise exception 'invalid plan';
  end if;
  if p_cadence is not null and p_cadence not in ('monthly', 'yearly') then
    raise exception 'invalid cadence';
  end if;
  if p_product_id is not null and char_length(p_product_id) > 128 then
    raise exception 'invalid product';
  end if;
  if p_pending_product_id is not null and char_length(p_pending_product_id) > 128 then
    raise exception 'invalid product';
  end if;

  -- Deleted accounts: RC may still webhook the old app user id. No-op cleanly.
  if not exists (select 1 from auth.users u where u.id = p_user) then
    return;
  end if;

  insert into public.profiles (
    id, plan_id, billing_cadence, store_product_id, renews_at, pending_store_product_id, updated_at
  )
  values (
    p_user,
    p_plan,
    case when ended then null else p_cadence end,
    case when ended then null else p_product_id end,
    case when ended then null else p_renews_at end,
    case when ended or p_update_pending then nullif(p_pending_product_id, '') else null end,
    now()
  )
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        billing_cadence = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when p_product_id is not null then excluded.billing_cadence
          else profiles.billing_cadence
        end,
        store_product_id = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when p_product_id is not null then excluded.store_product_id
          else profiles.store_product_id
        end,
        renews_at = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when p_product_id is not null then excluded.renews_at
          else profiles.renews_at
        end,
        pending_store_product_id = case
          when excluded.plan_id in ('trial', 'lapsed') then null
          when p_update_pending then nullif(p_pending_product_id, '')
          else profiles.pending_store_product_id
        end,
        updated_at = now();
end;
$$;

create table if not exists public.recovery_fetch_throttle (
  code_hash text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

revoke all on public.recovery_fetch_throttle from public, anon, authenticated;

create or replace function public.fetch_life_recovery(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  h text;
  body jsonb;
  hits int;
begin
  if char_length(normalized) < 16 then
    return null;
  end if;
  h := public._life_code_hash(normalized);

  insert into public.recovery_fetch_throttle (code_hash, window_start, hits)
  values (h, now(), 1)
  on conflict (code_hash) do update
    set window_start = case
          when public.recovery_fetch_throttle.window_start < now() - interval '15 minutes'
            then now()
          else public.recovery_fetch_throttle.window_start
        end,
        hits = case
          when public.recovery_fetch_throttle.window_start < now() - interval '15 minutes'
            then 1
          else public.recovery_fetch_throttle.hits + 1
        end
  returning recovery_fetch_throttle.hits into hits;

  if hits > 20 then
    raise exception 'too many attempts, try again later';
  end if;

  select r.body into body
  from public.life_recovery r
  where r.code_hash = h;

  return body;
end;
$$;

revoke all on function public.fetch_life_recovery(text) from public;
grant execute on function public.fetch_life_recovery(text) to anon, authenticated;
