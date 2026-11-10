# Saavi production launch

Run these in order. Do not skip ahead. Production Supabase is `fmcezwyfinzasmgxanxv`. Staging is `sjtkzihmxrxgidflxeqq` and already has the schema. The local CLI remote in `supabase/config.toml` points at **staging**. Every production command must pass `--project-ref fmcezwyfinzasmgxanxv`.

Last night’s TestFlight build (iOS **35**) used whatever was already in the EAS **production** environment. Do not send that build to App Review until step 6 confirms it talks to production.

## 1. Apply migrations to production

23 files in `supabase/migrations/`, oldest timestamp first, current repo contents once. `20261021120000_launch_hardening.sql` was edited after staging applied it. Production gets this copy, not an older snapshot plus the later fixups on top.

Do not run `supabase link` against production. This repo stays linked to staging. Target production only with `--remote`.

```bash
npx supabase db push --dry-run --remote fmcezwyfinzasmgxanxv
npx supabase db push --yes --remote fmcezwyfinzasmgxanxv
```

Confirm the dry run says `Target: project LifeOs (fmcezwyfinzasmgxanxv) · production` and lists the 23 files before the real push.

- [x] Dry run reviewed (23 files, target LifeOs `fmcezwyfinzasmgxanxv` production)
- [x] `db push` finished on `fmcezwyfinzasmgxanxv` (5 Nov 2026)

## 2. Auth on the production project

Dashboard for **`fmcezwyfinzasmgxanxv`** → Authentication. The 5 Nov screenshots are project `krgzyuexxbyjfhzpzdrt` (Apple callback `https://krgzyuexxbyjfhzpzdrt.supabase.co/auth/v1/callback`). That is not the database from step 1. Repeat the toggles on `https://supabase.com/dashboard/project/fmcezwyfinzasmgxanxv/auth/providers` and press Save.

The anonymous-user banner is expected. Supabase gives an anonymous session the `authenticated` role. Saavi RLS still limits rows to `user_household_ids()` for that user’s id. Captcha stays off for launch. Confirm email stays off.

- [x] Anonymous sign-ins on, on `fmcezwyfinzasmgxanxv` (5 Nov 2026)
- [x] Apple provider on, client ID `com.praneshganesh.lifeos`, on `fmcezwyfinzasmgxanxv` (5 Nov 2026)
- [x] Manual linking on, on `fmcezwyfinzasmgxanxv` (5 Nov 2026)
- [x] Same three toggles also seen on `krgzyuexxbyjfhzpzdrt` (not the launch database)

Android sign-in is in the app (`lib/auth/google.ts`) and is not linked into the iOS binary. It stays hidden until `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is on the EAS build. Current TestFlight and preview APKs still use staging, because step 4 has not pointed EAS at production. Enable the Google provider on staging `sjtkzihmxrxgidflxeqq` first, with the web client id, its client secret, and **Skip nonce check** on. Repeat the same provider on production `fmcezwyfinzasmgxanxv` when step 4 happens. Manual linking is already on in both places that were set up for launch, so the first sign-in attaches Google to the anonymous user. A second phone signs in with Google and gets that user back. The recovery code remains the fallback. The Android SDK puts a nonce in the token, and the app does not send one.

- [ ] Google provider on for staging `sjtkzihmxrxgidflxeqq`, Client ID and secret = the web client, Skip nonce check on
- [ ] Same Google provider on production `fmcezwyfinzasmgxanxv` when EAS points at production
- [ ] Android OAuth client for `com.praneshganesh.lifeos` with the EAS upload-key SHA-1 (and the Play App Signing SHA-1 before a Play install)
- [ ] `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` on the EAS preview and production environments, then a new Android build

## 3. Verify the schema

- [x] Tables: `households`, `household_members`, `life_recovery` (`owner_user_id`, `claim_permission`, `expires_at`), `ai_daily_usage`, `recovery_fetch_throttle`, `recovery_actor_throttle`, `app_update_policy`
- [x] `upsert_life_recovery` contains `only an owner can bind`
- [x] `claim_household_by_recovery` uses `claim_permission`
- [x] `set_my_plan_id` rejects paid plans (client may only end a plan; Pro stays on the RevenueCat webhook)
- [x] `consume_ai_turn` uses `billing_day`
- [x] `select count(*) from public.life_recovery where owner_user_id is null and household_id is null` returns `0`
- [x] `app_update_policy` row `default` exists, `force_ota = false`, `min_native_version = 0.0.0`

## 4. Point servers at production

Publishable key in the app. Service role only on the server.

- [x] EAS **production** env: `EXPO_PUBLIC_SUPABASE_URL` = `https://fmcezwyfinzasmgxanxv.supabase.co` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (10 Nov 2026). Preview stays on staging.
- [x] Production Fly chat API `saavi-chat-pranesh`: `SUPABASE_URL`, publishable key, and `SUPABASE_SERVICE_ROLE_KEY` point at LifeOs (10 Nov 2026). `REVENUECAT_WEBHOOK_SECRET` was left as already deployed.
- [ ] RevenueCat webhook → that Fly app’s `POST /rc/webhook`
- [ ] Supabase **Deploy to production** stays off until step 1 is recorded, then on so later `main` merges only add new files

## 5. Commit the Contact screen, then ship a new store build

`EXPO_PUBLIC_*` is baked in at build time. Profile and Settings now link to Contact (`hello@ibp-labs.com`). That change is still local.

- [x] Commit the Contact screen and the production iOS fixes (10 Nov 2026). Not pushed.
- [ ] `npm run build:ios:submit` after step 4
- [ ] Confirm the new build number in TestFlight (not iOS 35)

## 6. Smoke that build against production

- [ ] New install creates an anonymous session
- [ ] Sign in with Apple on a second install returns the same account
- [ ] Backup code and restore
- [ ] Talk hits the server cap (trial 25 / Pro 100) and the phone cannot raise it
- [ ] Delete account removes the user
- [ ] Contact opens `hello@ibp-labs.com`
- [ ] Sandbox Pro purchase: RevenueCat entitlement `pro` for the Supabase user id, Fly logs `INITIAL_PURCHASE`, `profiles.plan_id` is `pro`, Settings shows Pro
- [ ] Cancel or expiry sends `EXPIRATION` and the app paywalls again

## 7. Submit

- [ ] Hosted Privacy and Terms URLs
- [ ] Screenshots and App Review notes
- [ ] Submit the build from step 5
- [ ] Android later: `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`, production Play build, same purchase check

## 8. After it is live

Leave the update gate soft.

- [ ] `force_ota` stays false
- [ ] JavaScript fixes go out with `eas update --channel production`
- [ ] Raise `min_native_version` only after a store build with that version is available

## Not in this launch

DeviceCheck / Keychain reinstall limits, insurance editor, weekly habits, numeric Thing prices, full undo toasts on Today.
