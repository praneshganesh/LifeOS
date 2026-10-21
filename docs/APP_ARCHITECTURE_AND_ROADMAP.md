# Saavi (LifeOS): Architecture & roadmap

Master blueprint for how Saavi works today (TestFlight / staging) and what remains before a public launch.

For a **product / features overview**, see [`SAAVI_FEATURES.md`](./SAAVI_FEATURES.md).

Deeper specs: [`SYNC_ARCHITECTURE.md`](./SYNC_ARCHITECTURE.md), [`SUBSCRIPTIONS_AND_INVITES.md`](./SUBSCRIPTIONS_AND_INVITES.md), [`FAMILY.md`](./FAMILY.md), [`AUTH_APPLE.md`](./AUTH_APPLE.md), [`CHAT.md`](./CHAT.md).

---

## 1. Product shape

Saavi is a **household home OS**: Things, people, spaces, expenses, subscriptions, habits, classes, reminders (Last Done), documents, and capture — plus **Talk** (voice) and **Ask** (chat).

It is **not** a local-only app. The phone keeps a **local cache** so core CRUD works offline. **Durable truth** lives in **Supabase** (Auth + Postgres + RLS + Storage). **RevenueCat** is the subscription entitlement source of truth; plan is mirrored into Supabase for server enforcement (Talk caps).

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (Expo 57 / React Native)              │
│  UI + contexts → AsyncStorage mirror + sync outbox              │
│  Talk / Ask → chat agent (structured actions → applyActions)  │
└───────────────┬─────────────────────────────┬───────────────────┘
                │ row sync / media            │ HTTPS + Supabase JWT
                ▼                             ▼
┌───────────────────────────┐   ┌─────────────────────────────────┐
│ Supabase                  │   │ Chat API (Fly.io, server/)      │
│ · auth.users (anon→Apple) │   │ · verify JWT                    │
│ · households + domain rows│   │ · get_ai_allowance / consume    │
│ · profiles (plan, trial)  │   │ · OpenAI + Identify             │
│ · media bucket            │   │ · RevenueCat webhook            │
└───────────────────────────┘   └─────────────────────────────────┘
```

### Core tenets

1. **UI never waits on the network for a local save.** Writes hit local state + outbox; sync drains when online.
2. **AI never mutates state directly.** The model returns structured actions; `lib/chat/applyActions.ts` validates and applies them.
3. **Offline:** Things, expenses, habits, classes, reminders, household, on-device OCR work without network. Talk AI, Identify, cloud sync, and media upload need connectivity + an auth session.
4. **Talk cost is enforced on the server**, keyed by authenticated user. Client counters are UX only.

---

## 2. Commercial model (launch)

**Pro only.** Family seats / invites are deferred ([`FAMILY.md`](./FAMILY.md)).

| | Trial | Pro | After lapse |
| --- | --- | --- | --- |
| Length | **7 days**, no card (in-app clock) | Apple subscription (monthly / yearly) | Until resubscribe |
| App access | Full | Full | **Hard paywall** (`PlanGate` → `/paywall`) |
| Talk / Ask / Identify | **25 / day** | **100 / day** | **0** |
| Things & home CRUD | Unlimited during trial | Unlimited | Blocked until Pro |

### Important corrections vs older drafts

- Trial is **not** an Apple introductory offer. App Store products have **no** intro free trial so we don’t stack 14 free days. Revisit only if conversion is weak.
- Trial clock is **server-side**: `profiles.trial_started_at` + `trial_ended_for()` (see migration `20261019090000_trial_server_clock.sql`). Client prefs are a mirror.
- After trial, the app **does not** stay free for “unlimited stuff without Talk.” Launch is a full paywall until Pro.
- Cancel is in **Apple Settings → Subscriptions**. Cancel stops the **next** renewal; it does not refund the period already paid.

### Billing flow

```
Paywall / Settings → Plan
  → RevenueCat (react-native-purchases)
  → Apple StoreKit (TestFlight = sandbox)
  → CustomerInfo entitlement `pro`
  → client optimistic mirror + RevenueCat webhook → profiles.plan_id
```

Restore purchases rebinds StoreKit entitlements to the current Supabase user. Sign in with Apple links anonymous → durable identity ([`AUTH_APPLE.md`](./AUTH_APPLE.md)).

---

## 3. Talk / Ask / Identify

| Surface | What counts as a turn |
| --- | --- |
| Talk overlay | One spoken utterance → actions → reply |
| Ask tab | One user message + assistant reply |
| Identify (Capture) | One cloud identify = one AI turn |

Daily limits: `get_ai_allowance` / `consume_ai_turn` in Supabase, called from `server/chat.mjs` with the user’s access token. On-device OCR is free and unlimited.

---

## 4. Data & sync

Row-level sync for household modules (not a growing JSON blob per module). See [`SYNC_ARCHITECTURE.md`](./SYNC_ARCHITECTURE.md).

| Layer | Role |
| --- | --- |
| AsyncStorage | Offline mirror + outbox (SQLite later if needed) |
| Postgres + RLS | Durable shared state by `household_id` |
| `life_stores` | Prefs / legacy only; domain rows are tables |
| Storage `media` | `{household_id}/{uuid}.ext`; local URI never synced |

Account delete: client removes media via Storage API, then `delete_my_account` RPC (SQL cannot `DELETE` storage rows directly).

---

## 5. Capture

1. Photo / library / file → local durable URI.
2. Optional on-device OCR → fill name / receipt / document fields.
3. Optional **Identify with AI** (cloud) when it’s a product photo.
4. Review is intentionally light: name + brand up front; price / serial / store behind “more.”

---

## 6. Roadmap status

### Done (in product / staging)

- [x] Domain modules + Today attention
- [x] Talk / Ask agent + `applyActions`
- [x] Row sync + media bucket
- [x] Anonymous auth → Sign in with Apple
- [x] RevenueCat Pro + restore + webhook plan mirror
- [x] Server Talk caps (25 / 100 / 0) + JWT on chat API
- [x] In-app 7-day trial + server trial clock
- [x] Hard paywall after trial / lapse
- [x] Capture + Identify; swipe delete; unified add; Settings slimmed for launch

### Still open for public launch

- [ ] Production Supabase: apply trial / delete-account migrations (owner applies; do not auto-run from agent)
- [ ] Public Privacy / Terms URLs if App Review requires hosted pages
- [ ] Store listing, screenshots, App Review notes
- [ ] Android Play + `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` when launching Android
- [ ] Optional: server push (APNs / FCM) — see [`PUSH_NOTIFICATIONS_PLAN.md`](./PUSH_NOTIFICATIONS_PLAN.md)

### Deferred (Phase 6+)

- [ ] Family plan + invites when sharing model is solid
- [ ] Apple intro-offer trial **only if** no-card conversion is weak
- [ ] Keychain + DeviceCheck to close reinstall trial abuse
- [ ] Offline clock rollback / forced check-in for long offline trials

Checklist detail: [`MASTER_TASK_LIST.md`](./MASTER_TASK_LIST.md).

---

## 7. Environments

| | Staging (TestFlight testing) | Production |
| --- | --- | --- |
| Supabase | `sjtkzihmxrxgidflxeqq` | `fmcezwyfinzasmgxanxv` |
| Chat API | Fly app for staging | Production Fly app |
| Billing | RevenueCat sandbox / TestFlight | Live App Store |

Do not apply experimental SQL to production without an explicit go-ahead.
