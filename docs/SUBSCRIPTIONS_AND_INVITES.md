# Subscriptions, trial gate & Family invites

> Launch note: the app sells Pro only. Family invites are closed. See [`FAMILY.md`](./FAMILY.md).

Product rules for Saavi billing and shared logins (v1).

## Plans

| Plan | Logins | Person tags | Notes |
|------|--------|-------------|--------|
| **Trial** | 1 | Unlimited | `TRIAL_DAYS` (default 7, override `EXPO_PUBLIC_TRIAL_DAYS`) from `trialStartedAt`, then paywall |
| **Pro** | 1 | Unlimited | Solo. Invite login → upgrade to Family |
| **Family** | 4 (owner + 3) | Unlimited | Owner pays; invitees ride the plan |
| **Member** | n/a | n/a | Joined via invite; no separate subscription |

- **Person** = tag (child, pet, “Ishaan”): never a seat.
- **Member** = app login that syncs: consumes a Family seat.
- **One active household per login** (v1).

## Trial → paywall

1. `PlanGate` watches `computeEntitlement()`.
2. When `hasAccess === false` (trial expired, not Pro/Family/member), app routes to `/paywall`.
3. Allowed while locked: `/paywall`, `/settings/plan`, `/onboarding`, `/invite/*`.
4. After subscribe:
   - If onboarding incomplete → `/onboarding`
   - Else → home tabs

Dev: Settings → Plan → **Expire trial now** / **Restart trial**.

## Subscribe flows

```
Fresh install → onboarding (during trial)
Trial ends → paywall → Pro or Family → home (or finish onboarding)

Direct subscribe (future store) → paywall/plan → onboarding if needed → home
```

Billing: **our paywall UI → RevenueCat → Apple StoreKit** (real Apple ID charge / Sandbox on TestFlight).

Product IDs:

- `saavi_pro_monthly` / `saavi_pro_yearly`
- `saavi_family_monthly` / `saavi_family_yearly`

### Why TestFlight shows no prices / no payment sheet

1. **Web / localhost never bills.** Expo web cannot load StoreKit. Screenshots with `localhost` in Safari are not TestFlight.
2. **EAS builds must bake** `EXPO_PUBLIC_REVENUECAT_IOS_KEY` (EAS secret / env for the profile). Local `.env` does not ship to TestFlight.
3. **App Store Connect** needs those subscription products (Ready to Submit / approved) + Paid Applications agreement.
4. **RevenueCat** current offering must include packages whose identifiers match `pickOffer` (`$rc_annual` / `annual` / `yearly`, `family_annual`, etc.) and map to the App Store product IDs.
5. **Sandbox:** TestFlight uses Sandbox Apple ID, tap Continue → Apple’s sheet (not a fake in-app charge).

Until (2)–(4) are done, `billingReady` is false or offers are empty → paywall shows “not connected” / “Unavailable”, not store prices.

## Family invite (mobile)

The steps below are the intended button flow. What the code does today, and the scenarios Family has to pass, are in [`FAMILY_SHARING.md`](./FAMILY_SHARING.md).

### Owner on Pro / Trial
**Invite to Family** → sheet: upgrade to Family (stub subscribe) → then create + share invite.

### Owner on Family (seats left)
1. Settings → Sharing → **Invite to Family**
2. Creates code (cloud RPC when household id exists, else local)
3. System share sheet with deep link `…/invite/<code>` + plaintext code

### Invitee (iOS / Android)
1. Opens link → `/invite/[code]` (or enters code on `/invite`)
2. App ensures a Supabase session (`ensureCloudSession`): required for a seat
3. Accept → `joinAsMember` (one household on this login)
4. Soft nudge **Save with Apple** so the seat survives reinstall (Settings → Account later)
5. Onboarding if needed → home
6. They are **not** charged; they ride the owner’s Family plan

See also [`AUTH_APPLE.md`](./AUTH_APPLE.md) for ASC + Supabase Apple provider setup.

### Seats full
Block invite; message to free a seat / add-on (add-ons later).

## Code map

| Piece | Path |
|-------|------|
| Entitlements | `lib/entitlements.ts` |
| Plan context | `lib/PlanContext.tsx` |
| Gate | `components/PlanGate.tsx` |
| Sign in with Apple | `lib/auth/apple.ts`, `app/settings/account.tsx`, `docs/AUTH_APPLE.md` |
| Save-with-Apple nudge | `lib/auth/appleNudge.ts` (paywall, plan, invite) |
| Paywall | `app/paywall.tsx` |
| Invite API | `lib/invites/api.ts` |
| Membership / seats | `lib/invites/membership.ts` |
| Sharing UI | `app/settings/sharing.tsx` |
| Accept UI | `app/invite/*` |
| DB RPCs | `create_household_invite` / `accept_household_invite` |

## Not in v1

- Universal Links host (`saavi.app`) + deferred deep link polish
- Extra seat SKUs
- Multiple households per login
- Enforcing ACL from sharing roles in sync
