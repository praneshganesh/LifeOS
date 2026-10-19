# Backend (staging)

LifeOS stays **offline-capable**. Supabase is Auth + Postgres + Storage for sync, not a dump of the whole household as one JSON blob.

**Architecture (household-scoped rows, outbox, airplane mode, media bucket):** see [`docs/SYNC_ARCHITECTURE.md`](./SYNC_ARCHITECTURE.md).  
The `life_stores` JSON snapshot is now **prefs only**; domain data lives in per-module tables.

Supabase is the right default at this scale: Postgres + Auth + RLS, connection pooling, and a path to larger compute later. Talk’s bottleneck is still OpenAI, not the database. Persistent [preview branches](https://supabase.com/docs/guides/deployment/branching) are extra compute (billed per hour); keep one long-lived **staging** branch, not a branch per PR, until we need previews.


## Git ↔ Supabase

| Git | Supabase | Role |
|-----|----------|------|
| `staging` | persistent branch **staging** | Apply every migration here first |
| `main` | production project (the DB you created) | Only after staging is healthy |

Never push a new file under `supabase/migrations/` straight to `main`. A GitHub check blocks PRs into `main` unless they come from `staging`.

### 1. Connect GitHub (once)

In the [Supabase dashboard](https://supabase.com/dashboard) → **Project Settings → Integrations → GitHub**:

1. Authorize GitHub as **praneshganesh** and select [LifeOS](https://github.com/praneshganesh/LifeOS).
2. Working directory: `.` (`supabase/` is at the repo root).
3. Enable **Automatic branching**.
4. Leave **Deploy to production** **off** until a staging migration has succeeded. Then turn it on so merges to `main` apply to production.
5. Optional: **Supabase changes only** so unrelated app commits don’t spin ephemeral preview DBs.

### 2. Create persistent `staging`

Dashboard → **Branches** → create **staging** and mark it **persistent** (does not pause or delete when a PR closes).

Or CLI (needs `npx supabase login` + `npx supabase link`):

```bash
npx supabase branches create staging --persistent
npx supabase branches list
```

Paste the **BRANCH PROJECT ID** into `supabase/config.toml`:

```toml
[remotes.staging]
project_id = "xxxxxxxxxxxxxxxxxxxx"
```

Push that config on Git `staging`.

Persistent branches may be plan-gated (Pro). If create returns 402, upgrade or create staging as a **second project** named `lifeos-staging` and put its ref in `[remotes.staging]` instead.

### 3. App env (local / staging builds)

Use the **staging** branch URL + **publishable** key (`sb_publishable_...`), not production and not a secret key:

```
EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Dashboard: **Settings → API Keys** (new keys tab). If you only see legacy `anon` / `service_role`, click **Create new API Keys**. Restart Expo after changing `EXPO_PUBLIC_*`. Never put `sb_secret_...` or `service_role` in the app.

## Connect (first migration)

With GitHub linked, pushing `supabase/migrations/` to Git `staging` applies them on the persistent staging DB. Until that’s enabled, run `supabase/migrations/20260815120000_profiles.sql` in the **staging** SQL editor.

`lib/supabase.ts` is a no-op until those env vars exist, so Talk and inventory keep working offline.

## What we store on the server

| Table | Columns | Why |
|-------|---------|-----|
| `auth.users` | id (anonymous until Apple Sign in) | Session for RLS |
| `public.profiles` | `id` (= auth uid), `plan_id`, `billing_cadence`, `store_product_id`, `renews_at`, `pending_store_product_id` | Plan tier plus the active store product (monthly vs yearly) |
| `public.households`, `household_members`, `household_invites` | membership + roles | Sync + RLS scope |
| `public.household_people` | `id, household_id, name, role, relation, body` | Kids / pets / assignees |
| `public.spaces`, `rooms` | `id, household_id, title, body` | Space layout (legacy ids map to stable uuids) |
| `public.things` | `id, household_id, name, category, space_key, room, is_document, document_kind, expiry_date, body` | Inventory + document metadata |
| `public.reminders` | `id, household_id, thing_id?, label, remind_at, remind_interval, body` | Last Done / tasks |
| `public.expenses`, `subscriptions`, `habits`, `class_packs` | `id, household_id, person_id?, title, body` | Module rows (full item in `body`) |
| `public.ai_daily_usage` | `user_id / household_id, day, used` | Talk / Ask / Identify caps (`consume_ai_turn`) |
| `public.life_stores` | `user_id`, `store_key`, `body` jsonb | **Prefs only**: notification prefs, profile, onboarding, appearance, plan mirror, AI usage mirror, talk voice |
| `public.life_recovery` | `code_hash`, `household_id`, `body` | Recovery code → household claim (`claim_household_by_recovery`) |
| Storage bucket `media` (private) | `{household_id}/{uuid}.ext` | Receipts, item photos, document scans; RLS by household membership; signed URLs only |

All domain tables carry `created_at / updated_at / updated_by / client_mutated_at / deleted_at` and are RLS-scoped through `user_household_ids()` (read) and `household_can_edit()` (write).

**Media:** the device keeps the original `file://` (`imageUri` / `receiptUri`, stripped from every cloud body). The sync engine uploads to `media` and writes `imagePath` / `receiptPath` on the row; a new device downloads through a 1h signed URL into the app cache. Sync never deletes a local file. Identity documents are stored in the same private bucket; the user can keep them off the cloud by not capturing a photo, and Capture "AI off" keeps them away from OCR and OpenAI.

**Plan enforcement:** RevenueCat is the source of truth. The chat API exposes `POST /rc/webhook` (`server/revenuecat.mjs`) which writes `profiles.plan_id` plus `billing_cadence`, `store_product_id`, `renews_at`, and `pending_store_product_id` through `admin_set_plan_id` with the service role (env: `REVENUECAT_WEBHOOK_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, optional `REVENUECAT_SECRET_KEY`). The client-side `set_my_plan_id` remains as an optimistic mirror of the same columns. `consume_ai_turn` reads `plan_id` only (trial 25 / pro 100 / a leftover family row uses the Pro cap).

**JWT verification on the chat API:** `server/aiAuth.mjs` verifies the Supabase access token locally against the project JWKS (`/auth/v1/.well-known/jwks.json`, ES256 / RS256) and falls back to `/auth/v1/user` only for HS256 projects or JWKS outages.

**Deploy:** apply `supabase/migrations/20260928090000_row_sync_all_modules.sql` on staging first, then production; redeploy the chat API with the webhook env set.

Turn on **Anonymous** sign-ins in the staging Auth providers (or `enable_anonymous_sign_ins` locally). Apply `supabase/migrations/20260815180000_life_stores.sql` on staging before relying on backup.

The app opens an anonymous session automatically when `EXPO_PUBLIC_SUPABASE_URL` + publishable key are set. Settings → Export & backup shows last sync and the recovery code.

**Sign in with Apple** links the anonymous user (`linkIdentity` + IdToken) or reclaims on a new device (`signInWithIdToken`). Setup: App Store Connect capability + Supabase Apple provider + Manual linking, see [`AUTH_APPLE.md`](./AUTH_APPLE.md). Settings → Account exposes the UI; paywall / invite soft-nudge “Save with Apple”.

## Onboarding vs Apple App Privacy

Apple asks **what you collect** and **why**. Collecting unused fields is the failure mode.

**Keep on-device (already the tour):**

- Home nickname
- Household first names you type
- Things, documents, expenses, habits, classes

Those are the product. They are **not** required for an account.

**Sign in with Apple (see `AUTH_APPLE.md`):**

- Collect **User ID** only → App Functionality (sync / seats)
- Hide My Email / private relay: do not also ask for a personal email
- Do **not** request name from Apple unless we show it in UI we cannot get another way
- Notifications: optional permission, not an account field

**Do not collect on signup:** email (beyond Apple relay), phone, date of birth, gender, location, government ID photos to the cloud.

Talk already sends a compact inventory summary to the chat proxy (OpenAI). That is a separate disclosure (data used to process the request, not sold). Backend sync is a later disclosure.
