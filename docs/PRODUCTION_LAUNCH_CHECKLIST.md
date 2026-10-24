# Production launch checklist

Do **not** run production SQL from the agent. Apply migrations yourself on the production Supabase project (`fmcezwyfinzasmgxanxv`) after staging is verified.

## Staging (`sjtkzihmxrxgidflxeqq`)

- [x] UTC Talk billing day (`billing_day`, not ambiguous `day`)
- [x] Client `set_my_plan_id` → **trial / lapsed only** (Pro via RevenueCat webhook)
- [x] Recovery: actor + code rate limits, RLS on throttle tables, owner_user_id on codes
- [x] `upsert_life_recovery` membership + JSON object + code length ≤ 32 (restored)
- [x] Recovery throttle by client IP (anon re-sign-in / shared pool gaps)
- [x] Owner-only household bind; claim uses stored permission; leave clears codes; 1y expiry
- [x] Delete account fails if media list fails; orphan recovery cleanup
- [x] Ask / Thing price keeps spoken currency (incl. `$`); edit can clear price
- [x] Money caps + reject negatives (expenses / Thing price / OCR)
- [x] Splash Saavi, onboarding name, reminder time, full names, Life dock, “1 person”
- [x] Welcome restore entry; Android crypto for recovery codes
- [x] Fly chat-api UTC billing + clearer daily-limit copy
- [ ] Confirm purchase → RevenueCat webhook → `admin_set_plan_id` sets Pro
- [ ] TestFlight smoke on a real device (camera, Talk, Apple, Face ID, swipe)

## A. Production Supabase cut-over (`fmcezwyfinzasmgxanxv` — still empty)

Do this yourself (agent must not run production SQL):

1. Confirm the CLI is linked (or pass `--project-ref fmcezwyfinzasmgxanxv`).
2. Apply **every** file under `supabase/migrations/` **in filename order** (timestamp ascending). Prefer `supabase db push` against production after a dry review, or run each file with `supabase db query --project-ref fmcezwyfinzasmgxanxv -f <file>`.
3. Do **not** re-apply an older snapshot of `20261021120000_launch_hardening.sql` — production should get the **current** repo files once, then later `202610220*` / `202610240*` fixups.
4. Verify against staging shape, e.g.:
   - Tables: `households`, `household_members`, `life_recovery` (with `owner_user_id`, `claim_permission`, `expires_at`), `ai_daily_usage`, `recovery_fetch_throttle`, `recovery_actor_throttle`
   - RPCs: `upsert_life_recovery` contains `only an owner can bind`; `claim_household_by_recovery` uses `claim_permission` / `perm`; `set_my_plan_id` rejects paid plans; `consume_ai_turn` uses `billing_day`
   - `select count(*) from public.life_recovery where owner_user_id is null and household_id is null` → `0`
5. Point production EAS env at production Supabase URL + publishable key.
6. Point Fly chat-api + RevenueCat webhook at production Supabase (service role) and secrets.
7. Smoke: Apple sign-in, backup/restore code, Talk cap, delete account.

## B. RevenueCat → plan end-to-end test plan

Paid plans only arrive via the RevenueCat webhook → `admin_set_plan_id` (client `set_my_plan_id` is trial/lapsed only).

1. **Sandbox purchase**
   - TestFlight / sandbox Apple ID buys Pro on a build with the production (or sandbox) RevenueCat iOS key.
   - Confirm RevenueCat dashboard shows the entitlement `pro` for that `app_user_id` (Supabase user uuid).
2. **Webhook**
   - Confirm Fly `/rc/webhook` receives `INITIAL_PURCHASE` / `RENEWAL` (Authorization secret matches).
   - Confirm logs call `admin_set_plan_id` with `pro` for that user.
3. **Plan mirror**
   - In Supabase: `profiles.plan_id` (or equivalent) is `pro`.
   - App: Settings → Plan shows Pro; Talk/Ask Pro limits unlock.
4. **Restore**
   - New device / reinstall → Sign in with Apple (same identity) → RevenueCat restore → still Pro without a second charge.
5. **Expiry / cancel**
   - Cancel in Apple Settings (sandbox) or wait for expiry event.
   - Webhook `EXPIRATION` → `admin_set_plan_id` sets lapsed/trial-ended behavior.
   - App hard-paywalls again; client cannot self-grant Pro via `set_my_plan_id`.

## Notes

- Staging history: `20261021120000_launch_hardening.sql` was edited after it was applied on staging. Harmless for that project; for production, apply the **current** files in order.
- Later fixups live in `202610220*` and `202610240*` migrations.

## Deferred (post-launch OK)

- DeviceCheck / Keychain reinstall (anonymous trial farming)
- Insurance-specific editor
- Weekly habit cadence
- Numeric amount + currency columns for Thing prices (still string `"USD 50"` today)
- Full undo toast actions on Today swipes
