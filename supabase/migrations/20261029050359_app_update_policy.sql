-- Soft vs hard app update policy (singleton row).
-- Clients read this to decide: optional OTA banner, forced OTA reload, or store upgrade.

create table if not exists public.app_update_policy (
  id text primary key default 'default'
    check (id = 'default'),
  -- Semver floor for the native binary (Application.nativeApplicationVersion).
  min_native_version text not null default '0.0.0',
  -- Optional platform-specific build floors (null = ignore).
  min_ios_build integer,
  min_android_version_code integer,
  -- When an EAS Update is available: soft banner vs blocking reload.
  soft_ota_enabled boolean not null default true,
  force_ota boolean not null default false,
  soft_message text,
  force_message text,
  store_message text,
  ios_store_url text,
  android_store_url text,
  updated_at timestamptz not null default now()
);

alter table public.app_update_policy enable row level security;

revoke all on table public.app_update_policy from public, anon, authenticated;
grant select on table public.app_update_policy to anon, authenticated;

drop policy if exists app_update_policy_select on public.app_update_policy;
create policy app_update_policy_select
  on public.app_update_policy
  for select
  to anon, authenticated
  using (true);

-- Seed defaults (store URLs can be edited in the dashboard).
insert into public.app_update_policy (
  id,
  min_native_version,
  soft_ota_enabled,
  force_ota,
  soft_message,
  force_message,
  store_message,
  ios_store_url,
  android_store_url
)
values (
  'default',
  '0.0.0',
  true,
  false,
  'A small update is ready. Restart Saavi to get the latest fixes.',
  'A critical update is required to continue using Saavi.',
  'This version of Saavi is no longer supported. Please update from the store.',
  'https://apps.apple.com/app/id6805518688',
  'https://play.google.com/store/apps/details?id=com.praneshganesh.lifeos'
)
on conflict (id) do nothing;
