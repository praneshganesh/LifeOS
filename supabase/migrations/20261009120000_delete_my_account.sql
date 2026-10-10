-- The signed-in user can erase their login and the household they alone belong to.
-- Apple billing is not cancelled here. The app tells them to cancel in iOS Settings.

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

  delete from storage.objects
  where bucket_id = 'media'
    and split_part(name, '/', 1) = any (select s::text from unnest(solo) as s);

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

  -- Uploads keep an owner id. Clear it so deleting the login is not blocked.
  update storage.objects
  set owner = null
  where owner = uid;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
