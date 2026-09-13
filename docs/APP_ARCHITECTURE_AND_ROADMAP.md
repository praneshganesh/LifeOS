# Saavi (LifeOS) — Architecture, Authentication, Payments & Production Roadmap

Master architectural blueprint, data flow definitions, and pending implementation task list for Saavi's TestFlight beta and public App Store / Play Store production launch.

---

## 1. System Architecture: Local-First with Background Cloud Sync

Saavi is engineered as an **Offline-First, Local-First Application** with background cloud synchronization.

```
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT APPLICATION (Expo / React Native)                          │
│                                                                                             │
│   ┌───────────────────────────┐                 ┌───────────────────────────────────────┐   │
│   │        User Action        │                 │          Talk / Ask / Voice           │   │
│   │  (Add/Edit/Delete/Toggle) │                 │          Conversational Turn          │   │
│   └─────────────┬─────────────┘                 └───────────────────┬───────────────────┘   │
│                 │                                                   │                       │
│                 │ (Immediate in-memory state update)                │ (Local memory context)│
│                 ▼                                                   ▼                       │
│   ┌───────────────────────────┐                 ┌───────────────────────────────────────┐   │
│   │    Local State & Storage  │◄────────────────┤   Deterministic Actions Execution     │   │
│   │ (AsyncStorage / Key-Value)│ (applyActions)  │       (lib/chat/applyActions.ts)      │   │
│   └─────────────┬─────────────┘                 └───────────────────▲───────────────────┘   │
│                 │                                                   │                       │
│                 │                                                   │ (Structured Actions)  │
│                 │ (Background Snapshot)                             │                       │
│                 ▼                               ┌───────────────────┴───────────────────┐   │
│   ┌───────────────────────────┐                 │  Client Proxy Request (JWT Auth)      │   │
│   │ Background Sync Manager   │                 │       (lib/chat/agent.ts)             │   │
│   │   (lib/cloud/sync.ts)     │                 └───────────────────┬───────────────────┘   │
│   └─────────────┬─────────────┘                                     │                       │
└─────────────────┼───────────────────────────────────────────────────┼───────────────────────┘
                  │                                                   │ (HTTPS + Supabase JWT)
                  │ (RPC Snapshot)                                    ▼
                  │                               ┌───────────────────────────────────────────┐
                  │                               │         Chat API Server (Fly.io)          │
                  │                               │        (`server/chat.mjs`)                │
                  │                               ├───────────────────────────────────────────┤
                  │                               │ • JWT Auth & Product Usage Counter Guard  │
                  │                               │ • Request Abuse Rate Limiting             │
                  │                               │ • Action Repair & Validation              │
                  │                               └───────────────────┬───────────────────────┘
                  │                                                   │                       │
                  │                                                   │ (JSON completions)    │
                  │                                                   ▼                       │
                  ▼                               ┌───────────────────────────────────────────┐
┌─────────────────────────────────────────────┐   │            OpenAI Chat Model              │
│          BACKEND CLOUD (Supabase)           │   │    (Structured Action Interpretation)     │
├─────────────────────────────────────────────┤   └───────────────────────────────────────────┘
│ • Anonymous Auth & Identity Linking         │
│ • `life_stores` Encrypted Snapshots         │
│ • `life_recovery` Hash Table                │
│ • Private Media Storage Bucket              │
└─────────────────────────────────────────────┘
```

### Core Tenets:
1. **Immediate Local Interaction**: Domain actions update local application state immediately and persist locally without waiting for network operations.
2. **Deterministic Action Interpretation**: The AI model does not touch app state directly. It interprets intent into structured actions that the client's `applyActions` engine validates, repairs, and applies deterministically.
3. **Realistic Offline Availability**: Core domain functionality (Things, Expenses, Habits, Classes, Subscriptions, Last Done, Household, local OCR) remains fully available offline. Cloud backup, media sync, and AI conversational features require connectivity.

---

## 2. Decision Matrix & Specific Product Rules

### Decision 1: Trial & Commercial Model (Store Subscription Trial)
* **Model**: **Apple / Google Store Subscription 7-Day Free Trial**.
* **Flow**: User starts a subscription via Apple StoreKit / Google Play Billing with an introductory 7-day free trial.
* **Authority**: **RevenueCat** is the sole source of truth for trial period, billing, and active subscription state.
* **Free Trial AI Allowance**: **5 AI conversations / day** during the 7-day trial.
* **Post-Trial / Paid Pro Allowance**: Generous internal fair-use ceiling (e.g. 150 requests/day cost guard) without presenting paying users with stressful artificial counters.
* **Manual Feature Guarantee**: Manual CRUD (adding/editing Things, Expenses, Habits, Classes, Subscriptions, Last Done) remains **100% free and unlimited forever**, even if a trial expires or a subscription lapses.

### Decision 2: Clarifying Single Turn vs. Multi-Message Conversations
* **Talk / Voice Overlay**: 1 conversation = 1 spoken turn (Utterance $\rightarrow$ Actions applied $\rightarrow$ Spoken reply).
* **Ask Screen (Text Chat)**: 1 conversation = 1 user prompt + assistant response turn.
* **Daily Counter**: Each completed request to the Chat API increments the daily usage counter for that user.

### Decision 3: Identity & Recovery Rebinding Flow
When a user installs Saavi on a new device or reinstalls:
1. Supabase automatically provisions a new anonymous identity (`uid_B`).
2. The user enters their 16-character recovery code in Settings.
3. Saavi retrieves the encrypted cloud snapshot belonging to the code.
4. Saavi restores local stores and **re-pushes the snapshot under `uid_B`** (`lib/cloud/sync.ts`).
5. User taps **"Restore Purchases"** on the Plan screen $\rightarrow$ RevenueCat syncs Apple/Google receipt entitlements to `uid_B`.
6. This avoids complex session migration infrastructure while keeping recovery 100% reliable.

---

## 3. Media & Receipt Image Architecture

```
[Camera / Document Picker]
           │
           ▼
1. Save locally to app cache (`file:///...`)
           │
           ├──► Display immediately in UI (0ms delay)
           │
           ▼ (Non-blocking Background Upload)
2. Upload to Private Supabase Storage (`receipts/{userId}/{mediaId}.jpg`)
           │
           ├──► On Confirmation: Store durable path: `receipts/{userId}/{mediaId}.jpg`
           │
           └──► Local file becomes disposable cache (can be evicted under storage pressure)
```

### Critical Media Rules:
1. **Never Delete Unsynced Media**: A local image is never removed from the device cache unless its upload to Supabase Storage has been positively confirmed.
2. **Durable Paths, Not Expiring URLs**: Store permanent relative paths (`receipts/{userId}/{mediaId}.jpg`), never transient pre-signed URLs that expire.
3. **On-Device OCR Is Unlimited**: OCR processing (ML Kit / Tesseract) runs completely on-device with zero OpenAI cost and is never counted against the AI interaction allowance.

---

## 4. Cross-Platform Payments (RevenueCat)

```
┌─────────────────────────────────────────────────────────────┐
│                 Client App (app/settings/plan.tsx)          │
│                 Calls: `Purchases.purchasePackage()`        │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│            RevenueCat (`react-native-purchases`)            │
├──────────────────────────────┬──────────────────────────────┤
│ iOS (StoreKit 2)             │ Android (Google Play Billing)│
│ `saavi_pro_monthly`          │ `saavi_pro_monthly`          │
│ `saavi_pro_yearly`           │ `saavi_pro_yearly`           │
│ `saavi_family_yearly`        │ `saavi_family_yearly`        │
└──────────────────────────────┴──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             RevenueCat CustomerInfo (Source of Truth)       │
│                  Entitlement: `pro` / `family`              │
└─────────────────────────────────────────────────────────────┘
```

* **No Webhooks Needed for Phase 1**: Client inspects `customerInfo.entitlements.active['pro']` directly. No complex webhook middleware or Supabase database mirroring required for launch.
* **Mandatory Store Compliance**:
  - Clear disclosure of 7-day trial terms and renewal pricing.
  - Functional "Restore Purchases" button on `app/settings/plan.tsx`.
  - Privacy Policy and Terms of Use (EULA) links accessible on the plan and about screens.

---

## 5. AI Server Enforcement & Rate Limiting (`server/chat.mjs`)

To protect OpenAI API costs from direct script tampering without adding Redis:

```
[Client Chat Agent Request]
           │
           ├──► Header: `Authorization: Bearer <supabase_jwt>`
           ▼
┌─────────────────────────────────────────────────────────────┐
│                  Fly.io Chat API Server                     │
├─────────────────────────────────────────────────────────────┤
│ 1. Verify Supabase JWT cryptographically (extract `user_id`)│
│ 2. Check Daily AI Allowance in Supabase `profiles` / counter│
│    • Free Trial User: max 5 requests / day                  │
│    • Paid Pro User: fair-use guard ceiling                  │
│ 3. If count >= limit:                                       │
│    └── Return HTTP 429: "Daily AI allowance reached (5/5)"  │
│ 4. If within limit:                                         │
│    └── Execute OpenAI completion, increment count, return   │
└─────────────────────────────────────────────────────────────┘
```

* **Existing Abuse Protection**: Keep existing IP rate limiter, request-size limits (100KB), and timeout guards (14s) intact.

---

## 6. Master Production Roadmap & Action Item Checklist

### Phase 1: TestFlight Beta Validation (Current)
- [x] **Core Domains**: All 8 domain engines hardened, tested, and verified (`185/185` tests passing).
- [x] **Talk & Chat API**: Action verification, date normalization, class schedule inference, and feedback styling complete.
- [x] **On-Device Storage & Local Snapshots**: Versioned storage and 16-character recovery codes functional.
- [x] **Typecheck & Bundle Export**: `npx tsc --noEmit` and `npx expo export` clean.
- [ ] **TestFlight Real-Device Validation**:
  - Class notification timings (Friday 6 PM eve, Saturday 8 AM morning-of).
  - Voice recognition latency and microphone permissions across iOS & Android.
  - Biometric Face ID / App lock lifecycle behavior.
  - End-to-end recovery code test (Installation A $\rightarrow$ Backup $\rightarrow$ Installation B $\rightarrow$ Restore).

### Phase 2: App Store & Play Store Production Launch (Next Milestone)
- [ ] **Task 2.1 — RevenueCat Integration (`react-native-purchases`)**:
  - Install and initialize RevenueCat with `user.id`.
  - Configure StoreKit products in App Store Connect & Google Play Console (`saavi_pro_monthly`, `saavi_pro_yearly`).
  - Wire 7-day free trial presentation and "Restore Purchases" in `app/settings/plan.tsx`.
- [ ] **Task 2.2 — Chat API JWT Verification & 5/day Trial Guard**:
  - Update `server/chat.mjs` to verify Supabase JWT header.
  - Enforce 5 AI requests/day for trial users via Supabase counter table/RPC (no Redis).
- [ ] **Task 2.3 — Private Supabase Media Storage**:
  - Create private Supabase storage bucket `media` with RLS.
  - Implement background upload in `lib/cloud/mediaSync.ts` to convert local cache to durable storage paths.
  - Ensure unsynced local media is never evicted.
- [ ] **Task 2.4 — Store Compliance & Assets**:
  - Link Privacy Policy and Apple standard EULA in `app/settings/about.tsx` and `app/settings/plan.tsx`.
  - App Store & Play Store screenshots and privacy labels declaration.

### Phase 3: Post-Launch Evolution (Deferred)
- [ ] **Live Multi-Device Family Invitations & Realtime Sync** (Supabase Realtime).
- [ ] **Media Cache Settings UI** (Settings $\rightarrow$ Storage $\rightarrow$ Clear Cache).
- [ ] **Sentry & Product Telemetry** (only once real user scale justifies it).
