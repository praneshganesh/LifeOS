# Saavi (LifeOS) — Comprehensive Master Task List & Roadmap

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

See also [`docs/SUBSCRIPTIONS_AND_INVITES.md`](./SUBSCRIPTIONS_AND_INVITES.md) for product rules (trial gate, Pro→Family upgrade, invites).

### 2.0 Client entitlement foundation (in progress)
- [x] Entitlement model (`lib/entitlements.ts`) — trial active/expired, Pro, Family, member.
- [x] `PlanGate` + `/paywall` — block app after trial until subscribe.
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
  - Create Subscriptions with 7-Day Introductory Free Trial:
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
- [ ] Install SDK: `npx expo install react-native-purchases`.
- [ ] Initialize RevenueCat on app start with Supabase `user.id`:
  ```ts
  Purchases.configure({ apiKey: Platform.select({ ios: IOS_KEY, android: ANDROID_KEY }), appUserID: user.id });
  ```
- [ ] Update `app/settings/plan.tsx`:
  - Fetch offerings from RevenueCat dynamically (`Purchases.getOfferings()`).
  - Wire subscription purchase buttons (`Purchases.purchasePackage()`).
  - Add working **"Restore Purchases"** button (`Purchases.restorePurchases()`).
  - Display active plan badge (`Trial`, `Pro`, `Family`).
- [ ] Handle App Store Compliance:
  - Add clear Terms of Use (Apple standard EULA) and Privacy Policy links directly on the paywall screen.
  - Display clear pricing terms (e.g., *"7-day free trial, then $4.99/month. Cancel anytime."*).

---

## 🤖 Phase 3: AI Rate Limiting & Chat API Protection

### 3.1 Commercial AI Policy
- **Free Trial**: 5 AI conversations / day (1 conversation = 1 completed Talk turn or Ask message).
- **Subscribed Pro/Family**: Full access with internal fair-use cost guard ceiling (e.g. 150 calls/day).
- **Manual CRUD**: Always unlimited & 100% free forever (Things, Expenses, Habits, Classes, Subscriptions, Last Done).
- **On-Device OCR**: Free & unlimited (runs on-device via ML Kit, zero OpenAI cost).

### 3.2 Client-Side AI Guard
- [ ] Track daily conversation count locally (`lifeos:ai_counter:YYYY-MM-DD`).
- [ ] When a trial user hits 5 calls in a day, present a polite upgrade sheet:
  - *"You've used your 5 free trial AI interactions for today. Upgrade to Pro for unlimited AI, or continue manually."*
  - Quick CTA button navigating to `app/settings/plan.tsx`.

### 3.3 Server-Side Hard Guard (`server/chat.mjs`)
- [ ] Verify incoming `Authorization: Bearer <supabase_jwt>` header cryptographically on Fly.io using Supabase JWT secret.
- [ ] Check user's daily usage count against Supabase `profiles` or a lightweight `user_ai_usage` table.
- [ ] If trial user exceeds 5 calls/day $\rightarrow$ return `HTTP 429 Too Many Requests` with friendly error payload.
- [ ] Increment counter atomically upon successful OpenAI completion.

---

## 📸 Phase 4: Durable Media Storage (Receipts & Documents)

### 4.1 Supabase Storage Setup
- [ ] Create private storage bucket: `media` in Supabase.
- [ ] Add Row Level Security (RLS) policies:
  - `INSERT` / `SELECT` / `DELETE` allowed only if `bucket_id = 'media'` and path starts with `auth.uid() + '/'`.

### 4.2 Background Media Synchronization (`lib/cloud/mediaSync.ts`)
- [ ] Implement non-blocking background uploader:
  - When user snaps a receipt or document, write local cache `file:///...` immediately (0 delay in UI).
  - Queue background upload to `media/{user_id}/{media_id}.jpg`.
  - On upload confirmation, store permanent relative storage path in item record.
  - Download/cache on demand if user restores on a new device.
- [ ] Enforce safety rule: **Never delete a local media file unless its cloud upload has been verified.**

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

- [ ] **Live Real-Time Household Invites** (Supabase Realtime WebSocket replication).
- [ ] **Media Cache Management Settings** (UI button to clear cached images under storage pressure).
- [ ] **Sentry Error Reporting & Telemetry** (integrate after real user traffic justifies it).
- [ ] **Sign in with Apple / Google Identity Linking** (upgrade anonymous `user.id` to social login).
