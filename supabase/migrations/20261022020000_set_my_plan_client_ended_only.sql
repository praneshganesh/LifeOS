-- Clients must not grant themselves Pro/Family. RevenueCat → admin_set_plan_id
-- is the only path that writes paid plans. Authenticated callers may only
-- mirror ended access (trial / lapsed).

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
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  -- Paid plans are webhook-only (service_role → admin_set_plan_id).
  if p_plan not in ('trial', 'lapsed') then
    raise exception 'invalid plan';
  end if;

  select plan_id, renews_at into cur_plan, cur_renews
  from public.profiles
  where id = uid;

  -- Do not wipe an active paid period from the client (RC / Restore owns that).
  if cur_plan in ('pro', 'family')
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
    null,
    null,
    null,
    null,
    now()
  )
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        billing_cadence = null,
        store_product_id = null,
        renews_at = null,
        pending_store_product_id = null,
        updated_at = now();
end;
$$;

revoke all on function public.set_my_plan_id(text, text, text, timestamptz, text, boolean) from public, anon;
grant execute on function public.set_my_plan_id(text, text, text, timestamptz, text, boolean) to authenticated;

-- recovery_fetch_throttle is security-definer only; enable RLS with no policies
-- so the Supabase linter does not flag a public-looking table.
alter table if exists public.recovery_fetch_throttle enable row level security;
