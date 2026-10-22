-- Fix recovery ownership hijack + rate-limit gaps + orphan cleanup.
-- 1) Restore upsert_life_recovery checks (membership, JSON object, code length ≤ 32).
-- 2) Throttle fetch/claim by client IP (survives anon re-sign-in) + by user when present.
-- 3) Backfill owner_user_id on existing recovery rows from household owners.

create or replace function public._recovery_client_ip()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  headers jsonb;
  raw text;
  ip text;
begin
  begin
    headers := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    headers := null;
  end;

  raw := coalesce(
    headers->>'cf-connecting-ip',
    headers->>'x-real-ip',
    headers->>'x-forwarded-for',
    ''
  );
  -- x-forwarded-for may be a list; take the first hop.
  ip := lower(trim(split_part(raw, ',', 1)));
  if ip = '' or ip = 'unknown' then
    begin
      ip := host(inet_client_addr());
    exception when others then
      ip := '';
    end;
  end if;
  if ip = '' or ip is null then
    return 'ip:unknown';
  end if;
  return 'ip:' || ip;
end;
$$;

revoke all on function public._recovery_client_ip() from public, anon, authenticated;

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
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if char_length(normalized) < 16 or char_length(normalized) > 32 then
    raise exception 'invalid recovery code';
  end if;
  if p_body is null or jsonb_typeof(p_body) <> 'object' then
    raise exception 'invalid backup body';
  end if;
  -- Only a member may bind the code to a household.
  if p_household is not null
     and p_household not in (select public.user_household_ids()) then
    raise exception 'not a member of that household';
  end if;
  h := public._life_code_hash(normalized);
  insert into public.life_recovery (code_hash, body, household_id, owner_user_id, updated_at)
  values (h, p_body, p_household, uid, now())
  on conflict (code_hash) do update
    set body = excluded.body,
        household_id = coalesce(excluded.household_id, public.life_recovery.household_id),
        owner_user_id = coalesce(public.life_recovery.owner_user_id, excluded.owner_user_id, uid),
        updated_at = now();
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
  ip_key text := public._recovery_client_ip();
begin
  if char_length(normalized) < 16 then
    return null;
  end if;
  h := public._life_code_hash(normalized);

  -- IP survives anonymous re-sign-in; do not share one global "anon" pool.
  perform public._recovery_bump_throttle('actor', ip_key, 40);
  if auth.uid() is not null then
    perform public._recovery_bump_throttle('actor', 'u:' || auth.uid()::text, 40);
  end if;
  perform public._recovery_bump_throttle('code', h, 20);

  select r.body into body
  from public.life_recovery r
  where r.code_hash = h;

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

-- Existing rows never got owner_user_id; backfill from a household owner.
update public.life_recovery r
set owner_user_id = sub.user_id
from (
  select distinct on (m.household_id)
    m.household_id,
    m.user_id
  from public.household_members m
  where m.permission = 'owner'
  order by m.household_id, m.user_id
) sub
where r.owner_user_id is null
  and r.household_id is not null
  and r.household_id = sub.household_id;
