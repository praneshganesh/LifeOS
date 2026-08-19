-- Household JSON backup. Apple Sign in can link this uid later.
-- Anonymous auth users are `authenticated` and own their rows.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.life_stores (
  user_id uuid not null references auth.users (id) on delete cascade,
  store_key text not null,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, store_key),
  constraint life_stores_key_len check (char_length(store_key) between 8 and 80)
);

create index if not exists life_stores_user_updated_idx
  on public.life_stores (user_id, updated_at desc);

alter table public.life_stores enable row level security;

create policy "life_stores_select_own"
  on public.life_stores for select
  to authenticated
  using (auth.uid() = user_id);

create policy "life_stores_insert_own"
  on public.life_stores for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "life_stores_update_own"
  on public.life_stores for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "life_stores_delete_own"
  on public.life_stores for delete
  to authenticated
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.life_stores to authenticated;

-- Recovery snapshot: typed code on a new phone, no Apple login required.
create table if not exists public.life_recovery (
  code_hash text primary key,
  body jsonb not null,
  updated_at timestamptz not null default now(),
  constraint life_recovery_hash_sha256 check (code_hash ~ '^[0-9a-f]{64}$')
);

alter table public.life_recovery enable row level security;

revoke all on public.life_recovery from public, anon, authenticated;

create or replace function public._life_code_hash(p_code text)
returns text
language sql
immutable
as $$
  select encode(
    extensions.digest(convert_to(upper(regexp_replace(p_code, '[^A-Z0-9]', '', 'g')), 'UTF8'), 'sha256'),
    'hex'
  );
$$;

create or replace function public.upsert_life_recovery(p_code text, p_body jsonb)
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
  h := public._life_code_hash(normalized);
  insert into public.life_recovery (code_hash, body, updated_at)
  values (h, p_body, now())
  on conflict (code_hash) do update
    set body = excluded.body,
        updated_at = now();
end;
$$;

create or replace function public.fetch_life_recovery(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  normalized text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Z0-9]', '', 'g'));
  result jsonb;
begin
  if char_length(normalized) < 16 then
    return null;
  end if;
  select body into result
  from public.life_recovery
  where code_hash = public._life_code_hash(normalized);
  return result;
end;
$$;

revoke all on function public._life_code_hash(text) from public, anon, authenticated;
grant execute on function public.upsert_life_recovery(text, jsonb) to anon, authenticated;
grant execute on function public.fetch_life_recovery(text) to anon, authenticated;
