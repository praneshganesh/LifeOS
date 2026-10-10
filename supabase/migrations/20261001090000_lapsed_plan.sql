-- A paid subscription that ends is lapsed. It is not a new trial.
-- The signed-in client may lower a plan or refresh the same tier.
-- Only the service-role webhook may raise trial/lapsed to pro/family.

alter table public.profiles drop constraint if exists profiles_plan_id_check;
alter table public.profiles
  add constraint profiles_plan_id_check
  check (plan_id in ('trial', 'pro', 'family', 'lapsed'));

create or replace function public.ai_daily_limit_for_plan(p_plan text)
returns int
language sql
immutable
as $$
  select case coalesce(p_plan, 'trial')
    when 'pro' then 30
    when 'family' then 80
    when 'lapsed' then 0
    when 'trial' then 5
    else 0
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
  cur text;
  cur_rank int;
  new_rank int;
  ended boolean;
begin
  if auth.uid() is null then
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

  select plan_id into cur from public.profiles where id = auth.uid();
  cur_rank := case coalesce(cur, 'trial') when 'family' then 2 when 'pro' then 1 else 0 end;
  new_rank := case p_plan when 'family' then 2 when 'pro' then 1 else 0 end;
  if new_rank > cur_rank then
    return;
  end if;

  ended := p_plan in ('trial', 'lapsed');

  insert into public.profiles (
    id, plan_id, billing_cadence, store_product_id, renews_at, pending_store_product_id, updated_at
  )
  values (
    auth.uid(),
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
set search_path = public
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
