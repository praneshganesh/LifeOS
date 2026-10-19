# Sync architecture: offline-first household DB

**Goal:** Real Postgres tables in Supabase, with the phone remaining usable in airplane mode. Solo users are a **household of one**; Family is the same model with more members, not a later rewrite.

**Status (2026-09-28): implemented for all modules.** Phases A, C (media) and D (blob freeze) below are done; Phase B (SQLite local mirror) is **explicitly deferred**, AsyncStorage stays as the local mirror.

### What ships today

| Area | Implementation |
|------|----------------|
| Tables | `household_people`, `spaces`, `rooms`, `things`, `reminders`, `expenses`, `subscriptions`, `habits`, `class_packs` (migrations `20260911080000_household_sync.sql`, `20260928090000_row_sync_all_modules.sql`). All share the §4 columns; `body jsonb` carries the full local item. |
| Engine | `lib/sync/engine.ts` (`SPECS` registry, `syncRowsNow`, `scheduleRowSync`, `subscribeSyncApplied`), `lib/sync/core.ts` (row mapping, LWW merge, tombstones), `lib/sync/outbox.ts` (AsyncStorage outbox, coalesced per row). |
| Ids | New rows get client UUIDs (`lib/ids.ts newUuid`). Legacy ids (`inv-…`, `s1`, `rm-…`) map to a **deterministic** uuid (`legacyIdToUuid`, FNV-1a based) so seeded spaces do not duplicate across devices. |
| Contexts | Every module context stamps `updatedAt`, calls `queueUpsert` / `queueDelete`, and reloads its store on `subscribeSyncApplied`. |
| Backfill | First sync after sign-in / recovery enqueues every local row as a `backfill` op (`ignoreDuplicates: true`) so a fresh device never clobbers newer cloud rows. |
| Media | `lib/media/mediaSync.ts`: private bucket `media`, path `{household_id}/{uuid}.ext`, RLS via `_media_household(name)`. Things sync `imagePath`, expenses `receiptPath`; local `imageUri` / `receiptUri` never leave the device and are re-downloaded (signed URL) on a new device. Local files are never deleted by sync. |
| Blob | `life_stores` is **prefs only** (`CLOUD_PREF_KEYS`). Domain keys are read once for legacy import when the local store is empty, never pushed again. |
| Recovery | `life_recovery` rows carry `household_id`; `claim_household_by_recovery(code)` adds the new user as owner, then row sync pulls everything. |
| Plan mirror | RevenueCat webhook → chat API `/rc/webhook` → `admin_set_plan_id` (service role) writes `plan_id`, `billing_cadence`, `store_product_id`, `renews_at`, and `pending_store_product_id`. `set_my_plan_id` from the client is an optimistic mirror of the same columns. Talk limits read `plan_id` only. |

### Deferred (not correctness gaps)

- **SQLite local mirror (§5).** AsyncStorage arrays are fine up to a few thousand rows per module; revisit when list sizes or write frequency make JSON rewrites noticeable.
- **Field-level merge (§7).** Row LWW is the shipped rule.
- **Tombstone GC.** Tombstones are kept indefinitely for now.

---

## 1. Principles

1. **Local is the runtime source of truth while offline.** UI always reads/writes a local store first.
2. **Household is the sync boundary.** Every shared row carries `household_id`. Solo = one household, one owner member.
3. **Row-level sync, not module JSON blobs.** One Thing / expense / reminder = one cloud row (or soft-deleted tombstone).
4. **Supabase is the durable shared ledger** when online, Auth + Postgres + RLS (+ Storage later for media).
5. **Never block the UI on network.** Saves succeed locally; sync drains an outbox when connectivity returns.
6. **Prefer boring conflict rules** (last-write-wins per field or per row with `updated_at` + `updated_by`) until multi-writer pain is real.
7. **Sensitive device prefs stay local** (app lock, biometrics). Identity docs: metadata may sync; photos follow an explicit media policy.

---

## 2. Mental model

```
┌─────────────────────────────────────────────────────────┐
│  App UI (React Native)                                  │
│    ↓ write                                              │
│  Local DB / mirror (SQLite or WatermelonDB, see §5)    │
│    · entities + outbox + sync metadata                  │
│    ↓ push / ↑ pull when online                          │
│  Sync engine                                            │
│    · drain outbox → Supabase upserts                    │
│    · pull changes since cursor → apply locally          │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS (when online)
                       ▼
┌─────────────────────────────────────────────────────────┐
│  Supabase                                               │
│  · auth.users (Apple / anonymous→linked)                │
│  · households, household_members                        │
│  · domain tables (things, expenses, …)                  │
│  · RLS by household membership                          │
│  · storage bucket (later): media/{household_id}/…       │
└─────────────────────────────────────────────────────────┘
```

**Airplane mode:** all reads/writes hit local only; mutations enqueue in `outbox`. On reconnect, outbox pushes, then pull merges remote changes.

---

## 3. Identity & household

### Auth
- **Ship toward Sign in with Apple** (link from anonymous if needed).
- Each `auth.users` row maps to a **profile**.
- A user belongs to ≥1 household via `household_members`.

### Solo day one
On first launch / first cloud session:

1. Create `households` row (e.g. “Home”).
2. Create `household_members` for the signed-in user with `permission = owner`.
3. Optionally create **people** rows (kids, pets) as *non-login* household persons, same as today’s Family list, but scoped to `household_id`.

### Family later (same schema)
- Invite → `household_invites` (code / magic link).
- Accept → new `household_members` row (`editor` / `viewer`).
- Who can see a row inside that household (audience) is specified in [`FAMILY_SHARING.md`](./FAMILY_SHARING.md). Membership alone is not the visibility rule.

Distinguish:

| Concept | Meaning |
|---------|---------|
| **Member (login)** | Can open the app and sync (`household_members` ↔ `auth.users`) |
| **Person (profile)** | Child / pet / “Ishaan” for assignment, may have no login |

---

## 4. Cloud schema (target)

All domain tables share:

| Column | Purpose |
|--------|---------|
| `id` | UUID (client-generated so offline creates work) |
| `household_id` | Sync / RLS scope |
| `created_at` / `updated_at` | Ordering + LWW |
| `updated_by` | auth uid (optional but useful) |
| `deleted_at` | Soft delete / tombstone for sync |
| `client_mutated_at` | Device clock when user saved (tie-break with server `updated_at`) |

### Core tables

```
profiles                 (id = auth.uid)
households               (id, name, created_at, …)
household_members        (household_id, user_id, permission, …)
household_people         (id, household_id, name, role, relation, …)  -- kids/pets
household_invites        (id, household_id, code_hash, role, expires_at, …)

spaces / rooms           (household_id, …)
things                   (household_id, person_id?, space_id?, …)  -- inventory + docs metadata
expenses
subscriptions
habits / habit_logs
class_packs / class_logs
reminders                -- Last Done / tasks with remind_at, remind_interval jsonb
notification_prefs       -- per user or per household (decide per field)
```

**Prefs split:** appearance / talk-voice / security → **user-local** (or `user_prefs`). Plan entitlements → user or household billing owner.

**Media (live):** no separate `media_objects` table. The row itself carries the durable path (`things.body.imagePath`, `expenses.body.receiptPath`) and the device-only URI (`imageUri` / `receiptUri`) is stripped from every cloud body. Storage path `media/{household_id}/{uuid}.ext`; RLS on `storage.objects` resolves the household from the first path segment. Local files are never deleted by sync.

### RLS (sketch)

- `authenticated` can `select/insert/update` rows where  
  `household_id in (select household_id from household_members where user_id = auth.uid())`
- Viewers: `select` only; editors/owners: mutate.
- Invites: restricted RPC (`accept_invite`): no open table writes.

`life_stores` is now **prefs only** (`CLOUD_PREF_KEYS` in `lib/cloud/payload.ts`: notification prefs, profile, onboarding, appearance, plan mirror, AI usage mirror, talk voice). Legacy domain keys are pulled **once** when the local store is empty (`lifeos:cloud:legacyImported:v1`) and never pushed again. `life_recovery` now carries `household_id`; entering a code on a new phone calls `claim_household_by_recovery`, which adds owner membership so row sync (not a blob) restores the data.

---

## 5. Local store

### Current
AsyncStorage arrays per module (`lifeos:<module>:v1`) + an AsyncStorage outbox (`lib/sync/outbox.ts`, capped at 4000 ops, coalesced per row). Contexts stamp `updatedAt`, call `queueUpsert` / `queueDelete`, and reload from storage on `subscribeSyncApplied`.

### Deferred: SQLite mirror
Move domain data from AsyncStorage arrays → **SQLite on device** (Expo SQLite or WatermelonDB). Explicitly deferred: the row shapes and outbox are already Postgres-aligned, so this is a swap of the persistence layer, not a redesign. Revisit when a household passes a few thousand rows or list screens show read latency.

Why:

- Same row shape as Postgres → simpler sync  
- Outbox + indexes without rewriting giant JSON  
- Scales past hundreds of Things without rewriting whole modules  

AsyncStorage can remain for tiny flags (onboarding complete, last sync cursor) until SQLite is ready.

### Outbox table (local)

```
outbox (
  id, table_name, row_id, op ['upsert'|'delete'],
  payload jsonb, created_at, attempts, last_error
)
```

Every local `add/update/remove`:

1. Apply to local row immediately.  
2. Append outbox entry.  
3. Kick sync if online.

---

## 6. Sync protocol

### Push
1. If offline → stop.  
2. Take pending outbox in order.  
3. Upsert/delete corresponding Supabase rows (RPCs or table upserts with RLS).  
4. On success → delete outbox row.  
5. On auth/RLS failure → surface in Settings; don’t loop forever without backoff.

### Pull
1. Store per-table (or global) `sync_cursor` = last successful server `updated_at` (or `xmax`-style version if you add `row_version`).  
2. `select * from things where household_id = ? and updated_at > cursor order by updated_at`.  
3. Apply each row locally with conflict rule (§7).  
4. Advance cursor.

### When to sync
- App foreground + network available  
- After local mutation (debounced)  
- App backgrounding  
- Manual “Sync now”  
- NetInfo “back online”

### Connectivity
Use NetInfo (or equivalent). **Never** throw to the user on save because push failed, save is local; sync badge can show “Pending (3)”.

---

## 7. Conflicts

**Default (v1): last-write-wins per row** using `client_mutated_at` (then `updated_at`).

- If remote `client_mutated_at` > local → remote wins (overwrite local).  
- If local outbox pending and remote also changed → **outbox wins for that row** after push (or compare timestamps and drop stale outbox). Document the choice and stick to it.

**Soft deletes:** syncing `deleted_at` removes/hides locally; never hard-delete until all members have pulled the tombstone (optional GC job later).

**Field-level merge** (e.g. name vs warranty date) is a later optimization, not required for solo or light Family.

---

## 8. Offline guarantees

| Action | Offline | Online later |
|--------|---------|--------------|
| Add Thing / expense / reminder | Local row + outbox | Push upsert |
| Edit / delete | Local + outbox | Push |
| Capture photo | Local file + local URI on Thing | Media upload outbox (phase 2) |
| Talk / Ask AI | Needs network (unchanged) | n/a |
| Invite accept | Needs network | n/a |
| Browse household data | Local cache | Pull refresh |

Talk/chat remains online-only; domain CRUD does not.

---

## 9. Migration from today’s app

### Phase A: Schema + solo household (DONE)
1. Migrations for households, members, people, things, reminders, expenses, subscriptions, habits, class_packs, spaces, rooms.  
2. AsyncStorage UI kept working.  
3. One-shot **backfill** (`lifeos:sync:backfilled:v2`): every local row is enqueued with `ignoreDuplicates` so a fresh device never clobbers newer cloud rows.  
4. Legacy ids (`inv-…`, `s1`, `rm-…`) map to deterministic uuids (`legacyIdToUuid`, FNV-1a based) so seeded spaces do not duplicate across devices.

### Phase B: Outbox + contexts (DONE; SQLite deferred)
1. Contexts write local first, then `queueUpsert` / `queueDelete`.  
2. Contexts reload on `subscribeSyncApplied`.  
3. `life_stores` blob push is prefs only.

### Phase C: Family (DONE for data path)
1. Invites + RLS by household membership (`user_household_ids()`, `household_can_edit()`).  
2. Pull other members' changes per table cursor.  
3. Media: uploads only what the user captured; identity documents are stored in the same private household bucket (no public URLs; signed URLs, 1h).

### Phase D: Bridge frozen (DONE)
1. `life_stores` frozen to prefs; legacy domain keys import once.  
2. Recovery = Sign in with Apple, or recovery code → `claim_household_by_recovery` → membership → row sync.

**Client IDs:** generate UUIDs now for new local rows so offline creates survive upload without remapping.

---

## 10. What we explicitly will not do

- Extend whole-module JSON blobs as the Family sync design  
- Require network to add a Thing or set a reminder  
- Upload passport/Emirates ID images without an explicit media + privacy policy  
- Put Face ID / app-lock secrets in Postgres  

---

## 11. Implementation order

1. ~~Doc + schema migrations for household + `things` + `reminders`~~ done  
2. ~~UUID ids in local creates~~ done  
3. ~~Outbox + push for things/reminders~~ done  
4. ~~Pull + LWW~~ done  
5. ~~Migrate remaining modules~~ done (expenses, subscriptions, habits, class_packs, spaces, rooms, household_people)  
6. SQLite local mirror: **deferred** (see §5)  
7. ~~Apple auth + invites~~ done (`docs/AUTH_APPLE.md`, `docs/SUBSCRIPTIONS_AND_INVITES.md`)

### Deploy checklist for this cutover
- Apply `supabase/migrations/20260928090000_row_sync_all_modules.sql` on staging, then production (creates 6 tables, the `media` bucket + policies, `claim_household_by_recovery`, `admin_set_plan_id`).
- Redeploy the chat API (`npm run deploy:chat-api`) with `REVENUECAT_WEBHOOK_SECRET` + `SUPABASE_SERVICE_ROLE_KEY` set; point the RevenueCat webhook at `/rc/webhook`.
- No app-side flag: the first online session backfills local rows and imports the legacy blob once if the device has no local data.

---

## 12. Relation to `docs/BACKEND.md`

`BACKEND.md` describes **staging Git ↔ Supabase**, env, and the operational side (what lives in which table, webhook setup). The `life_stores` snapshot there is now prefs-only; domain data follows **this** document. Do not add features that deepen blob sync.
