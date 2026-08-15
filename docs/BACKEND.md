# Backend (staging)

LifeOS stays **local-first**. Supabase is for a future account + sync, not a place to dump the household.

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

Use the **staging** branch URL + anon key, not production:

```
EXPO_PUBLIC_SUPABASE_URL=https://<staging-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

Restart Expo after changing `EXPO_PUBLIC_*`. Never put the service-role key in the app.

## Connect (first migration)

With GitHub linked, pushing `supabase/migrations/` to Git `staging` applies them on the persistent staging DB. Until that’s enabled, run `supabase/migrations/20260815120000_profiles.sql` in the **staging** SQL editor.

`lib/supabase.ts` is a no-op until those env vars exist, so Talk and inventory keep working offline.

## What we store on the server (v1)

| Table | Columns | Why |
|-------|---------|-----|
| `auth.users` | id, Apple/email from Auth | Sign-in only |
| `public.profiles` | `id` (= auth uid), timestamps | Empty profile so RLS has a row |

No display name, phone, birthday, address, photos, or inventory on Supabase yet.

## Onboarding vs Apple App Privacy

Apple asks **what you collect** and **why**. Collecting unused fields is the failure mode.

**Keep on-device (already the tour):**

- Home nickname
- Household first names you type
- Things, documents, expenses, habits, classes

Those are the product. They are **not** required for an account.

**When we add Sign in with Apple (needs Developer account):**

- Collect **User ID** only → App Functionality (sync later)
- Hide My Email / private relay — do not also ask for a personal email
- Do **not** request name from Apple unless we show it in UI we cannot get another way
- Notifications: optional permission, not an account field

**Do not collect on signup:** email (beyond Apple relay), phone, date of birth, gender, location, government ID photos to the cloud.

Talk already sends a compact inventory summary to the chat proxy (OpenAI). That is a separate disclosure (data used to process the request, not sold). Backend sync is a later disclosure.
