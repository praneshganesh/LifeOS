# Saavi Chat API & Talk System — Consolidated Master Tracker

This master document tracks all reviews, architectural decisions, code changes, and pending roadmap items across the entire Saavi Chat & Talk integration (Server API, Client Action Engine, Context Builders, Network Transport, and Domain Layer).

---

## 1. System Architecture & Boundaries

```
                 User Voice / Text Utterance
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │                 Saavi Client UI Layer                   │
  │     (app/(tabs)/ask.tsx & components/TalkOverlay.tsx)   │
  │                                                         │
  │  1. Evaluate single turnLocalDate = localDayKey()       │
  │  2. Resolve local offline intents (if applicable)       │
  │  3. If remote: dispatch to runChatAgent()               │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │         Client Network Transport (lib/chat/agent.ts)    │
  │                                                         │
  │  1. Build compact summaries via lib/chat/prompt.ts      │
  │  2. Attach localDate, timezone, focus, household data   │
  │  3. Defensive timeout (25s) & localhost phone checks    │
  │  4. POST request to Saavi Chat API                      │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │            Saavi Chat API (server/chat.mjs)             │
  │                                                         │
  │  1. Bearer Token Auth & IP Rate Limiting                │
  │  2. Validate localDate (strict ISO YYYY-MM-DD)          │
  │  3. Format compact prompt & query OpenAI (JSON Schema)  │
  │  4. Deterministic repairActions()                       │
  │  5. Action validation gate validateActions()            │
  │  6. Confirmation reply generation & sanitization        │
  └──────────────────────────┬──────────────────────────────┘
                             │
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │      Client Action Engine (lib/chat/applyActions.ts)    │
  │                                                         │
  │  1. normalizeAgentResponse()                            │
  │  2. Validate date fields via isIsoDate()                │
  │  3. Existence checks on destructive ops (removes/edits) │
  │  4. Apply mutations anchored to turn turnLocalDate      │
  │  5. Update cross-module session focus                   │
  └─────────────────────────────────────────────────────────┘
```

---

## 2. Review Status Matrix

| Component / File | Scope & Responsibility | Review Status | Findings & Priority Fixes | Implementation Status |
| :--- | :--- | :---: | :--- | :---: |
| **`server/chat.mjs`** | Chat API backend, LLM prompts, action repair, validation gate, confirmation replies | **Reviewed** | • UTC date skew at midnight (P1)<br>• Missing action validation gate (P2)<br>• Monolithic repairActions (P3)<br>• `Classes` missing from Facts whitelist (P1)<br>• Navigation fallback cross-module bug (P1) | ✅ **Completed & Verified** |
| **`lib/chat/prompt.ts`** | Context summarization for Inventory, Expenses, Subscriptions, Habits, Classes, Last Done | **Reviewed** | • `dayOnly()` accepted invalid calendar dates (P1)<br>• Class schedule fields missing in summary (P1)<br>• Timeline event sorting verified (P2) | ✅ **Completed & Verified** |
| **`lib/chat/applyActions.ts`** | Client action execution engine, mutation handlers, entity resolution, reply composing | **Reviewed** | • Needs single `localDate` anchor across turn (P1)<br>• Impossible dates in `normalizeDateField` (P1)<br>• Destructive op unknown ID guards (P1/P2)<br>• Explicit invalid dates must skip mutation (P1)<br>• `update_subscription` existence guard (P2) | ✅ **Completed & Verified** |
| **`lib/chat/agent.ts`** | Client-to-server transport, payload formatting, device URL detection, response normalization | **Reviewed** | • `classPacks` type missing schedule fields (P1)<br>• Verify shared `localDate` per turn (P1)<br>• Domain type optionality verification (P2)<br>• Developer network error logging (P2) | ✅ **Completed & Verified** |
| **`app/(tabs)/ask.tsx`** | Main Chat screen, turn lifecycle, focus state, action dispatch | **Reviewed** | • Single `turnLocalDate` generated once per turn and passed to both agent & action runner (P1) | ✅ **Completed & Verified** |
| **`components/TalkOverlay.tsx`** | Voice Talk overlay, voice session lifecycle, action dispatch | **Reviewed** | • Single `turnLocalDate` generated once per turn and passed to both agent & action runner (P1) | ✅ **Completed & Verified** |
| **`lib/classes.ts` & Schedule** | Class pack domain, schedule parser, attendance logging, notification triggers | **Reviewed** | • `completed` to `used` count mapping verification<br>• Notification triggers for upcoming classes<br>• `scheduleTimeInferred` tracking & 9:00 AM default disclosure | ✅ **Completed & Verified** |
| **`lib/classNotifications.ts` & `classSchedule.ts`** | Local notification scheduling, cancellation, synchronization for class reminders | **Reviewed** | • Fail closed if notification preferences cannot be read (P1/P2)<br>• Development-only warning logging (P2)<br>• Avoid redundant individual cancellation during full sync (Optimization)<br>• Evening-before (18:00) and Morning-of (08:00 when before class) reminders<br>• Enforce `startsOn`, `endsOn`, chronological ordering across multiple days, and `remainingCount` cap | ✅ **Completed & Verified** |
| **`lib/dates.ts`** | Date helpers (`localDayKey`, `isIsoDate`, `addCalendarMonths`) | **Reviewed** | • Centralized real calendar validation (`isIsoDate`) across repo | ✅ **Completed & Verified** |

---

## 3. Detailed Changelog of All Modifications

### A. Server API (`server/chat.mjs`)
1. **User-Local Date & Timezone**:
   - Accepts `localDate` and `timezone` from request body.
   - Validates `localDate` with `isIsoDate()` (rejecting impossible calendar days like `2026-02-30` or `2026-99-99`) and falls back safely to UTC only if omitted.
   - Injected into prompt: `Today is ${today}. User local calendar date is ${today}.`
   - Prompt date instruction clarified: Future relative expressions resolve to future dates; historical relative expressions resolve to past dates.
2. **Action Validation Gate (`validateActions`)**:
   - Added post-repair sanity gate `validateActions(actions)`:
     - Strips `{ type: 'none' }` if valid meaningful actions exist.
     - Enforces non-empty `label` and valid ISO date on `set_reminder`.
     - Enforces both `from` and `to` on `rename_person`.
     - Enforces `id` or `title` on `log_class` (rejects `personId` alone to avoid ambiguous logging).
     - Enforces required IDs on deletions and updates.
     - Logs rejected actions via `console.warn('[Chat] rejected invalid action', action)`.
3. **Modularized Repair Helpers**:
   - Extracted internal domain repair functions: `repairExpenseItemAction`, `repairAddItemAction`, `repairPeopleAction`, `repairNavigationAction`, `repairRemovalAction`, and `repairAddExpenseAction`.
   - Prevented `repairNavigationAction()` from falling back to `open_item` when an explicit non-item navigation action (`open_class`, `open_habit`, `open_subscription`, `open_last_done`) was requested.
4. **Class Schedule Facts & Whitelist**:
   - Added `Classes` to Facts whitelist.
   - Added `scheduleDays` and `scheduleTime` to `slimClassPacks()` and prompt facts.
5. **Confirmation Reply Fallbacks (`sanitizeReply`)**:
   - Added deterministic fallback replies for all mutation action types (`update_expense`, `remove_expense`, `update_subscription`, `remove_subscription`, `update_class_pack`, `remove_class_pack`, `remove_habit`, `remove_last_done`, `rename_person`).

### B. Client Summaries (`lib/chat/prompt.ts`)
1. **Strict ISO Date Validation in `dayOnly()`**:
   - Updated `dayOnly()` to use `isIsoDate()`: impossible dates and non-date garbage strings return `undefined` rather than leaking invalid strings to the LLM.
2. **Class Schedule Context**:
   - Extended `ClassPackSummaryInput` and `buildClassPackSummary()` to include `scheduleDays` and `scheduleTime`.

### C. Client Action Engine (`lib/chat/applyActions.ts`)
1. **Single Turn Local Date Anchor**:
   - Added `localDate?: string` to options; used consistently for item creation, habit check-ins, class enrollment/logging, and expense creation.
2. **Date Normalization & Rejection**:
   - Updated `normalizeDateField(raw)` with `isIsoDate()` to reject impossible dates.
   - Strict explicit date policy: absent date defaults to user local `today`, valid explicit date is used, and invalid explicit date logs a skip and rejects the mutation.
3. **Destructive Operation & Update Guards**:
   - Added existence checks guarding `remove_subscription`, `remove_last_done`, `remove_habit`, `remove_class_pack`, and `update_subscription` against unknown IDs.

### D. Client Network Transport (`lib/chat/agent.ts`)
1. **Class Schedule Fields in Contract**:
   - Extended `classPacks` input parameter with `scheduleDays?: string[]` and `scheduleTime?: string`.
2. **Shared `localDate` Integration**:
   - Added `localDate?: string` parameter to `runChatAgent()`, forwarding `params.localDate || localDayKey()`.
3. **Domain Type Optionality Verified**:
   - Checked `ClassPack` in `lib/classes.ts` and `Subscription` in `lib/subscriptions.ts` — verified `startsOn`, `endsOn`, and `renewsOn` are mandatory domain fields and kept them mandatory in `agent.ts`.
4. **Development Network Error Logging**:
   - Added `if (__DEV__) console.warn('[Saavi chat] request failed', err);` for technical debugging while preserving user-friendly `ChatAgentError`.

### E. Chat UI Integration (`app/(tabs)/ask.tsx` & `components/TalkOverlay.tsx`)
1. **Single Conversational Turn Anchor**:
   - Computed `const turnLocalDate = localDayKey();` once per turn.
   - Passed `turnLocalDate` to both `runChatAgent({ ..., localDate: turnLocalDate })` and `applyChatActions(..., { ..., localDate: turnLocalDate })`.

### F. Shared Utilities (`lib/dates.ts`)
1. **Centralized `isIsoDate`**:
   - Validates ISO `YYYY-MM-DD` strings with leap year and day-of-month bounds checking.

### G. Class Notifications (`lib/classNotifications.ts`)
1. **Fail-Closed on Preference Failure**:
   - When `loadNotificationPrefs()` fails or throws, scheduling halts cleanly instead of assuming push is enabled.
2. **Development-Only Warning Logging**:
   - Added `if (__DEV__) console.warn` across `cancelClassReminders`, `scheduleClassReminders`, and `syncClassReminders` catch blocks.
3. **Full Sync Optimization (`skipCancel`)**:
   - `syncClassReminders` passes `{ skipCancel: true }` to `scheduleClassReminders` to avoid redundant native cancellation queries after clearing the `lifeos-cls-` prefix. Standalone `scheduleClassReminders(pack)` retains its full cancellation-then-replacement guarantee.

### H. Inferred Class Time & Notification Scheduling (`lib/classes.ts`, `lib/classSchedule.ts`, `lib/chat/composeReply.ts`)
1. **Inferred Class Time Tracking (`scheduleTimeInferred`)**:
   - When user provides `scheduleDays` without `scheduleTime`, `createClassPack` defaults time to `9:00 AM` and sets `scheduleTimeInferred = true`.
   - When user explicitly supplies or updates `scheduleTime`, `scheduleTimeInferred = false`.
2. **Assumption Disclosure & Edit Route**:
   - Chat confirmation for inferred class time discloses the assumption: *"Added Skating — 12 classes. I've assumed 9:00 AM since you didn't specify a time."*
   - Automatically maintains `class` session focus so the user can easily tap or navigate to edit.
   - UI (`app/classes/[id].tsx`) shows *"Time assumed"* on class packs with inferred times and clears the inference flag upon saving edited details.
3. **Trigger Calculation Logic**:
   - Evening-before reminder: at 18:00 local time on previous day (`${classReminderIdPrefix(pack.id)}-eve-${localDayKey(classDate)}`).
   - Morning-of reminder: at 08:00 local time on class day, strictly if `8:00 AM < classTime` (`${classReminderIdPrefix(pack.id)}-day-${localDayKey(classDate)}`). Early classes (e.g. 7:00 AM) receive the 18:00 eve reminder only.
   - Occurrence candidates globally sorted chronologically across multiple schedule days (e.g. Tuesday + Thursday).
   - Candidate occurrences bounded by `startsOn` and `endsOn` windows.
   - Occurrence count capped at `remainingCount(pack)`.
   - Past triggers filtered out against `now.getTime()`.

---

## 4. Test Suite & Verification Results

* **Total Automated Tests**: 185 tests in 41 test suites passing (0 failures, 0 skipped).
* **Linter Diagnostics**: 0 errors, 0 warnings.
* **Test Suites Covering Chat & Talk**:
  * `server/__tests__/regression.test.mjs`: Node test suite covering `isIsoDate`, action validation gate, currency extraction, multi-domain entity repairs, vague open/delete, class lifecycle, multi-pack disambiguation, CORS, token auth, and rate limits.
  * `lib/__tests__/applyActions.test.ts`: Client action application, local date anchoring, destructive existence checks, explicit invalid date skipping, habit check-in rules, and focus routing.
  * `lib/__tests__/core.test.ts`: Date helpers, `dayOnly()`, money formatting, and deduplication.
  * `lib/__tests__/classes.test.ts`: Class pack creation, schedule parsing, log counts, and next occurrence calculations.
  * `lib/__tests__/classNotifications.test.ts`: Notification trigger scheduling and time string parsing.

---

## 5. Pending Tasks & Operational Roadmap

| Item | Phase | Description | Status |
| :--- | :---: | :--- | :---: |
| **Server Deployment** | Ops | Deploy updated `server/chat.mjs` to Fly.io via `fly deploy` when ready for production. | ⏳ **Ready to Deploy** |
| **Production HTTPS Verification** | Ops | Verify `EXPO_PUBLIC_CHAT_API_URL` is configured to `https://` in production build environments (eas.json / secret manager). | ⏳ **Pending Deploy** |
| **Pre-Prompt Context Retrieval** | Future | When user datasets exceed summary limits (40 items, 30 expenses, etc.), introduce lightweight string/fuzzy retrieval filtering before prompting. | 📋 **Backlog** |
| **Manual URL Whitelisting** | Future | Restrict appliance manual links (`manualUrl`) to a whitelist of known OEM domains if web search links are ever re-introduced. | 📋 **Backlog** |
