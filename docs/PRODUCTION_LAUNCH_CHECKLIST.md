# Production launch checklist

Do **not** run production SQL from the agent. Apply migrations yourself on the production Supabase project (`fmcezwyfinzasmgxanxv`) after staging is verified.

## Staging (already the day-to-day target)

- [ ] Apply `supabase/migrations/20261021120000_launch_hardening.sql` on staging (`sjtkzihmxrxgidflxeqq`)
- [ ] Confirm Talk / Ask refuse after the daily limit (UTC day; client `localDate` ignored for billing)
- [ ] Confirm paid plan cannot be wiped client-side while `renews_at` is still in the future
- [ ] Confirm `admin_set_plan_id` no-ops for deleted auth users (RC webhook after delete)
- [ ] Confirm recovery fetch soft rate limit (many bad codes → “try again later”)
- [ ] Redeploy Fly `chat-api` with the UTC billing-day change in `server/chat.mjs`
- [ ] EAS / TestFlight build has `EXPO_PUBLIC_CHAT_API_URL` + Supabase URL/anon key for staging (or prod when cut over)
- [ ] Ask on a physical device: add expense / Thing via chat (not web without tokens)

## Production cut-over

- [ ] Apply **all** migrations to production (empty project today), including trial clock, AI allowance, delete account + storage, launch hardening
- [ ] Point the App Store / production EAS profile at production Supabase URL + anon key
- [ ] RevenueCat production keys + App Store products; webhook → `admin_set_plan_id`
- [ ] Fly chat-api env: production Supabase, OpenAI, proxy token if used
- [ ] Smoke: Sign in with Apple, purchase Pro, restore, Talk cap, delete account, recovery restore
- [ ] Confirm “Reset to trial” is absent outside `__DEV__` (already gated)

## Intentionally deferred

- Insurance-specific editor (policies still use Thing fields)
- Weekly habit cadence
- DeviceCheck / Keychain reinstall gap
