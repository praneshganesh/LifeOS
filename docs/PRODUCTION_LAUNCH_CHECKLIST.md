# Production launch checklist

Do **not** run production SQL from the agent. Apply migrations yourself on the production Supabase project (`fmcezwyfinzasmgxanxv`) after staging is verified.

## Staging (`sjtkzihmxrxgidflxeqq`)

- [x] UTC Talk billing day (`billing_day`, not ambiguous `day`)
- [x] Client `set_my_plan_id` → **trial / lapsed only** (Pro via RevenueCat webhook)
- [x] Recovery: actor + code rate limits, RLS on throttle tables, owner_user_id on codes
- [x] `upsert_life_recovery` membership + JSON object + code length ≤ 32 (restored)
- [x] Recovery throttle by client IP (anon re-sign-in / shared pool gaps)
- [x] Delete account fails if media list fails; backfill recovery `owner_user_id`
- [x] Ask / Thing price keeps spoken currency (no hard-coded AED; edit keeps code)
- [x] Money caps + reject negatives (expenses / Thing price / OCR)
- [x] Splash Saavi, onboarding name, reminder time, full names, Life dock, “1 person”
- [x] Fly chat-api UTC billing + clearer daily-limit copy
- [ ] Confirm purchase → RevenueCat webhook → `admin_set_plan_id` sets Pro
- [ ] TestFlight smoke on a real device (camera, Talk, Apple, Face ID, swipe)

## Production cut-over (`fmcezwyfinzasmgxanxv` — still empty)

Apply **every** file under `supabase/migrations/` in order, then:

- [ ] Point production EAS at production Supabase URL + publishable key
- [ ] RevenueCat production webhook → Fly `/rc/webhook`
- [ ] Fly chat-api production Supabase + OpenAI env
- [ ] Smoke: Apple sign-in, buy Pro, restore, Talk cap, delete account

## Notes

- Staging history: `20261021120000_launch_hardening.sql` was edited after it was applied on staging. Harmless for that project; for production, apply the **current** files in order (do not re-apply the old staging snapshot of that file).
- Later fixups live in `202610220*` migrations (day ambiguity, client plan lock, recovery/delete, ownership/IP limits).

## Deferred (post-launch OK)

- DeviceCheck / Keychain reinstall (anonymous trial farming)
- Insurance-specific editor
- Weekly habit cadence
- Recovery code expiry / TTL
