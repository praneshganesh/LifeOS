# Family sharing — gaps and scenarios

> Launch note: Family is not sold. The current cut, the gaps, and how to build it are in [`FAMILY.md`](./FAMILY.md). This file is the earlier scenario list.

What Family has to do, what the app does today, and the scenarios each fix has to pass.

Related: [`SUBSCRIPTIONS_AND_INVITES.md`](./SUBSCRIPTIONS_AND_INVITES.md) (plans and the invite UI), [`SYNC_ARCHITECTURE.md`](./SYNC_ARCHITECTURE.md) (household as the sync boundary), [`AUTH_APPLE.md`](./AUTH_APPLE.md) (Sign in with Apple).

This document is the source of truth for the Family work. The invite section in `SUBSCRIPTIONS_AND_INVITES.md` describes the intended button flow. The behavior below is what the code does now.

## 1. Words

| Word | What it is |
|------|------------|
| **Account** | One login. `auth.users` plus one `profiles` row. Created on first online launch, including an anonymous trial. Subscription and Talk limits hang off this row. |
| **Household** | The shared data container. Things, classes, reminders, habits, expenses, and people tags carry `household_id`. |
| **Login / seat** | An account in `household_members` (owner, editor, viewer). Family allows 4: the owner plus 3. |
| **Person** | A name tag inside the household (Ishaan, a pet, an adult). Stored as a person row. No login, so a person is never a seat. |
| **About** | Who a row is for (`personId` / `assignedTo`). Already on classes, habits, and reminders. A label, not a permission. |
| **Audience** | Which logins may see the row. Does not exist yet. |

A trial already creates an account and, on first sync, a household of one. Two phones on trial are two accounts and two households.

Person tags in the app (`lib/household.ts`, `HouseholdMember`) are not login seats. The `permission` field on those tags is a local stub and is not the seat role in `household_members`.

## 2. Rules to build

### One household per login

Accepting an invite moves that login onto the owner's household and stops syncing the old one. Rows already in the old household stay there. They are not copied in.

### The seat follows the owner's Family plan

The owner pays. Invitees are not charged. Access lasts while the owner's Family entitlement is active. When it ends, members lose access and see the subscription-ended paywall. They do not start a new trial. The pre-join household is not restored automatically.

### About and audience are different

- **About** is the person the row is for. Ishaan can be the subject and still have no login.
- **Audience** is which logins can see it: only me, only her, or both.

A person with no login cannot be an audience. Ishaan's class is still a parent row. The parents choose who sees it.

The creator can always open and edit a row they created. Today and notifications follow the audience. A reminder created for her stays off the creator's Today and does not alert the creator.

A private row is excluded in the database. Filtering it only on one phone is not enough, because the other phone would still sync it.

### Defaults

| How it is created | Audience |
|-------------------|----------|
| About a person with no login (Ishaan, a pet) | Both logins |
| About the signed-in user, or with no person | Only the creator |
| Explicitly addressed to the other adult | That login |
| Changed later on the row | Whatever was picked |

### Check-in

Anyone in the audience can check in. One log on the shared row clears it for every login who can see it.

### What stays visible to every login

People (so both parents can see Ishaan), spaces, and rooms. Medical notes live on the person row and are visible to every login until a later rule says otherwise.

## 3. What the code does today

### Invite never reaches the other phone

`app/settings/sharing.tsx` calls `createInvite({ permission: 'editor' })` with no household id. `lib/invites/api.ts` only calls `create_household_invite` when a household id is passed. Otherwise the code is written to AsyncStorage on the owner's phone.

The other phone calls `accept_household_invite`. The server has never stored that code, so accept returns "invalid or expired" and stops. The local-code fallback reads the acceptor's own AsyncStorage, which does not contain the code.

The database function itself is fine: one code, hashed, 7-day TTL, single use, owner-only. The button never uses it.

The shared link is an Expo scheme (`invite/<code>`), not `https://saavi.app/invite/...`. A tap from Messages or WhatsApp does not open Saavi until universal links exist.

### Accept does not switch household

`accept_household_invite` inserts a second `household_members` row. It does not remove the old one.

`ensure_household` returns the oldest membership. After a trial, that is her own household.

The phone also caches `lifeos:sync:household:v1` and keeps using it. Accept only writes `lifeos:membership:v1` via `joinAsMember`. It never calls `resetSyncStateForUser`. Her phone keeps reading and writing her trial household. His rows never appear. Hers never move.

### Her plan stays trial

`profiles.plan_id` is per account. Accept does not set it to `family`. The paywall opens because `computeEntitlement` sees a local `isHouseholdMember` flag and grants `hasAccess` before it looks at plan. That flag is on the phone.

`get_ai_allowance` reads `profiles.plan_id`. A member still on `trial` gets 25 Talk turns on her own user counter. The Family pool (80, household scope) runs only when `plan_id` is `family`.

### A lapsed owner does not lock the member

The member short-circuit returns access with no check of the owner's entitlement. His subscription ending does not clear her local flag.

### Seats are a local counter

`FAMILY_LOGIN_SEATS` is 4, counted in AsyncStorage on the owner's phone. The counter increments only in the same-device local accept path. A cloud accept on her phone does not increment it. `create_household_invite` does not count members. The server will accept a fifth login.

### "You" is not tied to a login

`selfMember` picks the person whose relation matches "You", else the owner person. Talk's "I attended" uses that person. After two adults share one household, both phones can bind "me" to the same person. There is no `user_id` on the person row.

### Audience does not exist

RLS allows every household member to select every domain row (`user_household_ids()`). Today (`lib/dashboard.ts`) lists the whole household. Another person's name is a subtitle. It does not hide the row.

Reminders on Today use "Due today" and do not show who they are for. Class rows prefix the person name in the title for everyone. Habit rows show the other person's name as a subtitle.

Notifications (`lib/classNotifications.ts`, `lib/lastDoneNotifications.ts`) schedule on every phone that has the row. There is no per-login filter.

Talk sends the household lists it was given. A private class still in the payload is visible to the model and can be spoken back.

Viewer is select-only in RLS. The invite is hard-coded to editor. The client does not enforce viewer (`SUBSCRIPTIONS_AND_INVITES.md` lists that as not in v1). Person-tag permission in `lib/household.ts` is a separate stub.

### Android has no durable identity

The post-join prompt is Sign in with Apple, and it is skipped when `Platform.OS !== 'ios'`. There is no Google sign-in. Her seat is the anonymous user id. Reinstall creates a new anonymous user. The seat, and anything tied to the old id, is gone.

## 4. Scenarios

Each scenario states the required outcome. "Today" means current code.

### Join

**S1. Both on trial, then he subscribes and invites her.**
He is on iPhone, she is on Android. Each has a trial account and a household. He buys Family and sends an invite. She opens it with the account she already has, is not charged, and her phone syncs his household.
Today: the code never hits the server. She sees "invalid or expired."

**S2. She already created classes and reminders.**
Those rows stay in her old household. They do not appear in his. After accept, her phone shows his household only.
Today: accept does not move her sync target, so she would keep seeing only her own rows even if the code worked.

**S3. She taps the link from WhatsApp.**
With Saavi installed, the link opens the accept screen with the code filled in.
Today: the link is an app scheme, not a universal link.

**S4. The code is expired, already used, or mistyped.**
Accept fails with a clear error. No membership change.

**S5. She accepts the same code twice.**
The second time fails. She is not given a second seat.

**S6. He is on trial or Pro.**
Invite is blocked until Family is active. Person tags stay available. A failed upgrade does not create a code.

**S7. She is the member and tries to invite.**
Blocked. Only the owner invites.

**S8. Four logins already, he invites a fifth.**
Blocked on the server and in the UI. Removing a login frees a seat. The owner's phone shows the real remaining count after a cloud accept, including an accept that happened on her phone.

**S9. She accepts while offline.**
Accept fails and asks her to retry online. It must not write a local-only "joined" flag that unlocks the app without a server membership.

**S10. She reinstalls Saavi.**
She signs in with the same identity, lands on his household, and keeps the seat. On iPhone that identity is Sign in with Apple, linked to the anonymous id she joined with. On Android there is no equivalent yet, so a reinstall is a new anonymous user and the seat is lost.

**S11. His Family subscription ends.**
She loses access on the next refresh and sees "Your subscription has ended." She is not given another trial. His own phone follows the existing lapsed rules. Her pre-join household is not switched back on by itself.
Today: her local member flag keeps `hasAccess` true.

**S12. He removes her login.**
She loses his household on the next sync. Her seat is free. Rows she could see disappear from her phone. Rows only she could see are removed from his phone if he was not the creator and not in the audience. Creator-owned private rows stay with the creator.

**S13. Two owners.**
Not supported. One household has one owner. Recovery-code claim must not make the invitee a second owner of his household.

### Who sees a row

**S14. His own class.**
He subscribes to a class for himself. She does not see it in Classes, Today, notifications, search, or Talk. She cannot check in.
Today: she would see it, titled with his name, and her phone would notify.

**S15. Ishaan's class.**
The pack is about Ishaan. Both see it. Either can add a session and check in. After one check-in today, it leaves both Todays and both show the same attendance.
Today: this is already how a shared row behaves, once they are in the same household. There is no way to make S14 private while keeping S15 shared.

**S16. He later marks Ishaan's class as only his.**
Her phone drops it on the next sync, including a copy already stored locally. His phone keeps it. A later switch back to both puts it on her phone again.

**S17. Reminder for both.**
Due today, it is on both Todays and both phones notify. Either can mark it done. Done shows for both.

**S18. Reminder for himself.**
Only his Today, only his notification. Marking it done does not appear on her phone.

**S19. He creates a reminder for her.**
It is on her Today and her phone notifies. He still sees it in the reminder list and can edit it. It is not on his Today and his phone does not alert. When she marks it done, his list shows it done.

**S20. Reminder with no person.**
Audience is only the creator, until someone sets Both or the other adult.

**S21. Habit about Ishaan.**
Same audience default as his class: both see it, either can check in, one check-in clears both Todays.

**S22. Habit about himself.**
Only he sees it and only he can check in.

**S23. Talk on her phone.**
"What classes are today?" names Ishaan's class and does not name his private class. "Remind me to call the school" creates a reminder for her, not for him. "Remind him to…" creates S19. "Ishaan has piano tomorrow" creates S15.

**S24. She edits a row she cannot see.**
The server rejects it. The phone never offered the row.

**S25. Viewer seat.**
A viewer sees rows in their audience and cannot insert, edit, check in, or delete. The default invite stays editor until the owner picks viewer.

### Identity of "me"

**S26. Each adult has their own person.**
His "me" and her "me" are two person rows, each linked to that login. Ishaan stays unlinked. After she joins, his phone still resolves "I" to him, and hers resolves "I" to her.

**S27. He assigns a class to her by name.**
About is her person. Default audience is her login (S19's rule). He can switch audience to both.

## 5. Work, in order

Nothing in section 5.2 matters until section 5.1 is true. A visibility flag on two households that never joined does not share Ishaan's class.

### 5.1 One shared household

1. Pass the owner's household id into `createInvite`, and surface a real error when the RPC fails. Stop writing a code that only exists on his phone.
2. On accept, make this login a member of that household and stop using the previous one. Point `lifeos:sync:household:v1` at the new id and resync. Do not copy her old rows in.
3. Enforce one active household per login in the database, so `ensure_household` cannot keep returning the trial household.
4. Reject accept when the code is missing, expired, or used. Do not unlock the app from a local flag.
5. Count seats in `household_members` inside `create_household_invite`. Cap at 4. Drive the Sharing screen from that count.
6. When the owner is no longer Family (expired, paused, or removed), members lose access and get the subscription-ended paywall. No new trial. Clear the local member short-circuit that ignores plan.
7. Give the member Family Talk limits from the owner's household pool while the seat is active, and trial limits when it is not. `profiles.plan_id` on her row must not be the only switch, because she did not buy Family.
8. Universal link `https://saavi.app/invite/<code>` so a message opens the accept screen.
9. Sign in with Apple stays the iPhone way to keep the seat. Android needs a durable sign-in (Google) that preserves the same user id, or a reinstall drops the seat.
10. Removing a member revokes the seat and the next sync drops rows they can no longer see.

### 5.2 Audience

11. Link each adult person to `auth.uid`. "I" and "me" resolve through that link. Children and pets stay unlinked.
12. Add audience on shared domain rows (classes, reminders, habits, things, expenses, subscriptions). Values: only this login, only that login, or every login in the household. Creator always retains read and edit.
13. Enforce audience in RLS, not only in the UI. A login outside the audience cannot select the row. Sync must delete a local copy when this phone loses access (S16).
14. Defaults from section 2, with an explicit control on create and edit.
15. Today, search, and notification scheduling use the same filter. Both-audience check-in stays one shared log (S15, S17, S21).
16. Talk context and action targets use the same filter, and first-person actions bind to the speaking login's person (S23, S26).
17. Viewer seats are select-only, including check-in.

## 6. Out of scope here

- Multiple households per login (a second home he can switch to).
- Extra seat products beyond 4.
- Hiding a person, a space, or a room from one login.
- A separate audience for medical notes.
- Play Billing setup. That is required for her to purchase on Android, not for her to join his Family seat.
