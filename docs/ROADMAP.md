# LifeOS — Master roadmap

Local-first mobile app. **No backend yet** — inventory, family, expenses, habits, etc. stay on-device (AsyncStorage / later SQLite). Chat uses a local/hosted OpenAI proxy only (`server/chat.mjs`); a real backend (auth, sync, billing, FinanceKit entitlements hosting) is **deferred**.

Status key: `todo` · `doing` · `done` · `later`

---

## 0. Platform / deferred backend

| ID | Item | Status |
|----|------|--------|
| B0 | Hosted chat-api (Render **or** Fly — decide at deploy) | later — local `npm run chat-api` is enough now |
| B1 | Auth / accounts | doing — Supabase profiles (uid only) on `staging`; Sign in with Apple later |
| B2 | Encrypted multi-device sync | later |
| B3 | Billing / Family plan metering | later |
| B4 | FinanceKit entitlement + App Store Finance category | later |
| B5 | Bank aggregation (Plaid-class) | later |

---

## 1. Foundation (on-device)

| ID | Item | Status |
|----|------|--------|
| F1 | Kill mock bleed — lists/home/attention/docs/vehicles use real inventory | done |
| F2 | Versioned storage + migrations for all stores | done |
| F3 | Editable household / Family members (replace hardcoded `familyMembers`) | done |
| F4 | Spaces/rooms fully owned by SpacesContext (no mock rooms as source of truth) | done |
| F5 | Empty states everywhere (no demo filler) | done |

---

## 2. Things / Capture / Talk

| ID | Item | Status |
|----|------|--------|
| T1 | Capture ↔ Talk stub linking reliability + UI | done-ish |
| T2 | Talk fact integrity QA (purchase, warranty, addedAt, service) | done-ish |
| T3 | Smart receipt router: Thing vs Expense vs both vs Document | done |
| T4 | Manuals / support links polish | done-ish |
| T5 | Item detail / swipe delete / Linen theme | done-ish |

---

## 3. Last Done / maintenance

| ID | Item | Status |
|----|------|--------|
| L1 | Link Last Done → inventory item + timeline sync | done |
| L2 | Local notification reminders for remindAt / intervals | done |
| L3 | Home “due soon” from real Last Done + warranties | done |

---

## 4. Expenses (new)

| ID | Item | Status |
|----|------|--------|
| E1 | Expense entity + on-device store | done |
| E2 | Expenses UI — list, month, category/merchant charts | done-ish |
| E3 | Talk: spend Q&A + “unnecessary” insights vs owned Things | done |
| E4 | Receipt OCR → expense fields (amount, merchant, datetime) | done |
| E5 | Shortcuts / Apple Pay automation → log expense | later |
| E6 | FinanceKit / bank connect | later |

---

## 5. Habits (new)

| ID | Item | Status |
|----|------|--------|
| H1 | Habit entity + daily logs + auto-category | done |
| H2 | Heatmap cards (contribution grid UI) | done |
| H3 | Talk: check-in / streaks | done |
| H4 | Optional link habit ↔ Thing / Last Done | done |

---

## 6. Modules (make real)

| ID | Item | Status |
|----|------|--------|
| M1 | Documents / vault from inventory docs | done |
| M2 | Warranties from `warrantyExpiry` | done |
| M3 | Purchases / receipts history | done |
| M4 | Vehicles as real items + service | done |
| M5 | Subscriptions entity + renewals | done |
| M6 | Insurance policies | done |
| M7 | Tasks + notifications inbox | done |
| M8 | Reports from real data | done |
| M9 | Class packs (finite sessions in a window, e.g. 24 skating classes / 3 months) | done |

---

## 7. Family plan / sharing (client-first, sync later)

| ID | Item | Status |
|----|------|--------|
| FP1 | Household model + CRUD UI | done |
| FP2 | Roles (owner / editor / viewer) — local stubs | done |
| FP3 | Share document (WhatsApp etc.) via share sheet + confirm | done |
| FP4 | Optional redact / watermark on passport share | done |
| FP5 | Invite / live sharing | later (needs backend) |

---

## 8. Settings (every screen real)

| ID | Item | Status |
|----|------|--------|
| S1 | Profile | done |
| S2 | Appearance — Linen + Dark/Hearth + system | done |
| S3 | Notifications — permissions + channels | done-ish |
| S4 | Privacy — what’s on-device vs chat API | done |
| S5 | Security — biometric / PIN lock | done |
| S6 | Homes / multi-home | done |
| S7 | Sharing / family | done-ish |
| S8 | Plan / limits (local counters until billing backend) | done |
| S9 | Data — export / import / wipe | done |
| S10 | About | done |

---

## 9. Product shell

| ID | Item | Status |
|----|------|--------|
| P0 | Branded splash (native + in-app LifeOS beat) | done |
| P1 | Onboarding (home → family → capture → Talk) | done |
| P2 | Search across Things, docs, expenses, habits, people | done |
| P3 | Notification deep links | done |
| P4 | Offline / chat-api-down UX | done |

---

## 10. Quality

| ID | Item | Status |
|----|------|--------|
| Q1 | iOS + Android QA (camera, mic, speech, swipe, share) | doing — iOS blocked (no Apple Developer); web + Android next |
| Q2 | EAS / TestFlight builds | later — needs Apple Developer |
| Q3 | Unit tests — applyActions, summaries, classifiers | done-ish |

---

## Suggested build order (no backend)

1. **F1–F5** — real data foundation  
2. **FP1 + FP3** — household + document share  
3. **E1–E4** — expenses + smart capture split  
4. **H1–H3** — habits + heatmap  
5. **M1–M5, L2** — modules + reminders  
6. **S1–S10, P1** — settings + onboarding  
7. **Backend track (B*)** when ready for sync/billing/FinanceKit  

---

## Active sprint

- **Done:** F1–F5 · F2 · FP1–FP4 · E1–E4 · H1–H4 · M1–M8 · L2/L3 · S1–S10 · T1–T3 · P0–P4 · Q3 (core lib tests) · Talk TTS replies  
- **Now:** Q1 web + Android QA  
- **Blocked:** iOS device / TestFlight until Apple Developer account  
- **Q1 prep shipped:** durable capture photos · notif deep-link dedupe · app-lock flash · vault biometrics deny · share unavailable alert · Android notif channel · loopback chat URL guard · spoken Talk replies (`expo-speech` + mute)  
- **Client gaps closed:** expense/subscription/habit/family edit · plan limit enforcement · Talk expense/sub dedupe · Spaces/LastDone versioned storage · applyActions tests  
- **Deferred:** **B0 host chat-api** (stay on local proxy) · B2–B5 · Apple Pay / FinanceKit · live invites (FP5) · neural TTS  
- **Ops:** `npm run chat-api` + LAN/`localhost` URL · `npm test` · GitHub `main` + persistent `staging`  
- **Backend:** see `docs/BACKEND.md` — connect Supabase with anon key; do not upload household PII yet

### B0 — host later (local is enough)

Repo is ready (rate limit, daily cap, optional token, Dockerfile, `server/fly.toml`). **Do not deploy until a phone off this Wi‑Fi needs Talk.**

**Pick at deploy time: Render or Fly — not Vercel** (would need a serverless rewrite).

| | **Render** | **Fly.io** |
|--|------------|------------|
| **Today (you + a few testers)** | Dashboard, Git deploy, sleeps on free/starter. Easiest. | CLI, `fly.toml` already in repo, machines stop when idle. |
| **Scale (many concurrent Talk turns)** | Scale a **web service** (more RAM/CPU or extra instances). Fine while this stays a tiny Node proxy. | Scale **machines** (count + size) closer to the user (regions). Better if you want multi-region later. |
| **What actually bottlenecks** | **OpenAI**, not the host. `gpt-4o-mini` + 200/IP/day is the spend/rate ceiling long before Render/Fly CPU. |
| **When you’d outgrow both** | Real backend: auth, sync, billing (B1–B3) — then a proper API (still not Vercel for this process). |

**Rule of thumb:** Render if you want the least ops; Fly if you already like CLI + multi-region. Revisit only when hosted Talk is on the critical path.


