# Saavi Chat API — Architecture Review & Low-Risk Improvement Plan

## Objective

Improve the reliability and maintainability of the existing Saavi Chat API without redesigning the architecture or making large changes that could break currently working behaviour.

The existing implementation already handles a substantial number of conversational scenarios successfully. Changes should therefore be incremental, backwards-compatible, and easy to test and revert.

* **Non-goal**: Do not rewrite the chat architecture.
* **Non-goal**: Do not replace the current prompt/action approach.
* **Non-goal**: Do not introduce a new intent-routing architecture at this stage.

---

## 1. Current Architecture

```
User Voice / Chat
      ↓
Saavi Mobile Client
      ↓
Chat API (Node.js / Express on Fly.io)
      ↓
OpenAI (gpt-4o-mini / structured JSON)
      ↓
Structured Actions Array
      ↓
Deterministic Repair & Normalisation
      ↓
Saavi Client Executes Actions
```

### Supported Domains
* **Inventory / Things** (`add_item`, `update_item`, `remove_item`, `open_item`)
* **Expenses** (`add_expense`, `update_expense`, `remove_expense`, `open_expense`)
* **Subscriptions** (`add_subscription`, `update_subscription`, `remove_subscription`, `open_subscription`)
* **Habits** (`habit_check_in`, `remove_habit`, `open_habit`)
* **Class Packs & Attendance** (`add_class_pack`, `update_class_pack`, `remove_class_pack`, `log_class`, `open_class`)
* **Last Done Activities & Reminders** (`log_done`, `set_reminder`, `remove_last_done`, `open_last_done`)
* **Household Members** (`rename_person`, person resolution/assignments)
* **Navigation / Session Focus** (context-aware open/delete based on last touched entity)

### Core Principle
> **LLM understands language. Saavi code enforces application behaviour.**

The combination of LLM interpretation plus deterministic repair is particularly useful because natural-language input and ASR can be unpredictable. The goal is to strengthen this architecture rather than replace it.

---

## 2. Priority 1 — Fix User-Local Date Handling

### Current Issue
The server currently determines today using:
```js
new Date().toISOString().slice(0, 10)
```
This returns the date in UTC. Around midnight, UTC may represent a different calendar day from the user’s actual location (e.g. Dubai UTC+4 on 29 August while UTC is still 28 August). Relative phrases ("today", "yesterday", "tomorrow", "next Tuesday", "before November") can resolve to the wrong calendar date.

### Recommended Change
1. Client passes user's current local date and timezone in the request:
   ```json
   {
     "localDate": "2026-08-28",
     "timezone": "Asia/Dubai"
   }
   ```
2. Server validates `localDate` (format `YYYY-MM-DD`) and falls back safely to UTC if omitted:
   ```js
   const today = validLocalDate(body.localDate)
     ? body.localDate
     : new Date().toISOString().slice(0, 10);
   ```
3. Inject `today` into the model context:
   ```js
   content: `Today is ${today}. ...`
   ```

---

## 3. Priority 2 — Add Action Validation

### Current Issue
Model-generated actions after `repairActions()` are sent directly to the client. Malformed, incomplete, or destructive actions without required identifiers could reach the client.

### Recommended Architecture
```
Model Actions
     ↓
repairActions() (existing repair layer)
     ↓
validateActions() (lightweight sanity gate)
     ↓
Return Valid Actions to Client
```

### Validation Rules (Safety Net, not Business Rules Engine)
* Recognised action types only.
* Required IDs on deletions and updates (`remove_item`, `update_item`, `remove_expense`, `update_expense`, `remove_habit`, `remove_class_pack`, `update_class_pack`, `remove_last_done`).
* Required titles / names on creations (`add_item`, `add_expense`, `add_subscription`, `add_class_pack`, `habit_check_in`).
* Numeric validation (e.g. `amount` for expenses/subscriptions is finite number; `total` > 0 for class packs).
* Malformed date prevention (valid ISO/YYYY-MM-DD date strings).
* Safe fallback to `{ type: 'none' }` or dropping only the invalid action while keeping valid multi-actions.

---

## 4. Priority 3 — Break Up `repairActions()` Internally

### Current State
`repairActions()` in `server/chat.mjs` handles multiple responsibilities in a single large function:
* Inventory IDs & brands
* Expense & merchant extraction
* Class pack & attendance repair
* Reminder extraction
* Household name corrections & member assignments
* Focus/navigation and delete remaps

### Target Refactoring
Extract domain-specific repair helpers preserving exact inputs, outputs, and behaviour:
```js
function repairActions(actions, context) {
  let result = actions;
  result = repairClasses(result, context);
  result = repairReminders(result, context);
  result = repairPeople(result, context);
  result = repairInventory(result, context);
  result = repairExpenses(result, context);
  result = repairNavigation(result, context);
  return result;
}
```
* **Constraint**: Extract one logical section at a time without altering conversational rules in the same commit.

---

## 5. Architectural Invariants to Preserve

1. **Keep Deterministic Repair**: `ensureClassActions()`, `ensureReminderActions()`, `repairHeardBrand()`, `merchantFromUtterance()`, `currencyFromUtterance()`, `sessionFocusFromBody()`.
2. **Keep Multi-Action Support**: `actions: []` array must remain for multi-intent utterances (e.g. enrolling in class pack + logging upfront payment expense).
3. **Preserve Household Resolution**:
   * Stored members resolved by fuzzy match & ID.
   * First-person defaults to member with `relation === 'You'`.
   * Newly spoken names preserved as `{ assignedTo: "Name" }` without inventing a fake `personId`.
   * Never silently replace an unknown explicitly named person with another household member.
4. **Preserve Domain Distinctions**:
   * **Habit**: Recurring behaviour check-in (`habit_check_in`).
   * **Last Done**: Occasional historical service/maintenance (`log_done`).
   * **Reminder**: Future scheduled action (`set_reminder`).
   * **Class Pack**: Finite session commitment with window and remaining count (`add_class_pack`, `log_class`).
5. **Keep Deterministic Confirmation Replies**: Action array remains the source of truth for mutation confirmations (`alignReplyWithActions`).
6. **Preserve Security & Operational Guards**: Server-side OpenAI key, Bearer token authorization, rate limiting (30 rpm, 200 req/day per IP), body size limits, OpenAI timeout, and session spend tracking.

---

## 6. Future Improvements (Scheduled for Later Phases)

1. **Context Window & Retrieval**: Currently context is capped per domain (20 inventory, 20 last-done, 30 expenses, 25 habits, 20 classes, 30 subs). When user datasets grow, introduce lightweight string/fuzzy retrieval before prompting rather than full vector search.
2. **`manualUrl` Sanitization**: Drop model-generated manual links or restrict to a strict whitelist of known OEM domains (`support.apple.com`, `samsung.com`, `sony.com`, `lg.com`).
3. **Prompt Simplification**: Defer until comprehensive regression test suites are established.

---

## 7. Implementation Roadmap

| Step | Phase | Key Deliverables | Risk Level |
| :--- | :--- | :--- | :--- |
| **Phase 1** | **Client Local Date & Timezone** | Pass `localDate` & `timezone` from app client; validate and inject into server context. | Very Low |
| **Phase 2** | **Action Validation Layer** | Implement lightweight `validateActions()` run after `repairActions()`. Drop/sanitize invalid actions. | Very Low |
| **Phase 3** | **Regression Test Suite** | Expand Node test suites with positive & negative test cases across all 9 domains and ASR variations. | Zero (Test only) |
| **Phase 4** | **Modularise `repairActions()`** | Break down `repairActions()` into domain-specific modules with unchanged behavioural tests. | Low |
| **Phase 5** | **Documentation & Deployment** | Update API contract documentation and deploy updated server to Fly.io. | Low |
