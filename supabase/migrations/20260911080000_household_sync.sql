-- Household-scoped row sync (docs/SYNC_ARCHITECTURE.md).
-- Solo = household of one; Family adds members, not a new data model.
-- Domain rows: core queryable columns + body jsonb (long-tail app fields).
-- Offline-first: ids are client-generated UUIDs; deletes are tombstones.

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Households & membership
-- ---------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null default 'Home',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint households_name_len check (char_length(name) between 1 and 80)
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  permission text not null default 'editor'
    check (permission in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index if not exists household_members_user_idx
  on public.household_members (user_id);

-- Kids / pets / people without logins (assignment targets).
create table if not exists public.household_people (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name text not null,
  role text not null default 'adult'
    check (role in ('adult', 'child', 'parent', 'pet')),
  relation text,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  client_mutated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists household_people_sync_idx
  on public.household_people (household_id, updated_at);

create table if not exists public.household_invites (
  id uuid primary key default extensions.gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  code_hash text not null unique,
  permission text not null default 'editor'
    check (permission in ('editor', 'viewer')),
  created_by uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id)
);

-- ---------------------------------------------------------------------------
-- Membership helpers (security definer avoids RLS recursion)
-- ---------------------------------------------------------------------------

create or replace function public.user_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.household_members where user_id = auth.uid();
$$;

create or replace function public.household_permission(p_household uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select permission from public.household_members
  where household_id = p_household and user_id = auth.uid();
$$;

create or replace function public.household_can_edit(p_household uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.household_permission(p_household) in ('owner', 'editor'), false);
$$;

revoke all on function public.user_household_ids() from public, anon;
revoke all on function public.household_permission(uuid) from public, anon;
revoke all on function public.household_can_edit(uuid) from public, anon;
grant execute on function public.user_household_ids() to authenticated;
grant execute on function public.household_permission(uuid) to authenticated;
grant execute on function public.household_can_edit(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Domain tables (row per entity; body jsonb carries app fields)
-- ---------------------------------------------------------------------------

create table if not exists public.things (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  person_id uuid references public.household_people (id) on delete set null,
  name text not null default '',
  category text,
  space_key text,          -- app space id (s1, s4, …) until spaces table lands
  room text,
  is_document boolean not null default false,
  document_kind text,
  expiry_date date,
  body jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  client_mutated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists things_sync_idx
  on public.things (household_id, updated_at);
create index if not exists things_person_idx
  on public.things (person_id) where person_id is not null;

create table if not exists public.reminders (
  id uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  person_id uuid references public.household_people (id) on delete set null,
  thing_id uuid references public.things (id) on delete set null,
  label text not null default '',
  remind_at timestamptz,
  remind_interval jsonb,   -- RemindInterval shape (weekdays/hour/minute/endsAt)
  body jsonb not null default '{}'::jsonb,  -- logs, notes, category …
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id),
  client_mutated_at timestamptz,
  deleted_at timestamptz
);

create index if not exists reminders_sync_idx
  on public.reminders (household_id, updated_at);

-- updated_at triggers
drop trigger if exists households_touch on public.households;
create trigger households_touch before update on public.households
  for each row execute procedure public.touch_updated_at();

drop trigger if exists household_people_touch on public.household_people;
create trigger household_people_touch before update on public.household_people
  for each row execute procedure public.touch_updated_at();

drop trigger if exists things_touch on public.things;
create trigger things_touch before update on public.things
  for each row execute procedure public.touch_updated_at();

drop trigger if exists reminders_touch on public.reminders;
create trigger reminders_touch before update on public.reminders
  for each row execute procedure public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_people enable row level security;
alter table public.household_invites enable row level security;
alter table public.things enable row level security;
alter table public.reminders enable row level security;

-- households: members read; owner renames; create/join via RPC only
create policy "households_select_member" on public.households
  for select to authenticated
  using (id in (select public.user_household_ids()));

create policy "households_update_owner" on public.households
  for update to authenticated
  using (public.household_permission(id) = 'owner')
  with check (public.household_permission(id) = 'owner');

-- household_members: visible to co-members; leave self; owner manages
create policy "members_select_same_household" on public.household_members
  for select to authenticated
  using (household_id in (select public.user_household_ids()));

create policy "members_delete_self_or_owner" on public.household_members
  for delete to authenticated
  using (
    user_id = auth.uid()
    or public.household_permission(household_id) = 'owner'
  );

create policy "members_update_owner" on public.household_members
  for update to authenticated
  using (public.household_permission(household_id) = 'owner')
  with check (public.household_permission(household_id) = 'owner');

-- household_people / things / reminders: members read, editors write
create policy "people_select_member" on public.household_people
  for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "people_write_editor" on public.household_people
  for insert to authenticated
  with check (public.household_can_edit(household_id));
create policy "people_update_editor" on public.household_people
  for update to authenticated
  using (public.household_can_edit(household_id))
  with check (public.household_can_edit(household_id));
create policy "people_delete_editor" on public.household_people
  for delete to authenticated
  using (public.household_can_edit(household_id));

create policy "things_select_member" on public.things
  for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "things_insert_editor" on public.things
  for insert to authenticated
  with check (public.household_can_edit(household_id));
create policy "things_update_editor" on public.things
  for update to authenticated
  using (public.household_can_edit(household_id))
  with check (public.household_can_edit(household_id));
create policy "things_delete_editor" on public.things
  for delete to authenticated
  using (public.household_can_edit(household_id));

create policy "reminders_select_member" on public.reminders
  for select to authenticated
  using (household_id in (select public.user_household_ids()));
create policy "reminders_insert_editor" on public.reminders
  for insert to authenticated
  with check (public.household_can_edit(household_id));
create policy "reminders_update_editor" on public.reminders
  for update to authenticated
  using (public.household_can_edit(household_id))
  with check (public.household_can_edit(household_id));
create policy "reminders_delete_editor" on public.reminders
  for delete to authenticated
  using (public.household_can_edit(household_id));

-- invites: no direct table access (RPC only)
revoke all on public.household_invites from public, anon, authenticated;

grant select, update on public.households to authenticated;
grant select, update, delete on public.household_members to authenticated;
grant select, insert, update, delete on public.household_people to authenticated;
grant select, insert, update, delete on public.things to authenticated;
grant select, insert, update, delete on public.reminders to authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- Solo bootstrap: return caller's household, creating one when missing.
create or replace function public.ensure_household(p_name text default 'Home')
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  hid uuid;
  cleaned text := left(coalesce(nullif(trim(p_name), ''), 'Home'), 80);
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select household_id into hid
  from public.household_members
  where user_id = auth.uid()
  order by created_at
  limit 1;

  if hid is not null then
    return hid;
  end if;

  insert into public.households (name) values (cleaned) returning id into hid;
  insert into public.household_members (household_id, user_id, permission)
  values (hid, auth.uid(), 'owner');
  return hid;
end;
$$;

create or replace function public._invite_code_hash(p_code text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(
      convert_to(upper(regexp_replace(p_code, '[^A-Z0-9]', '', 'g')), 'UTF8'),
      'sha256'
    ),
    'hex'
  );
$$;

-- Owner/editor creates an invite; plaintext code returned exactly once.
create or replace function public.create_household_invite(
  p_household uuid,
  p_permission text default 'editor',
  p_ttl_hours integer default 168
)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  code text;
begin
  if public.household_permission(p_household) <> 'owner' then
    raise exception 'only the household owner can invite';
  end if;
  if p_permission not in ('editor', 'viewer') then
    raise exception 'invalid permission';
  end if;

  code := upper(encode(extensions.gen_random_bytes(10), 'hex')); -- 20 hex chars

  insert into public.household_invites
    (household_id, code_hash, permission, created_by, expires_at)
  values (
    p_household,
    public._invite_code_hash(code),
    p_permission,
    auth.uid(),
    now() + make_interval(hours => greatest(1, least(p_ttl_hours, 720)))
  );

  return code;
end;
$$;

create or replace function public.accept_household_invite(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  inv public.household_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into inv
  from public.household_invites
  where code_hash = public._invite_code_hash(coalesce(p_code, ''))
    and used_at is null
    and expires_at > now()
  for update;

  if inv.id is null then
    raise exception 'invalid or expired invite';
  end if;

  insert into public.household_members (household_id, user_id, permission)
  values (inv.household_id, auth.uid(), inv.permission)
  on conflict (household_id, user_id) do nothing;

  update public.household_invites
  set used_at = now(), used_by = auth.uid()
  where id = inv.id;

  return inv.household_id;
end;
$$;

revoke all on function public.ensure_household(text) from public, anon;
revoke all on function public._invite_code_hash(text) from public, anon, authenticated;
revoke all on function public.create_household_invite(uuid, text, integer) from public, anon;
revoke all on function public.accept_household_invite(text) from public, anon;
grant execute on function public.ensure_household(text) to authenticated;
grant execute on function public.create_household_invite(uuid, text, integer) to authenticated;
grant execute on function public.accept_household_invite(text) to authenticated;
