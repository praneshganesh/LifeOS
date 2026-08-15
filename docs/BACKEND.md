# Backend (staging)

LifeOS stays **local-first**. Supabase is for a future account + sync, not a place to dump the household.

## Connect

1. In the [Supabase dashboard](https://supabase.com/dashboard) → Project Settings → API, copy **Project URL** and **anon public** key.
2. Put them in `.env` (never commit `.env`):

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

3. Run `supabase/migrations/20260815120000_profiles.sql` in the SQL editor (or `supabase link` + `supabase db push` once the CLI is linked).
4. Restart Expo after changing `EXPO_PUBLIC_*`.

The **service role** key stays in the dashboard / CI only. It must never ship in the app.

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

## Branch

Work this track on **`staging`**. `main` stays the local-first app until a backend slice is ready to merge.
