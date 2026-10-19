# Sign in with Apple (identity continuity)

Saavi keeps an **anonymous** Supabase session on first launch so people can try
the product without an account wall. **Sign in with Apple** links that session
(or reclaims it on a new device) so subscription, household seats, and synced
data survive reinstalls.

## App code

| Piece | Path |
|-------|------|
| Apple → Supabase | `lib/auth/apple.ts` |
| Soft “Save with Apple” nudge | `lib/auth/appleNudge.ts` |
| Settings UI | `app/settings/account.tsx` |
| Paywall nudge | `app/paywall.tsx` |
| Invite session + nudge | `app/invite/[code].tsx` |
| Session + pull after link | `lib/cloud/sync.ts` (`ensureCloudSession`, `pullCloudAfterSignIn`) |

Expo: `ios.usesAppleSignIn` + `expo-apple-authentication` plugin in `app.json`.

## App Store Connect

1. Apple Developer → **Identifiers** → App ID `com.praneshganesh.lifeos`
2. Enable **Sign In with Apple** capability → Save
3. If using a Services ID for web later, register it and return URLs; native
   iOS uses the app’s bundle ID as the client
4. Rebuild with EAS / Xcode so the entitlement is in the binary (capability is
   not enough in Expo Go alone: use a dev client or TestFlight)

## Supabase Dashboard

1. **Authentication → Providers → Apple** → Enable
2. **Client IDs**: iOS bundle ID `com.praneshganesh.lifeos` (and Services ID if web)
3. For native IdToken flow (`signInWithIdToken` / `linkIdentity` with token),
   you typically need the Apple provider enabled; Secret Key / Team ID / Key ID
   are required when using OAuth code flow, follow current Supabase Apple docs
   for your project
4. **Authentication → Providers → Anonymous** → Enable (on-ramp stays)
5. **Authentication → Settings** (or Providers): turn on **Manual linking** so
   `linkIdentity` can attach Apple to the current anonymous user

Without Manual linking, Apple sign-in creates a *different* user and breaks
continuity with the anonymous `user.id` used as RevenueCat `appUserID`.

## New device flow

1. Install Saavi → anonymous session (new id)
2. **Settings → Account → Sign in with Apple** (or paywall / invite nudge)
3. `signInWithIdToken` reclaims the Apple-linked user
4. `pullCloudAfterSignIn` + `Purchases.logIn(user.id)` → data + entitlement +
   household membership line up

## Family invitees

Accept invite requires a session (`ensureCloudSession`). After join, nudge
**Save with Apple** so the seat is reclaimable after reinstall.

## Privacy labels

- Collect **User ID** for App Functionality (sync / seats)
- Hide My Email / private relay is fine, do not also force a personal email
- Name from Apple is optional metadata only when the user provides it once
