# Saavi (LifeOS): Comprehensive Master Task List & Roadmap

This master checklist breaks down every single task required across **TestFlight Beta**, **App Store / Google Play Production Readiness**, and **Post-Launch Maintenance**, specifically tailored to the verified codebase.

---

## 📋 Phase 1: TestFlight Beta Distribution & Real-Device Validation (CURRENT)

### 1.1 Device Builds & Delivery
- [x] **Core Test Suite Clean**: `185/185` tests passing across client and server.
- [x] **TypeScript & Bundle Verification**: `npx tsc --noEmit` and `npx expo export` clean.
- [ ] **Android Preview APK**: Complete EAS Build (`preview` profile) and verify sideloading / Play Protect prompt behavior.
- [ ] **iOS TestFlight Build**: Trigger `eas build --platform ios --profile preview` and distribute to internal testers via App Store Connect.

### 1.2 Real-Device Smoke Test Checklist
- [ ] **Talk & Speech Recognition**:
  - Test on real iPhone (iOS speech engine) and real Android device (Google Speech engine).
  - Verify mic permission prompt and seamless speech-to-text transcription.
  - Verify frosted pill feedback styling and quick response times.
- [ ] **Camera, Gallery & OCR**:
  - Test real receipt capture on iPhone camera and Android camera.
  - Verify OCR extraction of price, merchant, and dates with zero lag.
- [ ] **Class Notifications & Scheduling**:
  - Verify notifications fire at **Friday 6:00 PM** (evening-before) and **Saturday 8:00 AM** (morning-of).
  - Test inferred 9:00 AM class time notification vs. user-edited explicit time.
  - Test notification cancellation when a class pack is deleted.
- [ ] **Security & Biometrics**:
  - Verify Face ID / Passcode unlock and background blur gate (`AppLockGate`) on real iOS devices.
  - Verify Android fingerprint / screen lock fallback.
- [ ] **Cloud Backup & Recovery Rebind**:
  - Perform real test: create data on Device A $\rightarrow$ Trigger Cloud Sync $\rightarrow$ Get 16-char code $\rightarrow$ Install fresh app on Device B $\rightarrow$ Enter code $\rightarrow$ Confirm all data restored.
- [x] **Navigation & Go Back Buttons Across All Screens**:
  - Unified in-screen back navigation across all module list/detail screens (`ModuleScreen`, `app/space/[id]`, `app/room/[id]`, `app/last-done/index`, `app/last-done/[id]`).
  - Context-aware back labels (`‹ Today`, `‹ Spaces`, `‹ Expenses`, `‹ Habits`, `‹ Household`, `‹ Settings`).
  - Guaranteed fallback navigation so users are never trapped when opening screens via Talk, Ask, Capture replace, notifications, or deep links.
  - Cleaned up root & nested `Stack` headers to prevent double-header gaps or missing buttons on Android/iOS.

---

## 💳 Phase 2: Payments & Subscriptions (RevenueCat & Stores)

See also [`docs/SUBSCRIPTIONS_AND_INVITES.md`](./SUBSCRIPTIONS_AND_INVITES.md) for product rules (trial gate, Pro→Family upgrade, invites) and [`docs/FAMILY_SHARING.md`](./FAMILY_SHARING.md) for the Family gaps and scenarios.

### 2.0 Client entitlement foundation (in progress)
- [x] Entitlement model (`lib/entitlements.ts`): trial active/expired, Pro, Family, member.
- [x] `PlanGate` + `/paywall`: block app after trial until subscribe.
- [x] Post-subscribe → onboarding if needed, else home.
- [x] Sharing: Invite gated (Pro→Family upgrade) + join-with-code.
- [x] RevenueCat dashboard: products, entitlements `pro`/`family`, offering `default`.
- [x] Client: `react-native-purchases` + paywall/restore wired (`lib/billing/revenueCat.ts`).
- [ ] Test purchase on TestFlight / sandbox Apple ID.
- [ ] Universal Links for `https://saavi.app/invite/...`.
- [ ] Android Play product + `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY`.

### 2.1 Store Dashboards Configuration
- [ ] **App Store Connect**:
  - Sign Paid Applications Agreement in Agreements, Tax, and Banking.
  - Create In-App Purchase / Subscription Group: `Saavi Subscriptions`.
  - Create Subscriptions **without** an introductory free trial. Launch uses the in-app, no-card 7-day trial (server clock on `profiles.trial_started_at`). An Apple intro offer on top would give 14 free days and mismatch the paywall copy. Revisit only if trial conversion is weak (Phase 6).
    - `saavi_pro_monthly` (e.g. $4.99 / mo)
    - `saavi_pro_yearly` (e.g. $39.99 / yr)
    - `saavi_family_yearly` (e.g. $69.99 / yr)
  - Generate App Store Connect Shared Secret / StoreKit API Key for RevenueCat.
- [ ] **Google Play Console**:
  - Set up Google Payments Merchant Account.
  - Create subscriptions with 7-day base plan trial in Play Console:
    - `saavi_pro_monthly`
    - `saavi_pro_yearly`
    - `saavi_family_yearly`
  - Link Google Cloud Service Account credentials to RevenueCat.

### 2.2 Client-Side RevenueCat Integration
- [x] Install SDK: `react-native-purchases` (`lib/billing/revenueCat.ts`).
- [x] Initialize RevenueCat on app start with Supabase `user.id` (`configureRevenueCat(uid)` from `PlanContext` and after Apple sign-in).
- [x] `app/settings/plan.tsx`: live offerings, Monthly / Yearly, purchase, Restore, active plan badge.
- [x] Server-side plan mirror: RevenueCat webhook `POST /rc/webhook` on the chat API writes `profiles.plan_id` via `admin_set_plan_id` (service role). The client `set_my_plan_id` call remains as an optimistic mirror only. See `server/revenuecat.mjs`, `.env.example`.
- [ ] Handle App Store Compliance:
  - Add clear Terms of Use (Apple standard EULA) and Privacy Policy links directly on the paywall screen.
  - Display clear pricing terms (e.g., *"7-day free trial, then $4.99/month. Cancel anytime."*).

---

## 🤖 Phase 3: AI Rate Limiting & Chat API Protection (DONE)

### 3.1 Commercial AI Policy
- **Free Trial**: 25 AI turns / day (1 turn = 1 completed Talk turn, Ask message, or photo Identify).
- **Pro**: 100 AI turns / day per user.
- **Family**: not sold at launch. A leftover `family` row uses the Pro cap (100). The old shared pool was 80.
- **Manual CRUD**: Always unlimited & free (Things, Expenses, Habits, Classes, Subscriptions, Last Done).
- **On-Device OCR**: Free & unlimited (ML Kit, zero OpenAI cost). Capture "AI off" skips OCR and cloud entirely.

### 3.2 Client-Side AI Guard (UX mirror only)
- [x] `lib/aiUsage.ts` mirrors the server counter for the meter + upgrade sheet; never the sole guard.
- [x] Limit-reached sheet with CTA to `app/settings/plan.tsx`.

### 3.3 Server-Side Hard Guard (`server/chat.mjs`)
- [x] `Authorization: Bearer <supabase_jwt>` verified locally against the project JWKS (ES256 / RS256, exp / iss / aud checks) with fallback to `/auth/v1/user` for HS256 projects or key-rotation races (`server/aiAuth.mjs`).
- [x] `consume_ai_turn(p_day)` RPC (migration `20260919120000_ai_daily_usage.sql`) reads `profiles.plan_id`, increments `ai_daily_usage` atomically, returns `{ ok, used, limit }`.
- [x] Over-cap → `HTTP 429` with friendly payload before OpenAI is called (both `/chat` and `/identify`).

---

## 📸 Phase 4: Durable Media Storage (Receipts & Documents) (DONE)

### 4.1 Supabase Storage Setup
- [x] Private bucket `media` (15 MB, image/* + PDF) created by migration `20260928090000_row_sync_all_modules.sql`.
- [x] RLS on `storage.objects`: path is `{household_id}/{uuid}.ext`; select for household members, insert / update / delete for editors (`public._media_household(name)`).

### 4.2 Background Media Synchronization (`lib/media/mediaSync.ts`)
- [x] Capture writes the local `file://` immediately (zero UI delay); the sync engine uploads in the background and stores `imagePath` (things) / `receiptPath` (expenses) on the row.
- [x] New device: rows arrive with `imagePath` / `receiptPath` and the engine downloads via signed URL into the app cache, then repoints the local URI.
- [x] Budgeted (4 transfers per sync run) with per-file attempt backoff.
- [x] Safety rule enforced: local media files are never deleted by sync.
- [ ] Media Cache Management UI (clear cached downloads): deferred to Phase 6.

---

## 🚀 Phase 5: App Store & Google Play Submission

### 5.1 Legal & Store Compliance
- [ ] Host public **Privacy Policy** URL (e.g., `https://saavi.app/privacy`).
- [ ] Host public **Terms of Service / EULA** URL (e.g., `https://saavi.app/terms`).
- [ ] Configure App Store Privacy Nutrition Labels:
  - Data Used to Track You: **None**.
  - Data Linked to You: **User ID** (for cloud backup & subscription status).
  - Data Not Linked to You: **Diagnostics / Crash info** (optional).

### 5.2 Store Assets & Metadata
- [ ] App Store Screenshots: 6.7" iPhone (16 Pro Max / 15 Pro Max) and 6.5" iPhone (14 Plus / 11 Pro Max).
- [ ] Google Play Screenshots: Phone & 7" / 10" Tablet formats.
- [ ] App Descriptions, Keywords, Support URL, and Marketing Subtitle.
- [ ] App Review Test Account Notes (provide test account/instructions for reviewing Talk & Trial).

---

## 🔮 Phase 6: Post-Launch & Deferred Items (Not Blocking Launch)

- [ ] **Watch trial conversion** in RevenueCat. If weak, switch to an Apple intro-offer trial (card on file, one per Apple ID): App Store Connect offer, paywall price/renewal copy, "trial ends tomorrow" reminder, drop the in-app trial.
- [ ] **Reinstall trial reset** (accepted gap at launch): keep the anonymous session in the Keychain so a reinstall returns to the same account; DeviceCheck "trial used" bit so a wiped phone doesn't get a new trial.
- [ ] **Offline trial tampering**: ignore device clock rollbacks (remember the latest time seen) and require a server check-in every 7 days for trial and paid plans.

- [ ] **Live Real-Time Household Invites** (Supabase Realtime WebSocket replication).
- [ ] **Media Cache Management Settings** (UI button to clear cached images under storage pressure).
- [ ] **Sentry Error Reporting & Telemetry** (integrate after real user traffic justifies it).
- [ ] **Sign in with Apple / Google Identity Linking** (upgrade anonymous `user.id` to social login).
