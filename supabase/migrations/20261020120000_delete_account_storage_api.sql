-- Supabase Storage blocks DELETE/UPDATE on storage.objects from SQL
-- ("Use the Storage API instead."). Account delete must list paths for the
-- client to remove via storage.from(...).remove(), then erase DB rows only.

create or replace function public.list_my_media_paths()
returns text[]
language plpgsql
security definer
set search_path = public, storage, auth
as $$
declare
  uid uuid := auth.uid();
  solo uuid[];
  paths text[];
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

  select coalesce(array_agg(o.name), '{}'::text[])
    into paths
  from storage.objects o
  where o.bucket_id = 'media'
    and (
      split_part(o.name, '/', 1) = any (select s::text from unnest(solo) as s)
      or o.owner = uid
    );

  return paths;
end;
$$;

revoke all on function public.list_my_media_paths() from public, anon;
grant execute on function public.list_my_media_paths() to authenticated;

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
  where household_id = any (solo);

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
