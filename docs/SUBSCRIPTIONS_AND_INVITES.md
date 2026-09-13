# Subscriptions, trial gate & Family invites

Product rules for Saavi billing and shared logins (v1).

## Plans

| Plan | Logins | Person tags | Notes |
|------|--------|-------------|--------|
| **Trial** | 1 | Unlimited | 14 days from `trialStartedAt`, then paywall |
| **Pro** | 1 | Unlimited | Solo. Invite login → upgrade to Family |
| **Family** | 4 (owner + 3) | Unlimited | Owner pays; invitees ride the plan |
| **Member** | — | — | Joined via invite; no separate subscription |

- **Person** = tag (child, pet, “Ishaan”) — never a seat.
- **Member** = app login that syncs — consumes a Family seat.
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

Billing provider: **RevenueCat** (not wired yet). Current UI unlocks plan **on-device only** (no charge). Product IDs (planned):

- `saavi_pro_monthly` / `saavi_pro_yearly`
- `saavi_family_yearly` (+ monthly later)

## Family invite (mobile)

### Owner on Pro / Trial
**Invite to Family** → sheet: upgrade to Family (stub subscribe) → then create + share invite.

### Owner on Family (seats left)
1. Settings → Sharing → **Invite to Family**
2. Creates code (cloud RPC when household id exists, else local)
3. System share sheet with deep link `…/invite/<code>` + plaintext code

### Invitee (iOS / Android)
1. Opens link → `/invite/[code]` (or enters code on `/invite`)
2. Accept → `joinAsMember` (one household on this login)
3. Onboarding if needed → home
4. They are **not** charged; they ride the owner’s Family plan

### Seats full
Block invite; message to free a seat / add-on (add-ons later).

## Code map

| Piece | Path |
|-------|------|
| Entitlements | `lib/entitlements.ts` |
| Plan context | `lib/PlanContext.tsx` |
| Gate | `components/PlanGate.tsx` |
| Paywall | `app/paywall.tsx` |
| Invite API | `lib/invites/api.ts` |
| Membership / seats | `lib/invites/membership.ts` |
| Sharing UI | `app/settings/sharing.tsx` |
| Accept UI | `app/invite/*` |
| DB RPCs | `create_household_invite` / `accept_household_invite` |

## Not in v1

- RevenueCat purchase / restore
- Universal Links host (`saavi.app`) + deferred deep link polish
- Extra seat SKUs
- Multiple households per login
- Enforcing ACL from sharing roles in sync
