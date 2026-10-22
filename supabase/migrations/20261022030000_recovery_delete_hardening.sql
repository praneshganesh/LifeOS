-- Recovery + delete launch hardening:
-- 1) Track recovery owner so delete_my_account clears orphan codes.
-- 2) Rate-limit recovery fetch/claim by actor (user or anon) AND by code.
-- 3) Enable RLS on throttle tables (no policies → no direct API access).
-- 4) Prune stale throttle rows.

alter table public.life_recovery
  add column if not exists owner_user_id uuid;

create index if not exists life_recovery_owner_user_id_idx
  on public.life_recovery (owner_user_id);

create table if not exists public.recovery_actor_throttle (
  actor_key text primary key,
  window_start timestamptz not null default now(),
  hits int not null default 0
);

revoke all on public.recovery_actor_throttle from public, anon, authenticated;
alter table public.recovery_actor_throttle enable row level security;

alter table public.recovery_fetch_throttle enable row level security;

create or replace function public._recovery_bump_throttle(
  p_table text,
  p_key text,
  p_max int,
  p_window interval default interval '15 minutes'
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  hits int;
begin
  if p_table = 'code' then
    insert into public.recovery_fetch_throttle (code_hash, window_start, hits)
    values (p_key, now(), 1)
    on conflict (code_hash) do update
      set window_start = case
            when public.recovery_fetch_throttle.window_start < now() - p_window
              then now()
            else public.recovery_fetch_throttle.window_start
          end,
          hits = case
            when public.recovery_fetch_throttle.window_start < now() - p_window
              then 1
            else public.recovery_fetch_throttle.hits + 1
          end
    returning recovery_fetch_throttle.hits into hits;
  else
    insert into public.recovery_actor_throttle (actor_key, window_start, hits)
    values (p_key, now(), 1)
    on conflict (actor_key) do update
      set window_start = case
            when public.recovery_actor_throttle.window_start < now() - p_window
              then now()
            else public.recovery_actor_throttle.window_start
          end,
          hits = case
            when public.recovery_actor_throttle.window_start < now() - p_window
              then 1
            else public.recovery_actor_throttle.hits + 1
          end
    returning recovery_actor_throttle.hits into hits;
  end if;

  if hits > p_max then
    raise exception 'too many attempts, try again later';
  end if;
  return hits;
end;
$$;

revoke all on function public._recovery_bump_throttle(text, text, int, interval)
  from public, anon, authenticated;

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
  actor text := coalesce('u:' || auth.uid()::text, 'anon');
begin
  if char_length(normalized) < 16 then
    return null;
  end if;
  h := public._life_code_hash(normalized);

  -- Distinct-code guessing: 40 tries / 15m per signed-in user, 80 / 15m shared for anon.
  perform public._recovery_bump_throttle(
    'actor',
    actor,
    case when auth.uid() is null then 80 else 40 end
  );
  perform public._recovery_bump_throttle('code', h, 20);

  select r.body into body
  from public.life_recovery r
  where r.code_hash = h;

  -- Opportunistic prune (best-effort, ignore failures).
  begin
    delete from public.recovery_fetch_throttle
    where window_start < now() - interval '7 days';
    delete from public.recovery_actor_throttle
    where window_start < now() - interval '7 days';
  exception when others then
    null;
  end;

  return body;
end;
$$;

revoke all on function public.fetch_life_recovery(text) from public;
grant execute on function public.fetch_life_recovery(text) to anon, authenticated;

create or replace function public.upsert_life_recovery(
  p_code text,
  p_body jsonb,
  p_household uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  h text;
  uid uuid := auth.uid();
begin
  if char_length(normalized) < 16 then
    raise exception 'invalid recovery code';
  end if;
  h := public._life_code_hash(normalized);
  insert into public.life_recovery (code_hash, body, household_id, owner_user_id, updated_at)
  values (h, p_body, p_household, uid, now())
  on conflict (code_hash) do update
    set body = excluded.body,
        household_id = coalesce(excluded.household_id, public.life_recovery.household_id),
        owner_user_id = coalesce(excluded.owner_user_id, public.life_recovery.owner_user_id, uid),
        updated_at = now();
end;
$$;

revoke all on function public.upsert_life_recovery(text, jsonb, uuid) from public, anon;
grant execute on function public.upsert_life_recovery(text, jsonb, uuid) to authenticated;

create or replace function public.claim_household_by_recovery(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  h text;
  hid uuid;
  actor text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(normalized) < 16 then
    return null;
  end if;
  h := public._life_code_hash(normalized);
  actor := 'u:' || auth.uid()::text;

  perform public._recovery_bump_throttle('actor', 'claim:' || actor, 20);
  perform public._recovery_bump_throttle('code', 'claim:' || h, 10);

  select household_id into hid
  from public.life_recovery
  where code_hash = h;
  if hid is null then
    return null;
  end if;
  insert into public.household_members (household_id, user_id, permission)
  values (hid, auth.uid(), 'owner')
  on conflict (household_id, user_id) do update set permission = 'owner';
  return hid;
end;
$$;

revoke all on function public.claim_household_by_recovery(text) from public, anon;
grant execute on function public.claim_household_by_recovery(text) to authenticated;

create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  uid uuid := auth.uid();
  solo uuid[];
  tbl text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;

  select coalesce(array_agg(h.id), '{}'::uuid[])
    into solo
  from public.households h
  where exists (
    select 1 from public.household_members m
    where m.household_id = h.id and m.user_id = uid
  )
  and not exists (
    select 1 from public.household_members m
    where m.household_id = h.id and m.user_id <> uid
  );

  -- Media files: removed by the client via the Storage API before this RPC.

  delete from public.life_recovery
  where household_id = any (solo)
     or owner_user_id = uid;

  delete from public.ai_daily_usage
  where (scope_kind = 'user' and scope_id = uid)
     or (scope_kind = 'household' and scope_id = any (solo));

  delete from public.households
  where id = any (solo);

  foreach tbl in array array[
    'household_people', 'things', 'reminders',
    'expenses', 'subscriptions', 'habits', 'class_packs', 'spaces', 'rooms'
  ]
  loop
    execute format(
      'update public.%I set updated_by = null where updated_by = $1',
      tbl
    ) using uid;
  end loop;

  update public.household_invites
  set used_by = null
  where used_by = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
