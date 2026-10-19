# Server push notifications plan

Status: proposal, nothing built yet. Local notifications were fixed separately (see "What already works" below).

## Why

Every alert today is a **local notification** that the phone schedules for itself when the app runs. That covers your own reminders, but not:

- A reminder a family member adds or changes. Your phone only learns about it at the next sync, which only happens when you open the app.
- Anything that changes on the server while your phone is off or the app is closed for days.

Server push solves both: Supabase knows about every household row, so the server can tell the right phones.

## What already works (local, shipped in the app)

- Reminders use the same alert schedule the reminder screen previews, including quiet hours and custom alerts (`planDatedReminderFires` in `lib/reminderAlerts.ts`).
- Past reminders never re-fire on app open. Overdue reminders get one nudge at 9:00 the morning after the due day.
- Warranty, document, policy and subscription dates get alerts (`lib/expiryPlan.ts`), with a Settings switch.
- Everything is rescheduled on launch, after sync, and when notification settings change. Pending notifications are capped well under the iOS limit of 64.

## Design

### 1. Device registration

New table on **staging first** (`sjtkzihmxrxgidflxeqq`), then production after sign-off:

```sql
create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  household_id uuid references public.households (id) on delete cascade,
  expo_push_token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  time_zone text not null,          -- IANA, e.g. Asia/Dubai
  quiet_start text not null default '22:00',
  quiet_end text not null default '07:00',
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now()
);
-- RLS: a user can select/insert/update/delete only rows where user_id = auth.uid().
```

The app calls `Notifications.getExpoPushTokenAsync({ projectId })` after permission is granted and upserts the row on launch, on sign-in, and when quiet hours change. On sign-out or account deletion the row is removed (`delete_my_account` should cascade).

### 2. "Someone changed something" pushes (phase 1)

When a household member inserts or meaningfully updates a `reminders` row (new label, new date, assigned to someone), every **other** member's devices get a push, for example "Priya added: Dentist for Ishaan, Tue 4 PM".

- Trigger: a Postgres trigger writes to a small `push_outbox` table (row id, household id, actor, kind). Using the outbox rather than calling HTTP from the trigger keeps writes fast and retryable.
- Sender: the existing Fly chat server (`saavi-chat-pranesh`) drains `push_outbox` every 30 seconds with the service-role key and calls the Expo Push API in batches of up to 100.
- The push carries `data.href` (for example `/last-done/<id>`), so tapping it opens the reminder through the existing tap handler in `lib/notificationRouting.ts`.
- On receipt, the app runs a sync and reschedules local alerts, so the new reminder's own alerts arrive at the right times afterwards.

### 3. Server-owned due alerts for shared reminders (phase 2)

For reminders created by someone else, the server sends the due-time alerts itself instead of relying on the receiving phone having synced.

- Move the alert-schedule logic (`computeAlertSchedule`, `planDatedReminderFires`) into a shared module both the app and server import. The Fly image currently copies only `server/*.mjs`, so that needs a build step or a plain JS copy.
- A worker on the Fly server runs every 5 minutes. For each household reminder it computes the upcoming alerts per device using that device's time zone and quiet hours, and sends the ones due in the next window.
- A `push_sent (reminder_id, device_id, fire_at)` ledger with a unique key makes sending idempotent, so retries and overlapping runs never double-send.
- To avoid duplicates, the phone skips local scheduling for reminders whose `updated_by` is another user (the server owns those), and keeps local scheduling for its own reminders so they still work offline.

### 4. Not planned

- Silent background pushes to wake the app and re-sync. iOS throttles these heavily, so they're unreliable as the main path.
- Marketing or engagement pushes.

## What you need to do (cannot be done by the agent)

- **iOS:** make sure the EAS project has an Apple Push Notifications key. Run `eas credentials`, choose iOS, then "Push Notifications" (EAS can create one with your Apple login).
- **Android:** create a Firebase project, enable Cloud Messaging, and upload the **FCM v1 service account key** to EAS (`eas credentials`, then Android, then "Google Service Account" for FCM V1). Keep that JSON private; don't paste it into chat.
- Approve applying the migration to staging, and later to production.

## Rollout

1. Migration on staging. App registers tokens. Verify rows appear for both test devices.
2. Phase 1 change pushes on staging, tested with two accounts in one household.
3. Phase 2 server-owned alerts behind a server flag, with local scheduling still on as a fallback.
4. Production migration and server env after sign-off.

Rough size: phase 1 is 1 to 2 days, phase 2 is 2 to 3 days, plus store-credential setup.
