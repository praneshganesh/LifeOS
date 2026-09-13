# Sync architecture — offline-first household DB

**Goal:** Real Postgres tables in Supabase, with the phone remaining usable in airplane mode. Solo users are a **household of one**; Family is the same model with more members — not a later rewrite.

**Status:** Architecture only. Current app still uses AsyncStorage + optional `life_stores` JSON blobs. This doc is the target; implement in phases below.

---

## 1. Principles

1. **Local is the runtime source of truth while offline.** UI always reads/writes a local store first.
2. **Household is the sync boundary.** Every shared row carries `household_id`. Solo = one household, one owner member.
3. **Row-level sync, not module JSON blobs.** One Thing / expense / reminder = one cloud row (or soft-deleted tombstone).
4. **Supabase is the durable shared ledger** when online — Auth + Postgres + RLS (+ Storage later for media).
5. **Never block the UI on network.** Saves succeed locally; sync drains an outbox when connectivity returns.
6. **Prefer boring conflict rules** (last-write-wins per field or per row with `updated_at` + `updated_by`) until multi-writer pain is real.
7. **Sensitive device prefs stay local** (app lock, biometrics). Identity docs: metadata may sync; photos follow an explicit media policy.

---

## 2. Mental model

```
┌─────────────────────────────────────────────────────────┐
│  App UI (React Native)                                  │
│    ↓ write                                              │
│  Local DB / mirror (SQLite or WatermelonDB — see §5)    │
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
3. Optionally create **people** rows (kids, pets) as *non-login* household persons — same as today’s Family list, but scoped to `household_id`.

### Family later (same schema)
- Invite → `household_invites` (code / magic link).
- Accept → new `household_members` row (`editor` / `viewer`).
- No new data model — only membership.

Distinguish:

| Concept | Meaning |
|---------|---------|
| **Member (login)** | Can open the app and sync (`household_members` ↔ `auth.users`) |
| **Person (profile)** | Child / pet / “Ishaan” for assignment — may have no login |

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

**Media (phase 2):** `media_objects (id, household_id, thing_id?, path, content_type, …)` + Storage path `media/{household_id}/{id}`. Local file cache mirrors path; upload from outbox when online.

### RLS (sketch)

- `authenticated` can `select/insert/update` rows where  
  `household_id in (select household_id from household_members where user_id = auth.uid())`
- Viewers: `select` only; editors/owners: mutate.
- Invites: restricted RPC (`accept_invite`) — no open table writes.

Keep existing `life_stores` / `life_recovery` only as a **temporary bridge** during migration (or drop after cutover). Do not extend blob sync.

---

## 5. Local store

### Recommendation
Move domain data from AsyncStorage arrays → **SQLite on device** (Expo SQLite or WatermelonDB).

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
Use NetInfo (or equivalent). **Never** throw to the user on save because push failed — save is local; sync badge can show “Pending (3)”.

---

## 7. Conflicts

**Default (v1): last-write-wins per row** using `client_mutated_at` (then `updated_at`).

- If remote `client_mutated_at` > local → remote wins (overwrite local).  
- If local outbox pending and remote also changed → **outbox wins for that row** after push (or compare timestamps and drop stale outbox). Document the choice and stick to it.

**Soft deletes:** syncing `deleted_at` removes/hides locally; never hard-delete until all members have pulled the tombstone (optional GC job later).

**Field-level merge** (e.g. name vs warranty date) is a later optimization — not required for solo or light Family.

---

## 8. Offline guarantees

| Action | Offline | Online later |
|--------|---------|--------------|
| Add Thing / expense / reminder | Local row + outbox | Push upsert |
| Edit / delete | Local + outbox | Push |
| Capture photo | Local file + local URI on Thing | Media upload outbox (phase 2) |
| Talk / Ask AI | Needs network (unchanged) | — |
| Invite accept | Needs network | — |
| Browse household data | Local cache | Pull refresh |

Talk/chat remains online-only; domain CRUD does not.

---

## 9. Migration from today’s app

### Phase A — Schema + solo household (no UI break)
1. Add migrations for households, members, people, things, …  
2. Keep AsyncStorage UI working.  
3. One-shot **import**: local inventory → `things` rows under new household; same for other modules.  
4. Dual-write optional: local save + outbox to new tables (feature flag).

### Phase B — Local SQLite + outbox
1. Replace Context persistence with SQLite repositories.  
2. Hydrate Context from SQLite (or query directly).  
3. Disable `life_stores` blob push for migrated users.

### Phase C — Family
1. Invites + RLS enforcement.  
2. Pull other members’ changes.  
3. Media sync policy (opt-in for IDs).

### Phase D — Remove bridge
1. Drop or freeze `life_stores` / recovery-blob path.  
2. Recovery = Sign in with Apple + household membership (plus optional encrypted export file).

**Client IDs:** generate UUIDs now for new local rows so offline creates survive upload without remapping.

---

## 10. What we explicitly will not do

- Extend whole-module JSON blobs as the Family sync design  
- Require network to add a Thing or set a reminder  
- Upload passport/Emirates ID images without an explicit media + privacy policy  
- Put Face ID / app-lock secrets in Postgres  

---

## 11. Implementation order (suggested)

1. **Doc + schema migrations** for household + `things` + `reminders` (highest value).  
2. **UUID ids** in local creates.  
3. **Outbox + push** for things/reminders only (prove airplane → online).  
4. **Pull + LWW.**  
5. Migrate remaining modules.  
6. SQLite local mirror if AsyncStorage becomes awkward.  
7. Apple auth + invites.

---

## 12. Relation to `docs/BACKEND.md`

`BACKEND.md` still describes **staging Git ↔ Supabase** and the **legacy** `life_stores` snapshot. Treat that snapshot as **transitional solo backup** only. New work follows **this** architecture; do not add features that deepen blob sync.
