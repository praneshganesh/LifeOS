# Production launch checklist

Do **not** run production SQL from the agent. Apply migrations yourself on the production Supabase project (`fmcezwyfinzasmgxanxv`) after staging is verified.

## Staging (`sjtkzihmxrxgidflxeqq`)

- [x] UTC Talk billing day (`billing_day`, not ambiguous `day`)
- [x] Client `set_my_plan_id` → **trial / lapsed only** (Pro via RevenueCat webhook)
- [x] Recovery: actor + code rate limits, RLS on throttle tables, owner_user_id on codes
- [x] Delete account clears recovery by household **and** owner_user_id
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

## Deferred (post-launch OK)

- DeviceCheck / Keychain reinstall (anonymous trial farming)
- Insurance-specific editor
- Weekly habit cadence
- Recovery code expiry / TTL
