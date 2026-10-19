# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# Supabase + offline (architecture)

Saavi is **not** a local-only app. Local storage is for **offline capability** (cache / runtime mirror). Durable truth lives in **Supabase**.

- **Auth:** every user has `auth.users` identity. Anonymous is an on-ramp; ship toward Sign in with Apple / linked identity.
- **Postgres + RLS:** households, membership, domain rows, AI usage, recovery. Prefer row-level sync (`docs/SYNC_ARCHITECTURE.md`) over growing `life_stores` JSON blobs.
- **RevenueCat:** subscription source of truth; mirror plan into Supabase for server enforcement.
- **Talk / Ask AI caps:** enforce **server-side** (chat API + Supabase counters) with a Supabase access token. Client counters are UX mirror only, never the sole cost guard.
- **Do not** ship “final” plan/AI/invite limits that live only in AsyncStorage, or treat anonymous backup as a substitute for real auth.
