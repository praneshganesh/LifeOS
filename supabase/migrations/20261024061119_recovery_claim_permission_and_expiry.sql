-- Recovery security + hardening:
-- 1) Only household owners may bind a code to a household; store claim_permission.
-- 2) claim_household_by_recovery joins with that stored permission (never hard-coded owner).
-- 3) Leaving/removing a member clears their life_recovery rows for that household.
-- 4) Codes expire (1 year from last upsert); prune throttle on claim too.
-- 5) Drop orphan rows with neither owner nor household; delete_my_account only
--    removes codes owned by the deleting user (plus solo-household leftovers).

alter table public.life_recovery
  add column if not exists claim_permission text;

alter table public.life_recovery
  drop constraint if exists life_recovery_claim_permission_check;

alter table public.life_recovery
  add constraint life_recovery_claim_permission_check
  check (
    claim_permission is null
    or claim_permission in ('owner', 'editor', 'viewer')
  );

alter table public.life_recovery
  add column if not exists created_at timestamptz;

alter table public.life_recovery
  add column if not exists expires_at timestamptz;

update public.life_recovery
set created_at = coalesce(created_at, updated_at, now())
where created_at is null;

update public.life_recovery
set expires_at = coalesce(expires_at, coalesce(created_at, updated_at, now()) + interval '1 year')
where expires_at is null;

alter table public.life_recovery
  alter column created_at set default now();

-- Owner-bound codes that lacked claim_permission: they were always claimed as owner.
update public.life_recovery
set claim_permission = 'owner'
where household_id is not null
  and claim_permission is null;

-- Orphans that delete_my_account cannot reach.
delete from public.life_recovery
where owner_user_id is null
  and household_id is null;

create or replace function public._recovery_prune_throttle()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.recovery_fetch_throttle
  where window_start < now() - interval '7 days';
  delete from public.recovery_actor_throttle
  where window_start < now() - interval '7 days';
exception when others then
  null;
end;
$$;

revoke all on function public._recovery_prune_throttle() from public, anon, authenticated;

create or replace function public._clear_recovery_on_member_leave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.life_recovery
  where household_id = old.household_id
    and (
      owner_user_id = old.user_id
      or (owner_user_id is null and claim_permission is distinct from 'owner')
    );
  return old;
end;
$$;

drop trigger if exists trg_clear_recovery_on_member_leave on public.household_members;
create trigger trg_clear_recovery_on_member_leave
  after delete on public.household_members
  for each row
  execute function public._clear_recovery_on_member_leave();

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
  caller_perm text;
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(normalized) < 16 or char_length(normalized) > 32 then
    raise exception 'invalid recovery code';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    raise exception 'invalid backup body';
  end if;

  if p_household is not null then
    caller_perm := public.household_permission(p_household);
    -- Only an owner may bind the code to a household (editors must not escalate).
    if caller_perm is distinct from 'owner' then
      raise exception 'only an owner can bind a recovery code to a household';
    end if;
  end if;

  h := public._life_code_hash(normalized);
  insert into public.life_recovery (
    code_hash, body, household_id, owner_user_id, claim_permission,
    created_at, updated_at, expires_at
  )
  values (
    h,
    p_body,
    p_household,
    uid,
    case when p_household is not null then 'owner' else null end,
    now(),
    now(),
    now() + interval '1 year'
  )
  on conflict (code_hash) do update
    set body = excluded.body,
        household_id = coalesce(excluded.household_id, public.life_recovery.household_id),
        owner_user_id = coalesce(public.life_recovery.owner_user_id, excluded.owner_user_id, uid),
        claim_permission = coalesce(
          excluded.claim_permission,
          public.life_recovery.claim_permission
        ),
        updated_at = now(),
        expires_at = now() + interval '1 year';
end;
$$;

revoke all on function public.upsert_life_recovery(text, jsonb, uuid) from public, anon;
grant execute on function public.upsert_life_recovery(text, jsonb, uuid) to authenticated;

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
  exp timestamptz;
  ip_key text := public._recovery_client_ip();
begin
  if char_length(normalized) < 16 then
    return null;
  end if;
  h := public._life_code_hash(normalized);

  perform public._recovery_bump_throttle('actor', ip_key, 40);
  if auth.uid() is not null then
    perform public._recovery_bump_throttle('actor', 'u:' || auth.uid()::text, 40);
  end if;
  perform public._recovery_bump_throttle('code', h, 20);

  select r.body, r.expires_at into body, exp
  from public.life_recovery r
  where r.code_hash = h;

  perform public._recovery_prune_throttle();

  if exp is not null and exp < now() then
    return null;
  end if;
  return body;
end;
$$;

revoke all on function public.fetch_life_recovery(text) from public;
grant execute on function public.fetch_life_recovery(text) to anon, authenticated;

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
  perm text;
  exp timestamptz;
  ip_key text := public._recovery_client_ip();
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(normalized) < 16 or char_length(normalized) > 32 then
    return null;
  end if;
  h := public._life_code_hash(normalized);

  perform public._recovery_bump_throttle('actor', 'claim:' || ip_key, 20);
  perform public._recovery_bump_throttle('actor', 'claim:u:' || auth.uid()::text, 20);
  perform public._recovery_bump_throttle('code', 'claim:' || h, 10);

  select household_id, coalesce(claim_permission, 'editor'), expires_at
    into hid, perm, exp
  from public.life_recovery
  where code_hash = h;

  perform public._recovery_prune_throttle();

  if hid is null then
    return null;
  end if;
  if exp is not null and exp < now() then
    return null;
  end if;
  if perm not in ('owner', 'editor', 'viewer') then
    perm := 'editor';
  end if;

  insert into public.household_members (household_id, user_id, permission)
  values (hid, auth.uid(), perm)
  on conflict (household_id, user_id) do update
    set permission = excluded.permission;
  return hid;
end;
$$;

revoke all on function public.claim_household_by_recovery(text) from public, anon;
grant execute on function public.claim_household_by_recovery(text) to authenticated;

-- Only erase recovery codes this user owns; solo-household leftovers without an
-- owner_user_id still clear so an empty home does not keep orphan codes.
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

  delete from public.life_recovery
  where owner_user_id = uid
     or (
       household_id = any (solo)
       and (owner_user_id is null or owner_user_id = uid)
     );

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
