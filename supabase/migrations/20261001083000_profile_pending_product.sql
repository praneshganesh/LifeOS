-- Let the signed-in user record a deferred product switch.
-- Trial clears it. A paid sync leaves it alone unless p_update_pending is true.

drop function if exists public.set_my_plan_id(text, text, text, timestamptz);

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
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_plan not in ('trial', 'pro', 'family') then
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

  insert into public.profiles (
    id, plan_id, billing_cadence, store_product_id, renews_at, pending_store_product_id, updated_at
  )
  values (
    auth.uid(),
    p_plan,
    case when p_plan = 'trial' then null else p_cadence end,
    case when p_plan = 'trial' then null else p_product_id end,
    case when p_plan = 'trial' then null else p_renews_at end,
    case
      when p_plan = 'trial' then null
      when p_update_pending then nullif(p_pending_product_id, '')
      else null
    end,
    now()
  )
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        billing_cadence = case
          when excluded.plan_id = 'trial' then null
          when excluded.store_product_id is not null then excluded.billing_cadence
          else profiles.billing_cadence
        end,
        store_product_id = case
          when excluded.plan_id = 'trial' then null
          when excluded.store_product_id is not null then excluded.store_product_id
          else profiles.store_product_id
        end,
        renews_at = case
          when excluded.plan_id = 'trial' then null
          when excluded.store_product_id is not null then excluded.renews_at
          else profiles.renews_at
        end,
        pending_store_product_id = case
          when excluded.plan_id = 'trial' then null
          when p_update_pending then nullif(p_pending_product_id, '')
          else profiles.pending_store_product_id
        end,
        updated_at = now();
end;
$$;

revoke all on function public.set_my_plan_id(text, text, text, timestamptz, text, boolean) from public, anon;
grant execute on function public.set_my_plan_id(text, text, text, timestamptz, text, boolean) to authenticated;
