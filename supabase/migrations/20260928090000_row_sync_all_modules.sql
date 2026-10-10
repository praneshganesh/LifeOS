-- Row-level sync for every module + durable media + recovery → household.
-- Completes docs/SYNC_ARCHITECTURE.md phases A–D:
--   · expenses / subscriptions / habits / class_packs / spaces / rooms rows
--   · private `media` bucket scoped by household path
--   · recovery code claims the household (row data), blob is prefs-only
--   · service-role plan mirror for the RevenueCat webhook

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Generic household row table factory (id, household_id, body, sync columns)
-- ---------------------------------------------------------------------------

create or replace function public._create_household_row_table(p_table text)
returns void
language plpgsql
as $$
begin
  execute format($f$
    create table if not exists public.%1$I (
      id uuid primary key,
      household_id uuid not null references public.households (id) on delete cascade,
      person_id uuid,
      title text not null default '',
      body jsonb not null default '{}'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      updated_by uuid references auth.users (id),
      client_mutated_at timestamptz,
      deleted_at timestamptz
    )$f$, p_table);

  execute format(
    'create index if not exists %1$I on public.%2$I (household_id, updated_at)',
    p_table || '_sync_idx', p_table
  );

  execute format('drop trigger if exists %1$I on public.%2$I', p_table || '_touch', p_table);
  execute format(
    'create trigger %1$I before update on public.%2$I for each row execute procedure public.touch_updated_at()',
    p_table || '_touch', p_table
  );

  execute format('alter table public.%1$I enable row level security', p_table);

  execute format('drop policy if exists %1$I on public.%2$I', p_table || '_select_member', p_table);
  execute format($f$
    create policy %1$I on public.%2$I
      for select to authenticated
      using (household_id in (select public.user_household_ids()))$f$,
    p_table || '_select_member', p_table);

  execute format('drop policy if exists %1$I on public.%2$I', p_table || '_insert_editor', p_table);
  execute format($f$
    create policy %1$I on public.%2$I
      for insert to authenticated
      with check (public.household_can_edit(household_id))$f$,
    p_table || '_insert_editor', p_table);

  execute format('drop policy if exists %1$I on public.%2$I', p_table || '_update_editor', p_table);
  execute format($f$
    create policy %1$I on public.%2$I
      for update to authenticated
      using (public.household_can_edit(household_id))
      with check (public.household_can_edit(household_id))$f$,
    p_table || '_update_editor', p_table);

  execute format('drop policy if exists %1$I on public.%2$I', p_table || '_delete_editor', p_table);
  execute format($f$
    create policy %1$I on public.%2$I
      for delete to authenticated
      using (public.household_can_edit(household_id))$f$,
    p_table || '_delete_editor', p_table);

  execute format(
    'grant select, insert, update, delete on public.%1$I to authenticated',
    p_table
  );
end;
$$;

select public._create_household_row_table('expenses');
select public._create_household_row_table('subscriptions');
select public._create_household_row_table('habits');
select public._create_household_row_table('class_packs');
select public._create_household_row_table('spaces');
select public._create_household_row_table('rooms');

drop function public._create_household_row_table(text);

-- household_people already exists (20260911080000) with name/role/relation.
-- Add updated_by/client_mutated_at were present; nothing else needed.

-- ---------------------------------------------------------------------------
-- Media: private bucket, path = {household_id}/{file}
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  false,
  15728640, -- 15 MB
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create or replace function public._media_household(p_name text)
returns uuid
language sql
immutable
as $$
  select case
    when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then split_part(p_name, '/', 1)::uuid
    else null
  end;
$$;

drop policy if exists "media_select_member" on storage.objects;
create policy "media_select_member" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and public._media_household(name) in (select public.user_household_ids())
  );

drop policy if exists "media_insert_editor" on storage.objects;
create policy "media_insert_editor" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and public.household_can_edit(public._media_household(name))
  );

drop policy if exists "media_update_editor" on storage.objects;
create policy "media_update_editor" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and public.household_can_edit(public._media_household(name))
  )
  with check (
    bucket_id = 'media'
    and public.household_can_edit(public._media_household(name))
  );

drop policy if exists "media_delete_editor" on storage.objects;
create policy "media_delete_editor" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and public.household_can_edit(public._media_household(name))
  );

-- ---------------------------------------------------------------------------
-- Recovery code → household claim (row data survives without Apple login)
-- ---------------------------------------------------------------------------

alter table public.life_recovery
  add column if not exists household_id uuid references public.households (id) on delete set null;

-- Replace the 2-arg version (PostgREST cannot disambiguate overloads with defaults).
drop function if exists public.upsert_life_recovery(text, jsonb);

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
  h text;
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
begin
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
  insert into public.life_recovery (code_hash, body, household_id, updated_at)
  values (h, p_body, p_household, now())
  on conflict (code_hash) do update
    set body = excluded.body,
        household_id = coalesce(excluded.household_id, public.life_recovery.household_id),
        updated_at = now();
end;
$$;

-- Typing a valid code on a new phone joins that household as owner.
create or replace function public.claim_household_by_recovery(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  hid uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if char_length(normalized) < 16 then
    return null;
  end if;
  select household_id into hid
  from public.life_recovery
  where code_hash = public._life_code_hash(normalized);
  if hid is null then
    return null;
  end if;
  insert into public.household_members (household_id, user_id, permission)
  values (hid, auth.uid(), 'owner')
  on conflict (household_id, user_id) do update set permission = 'owner';
  return hid;
end;
$$;

revoke all on function public.upsert_life_recovery(text, jsonb, uuid) from public, anon;
revoke all on function public.claim_household_by_recovery(text) from public, anon;
grant execute on function public.upsert_life_recovery(text, jsonb, uuid) to authenticated;
grant execute on function public.claim_household_by_recovery(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Plan mirror for server (RevenueCat webhook uses the service role)
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_plan_id(p_user uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_plan not in ('trial', 'pro', 'family') then
    raise exception 'invalid plan';
  end if;
  insert into public.profiles (id, plan_id, updated_at)
  values (p_user, p_plan, now())
  on conflict (id) do update
    set plan_id = excluded.plan_id,
        updated_at = now();
end;
$$;

revoke all on function public.admin_set_plan_id(uuid, text) from public, anon, authenticated;
grant execute on function public.admin_set_plan_id(uuid, text) to service_role;
