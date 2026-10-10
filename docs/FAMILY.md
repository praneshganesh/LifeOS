# Family — parked for after the Pro launch

Saavi launches with **Pro only**. Family (a second paid login that shares one household) is not sold, not on the paywall, and not invited. This file is the record of that cut: what left the product, why, what is still broken, and how to build Family when it comes back.

People in the home (a child, a pet, “Ishaan”) are **not** Family. Those tags stay. They never needed a second login.

Older notes: [`FAMILY_SHARING.md`](./FAMILY_SHARING.md) (scenarios), [`SUBSCRIPTIONS_AND_INVITES.md`](./SUBSCRIPTIONS_AND_INVITES.md) (the invite button flow). Those describe the unfinished design. This file is what launch actually does.

## Why it is out

Family was on the paywall before the sharing model worked.

- An invite created on one phone often never reached the server, so the other phone could not join.
- Joining did not move that phone onto the owner’s household. Each person kept syncing their own trial household.
- The member’s `profiles.plan_id` stayed `trial`. The phone could still unlock itself from a local “I joined” flag, with no check that the owner’s subscription was alive.
- Seats were counted on the owner’s phone, not in Postgres. A fifth login could get in.
- There is no audience on a row. Both logins would see every Thing, class, habit, and reminder. Notifications would fire on both phones.
- “Me” is not tied to a login, so two adults would both bind to the same person.
- Android has no Sign in with Google. A seat on an anonymous id dies on reinstall.

Shipping that as a paid plan would charge for a share that does not share.

## What we removed from the product

| Surface | What launch does |
|---|---|
| Paywall | Pro monthly / yearly only. Family card is gone. |
| Settings → Plan | Pro only. “Invites & sharing” is gone. |
| Settings → Sharing | The row is gone. The route, if opened, says sharing is not in this version. |
| People screen | People stay. The permissions / invite block is gone. |
| `/invite` and `/invite/:code` | Do not accept a code. They say sharing is not available. |
| Entitlements | `family` and a joined-member flag do not unlock a separate plan or invites. A stored `family` tier is treated as Pro. |
| RevenueCat | Family packages are dropped from the offering list the app shows. A Family entitlement id, if one is still active, is recorded as Pro. |
| Webhook | `entitlement_ids` of `family` writes `profiles.plan_id = pro`. |
| Database | Rows with `plan_id = family` are updated to `pro`. The check constraint still allows `family` so an old client cannot crash the write. |

Person tags, homes, and the household as the sync container for **one** login stay. That household is how a single Pro account syncs. It is not a shared Family seat.

## Pro Talk limit

Trial is **25** Talk turns a day.

Pro is **100** Talk turns a day. A heavy day here is a morning brief, a few things added, and a handful of questions, so 100 is headroom, not expected use. Someone who hits it every day is about $3 of API for the month: monthly still covers that after Apple, yearly is about even to a little short. Things, homes, and people stay unlimited. Manual capture stays unlimited. Lapsed stays 0. Paywall and Settings show 100.

The same 100 applies if a leftover `family` plan id is still in the limit function. Launch does not keep the old shared pool of 80.

## Gaps (still true in the code we did not delete)

These are why Family cannot be switched back on by re-showing the paywall card.

1. **Invite never reaches the other phone.** Settings used to call `createInvite` without a household id, so the code was stored on the owner’s phone. Accept looks it up on the server.
2. **Accept does not switch household.** It inserts a second `household_members` row and leaves the old one. Sync keeps the oldest household. Her phone never reads his rows.
3. **Her plan stays her own plan.** Accept does not copy the owner’s entitlement. Talk limits read `profiles.plan_id` on the signed-in user.
4. **A lapsed owner did not lock the member.** The old member shortcut granted access from a flag on the phone. Launch removed that shortcut, so a joined login follows their own trial or Pro.
5. **Seats are not enforced on the server.** `FAMILY_LOGIN_SEATS` (4) lived in app storage. `create_household_invite` does not count members.
6. **No audience.** RLS lets every household member read every domain row. Today, Talk, and notifications have no per-login filter. A private class would still be in the model prompt.
7. **“You” is not a login.** `selfMember` picks a person by relation. Two adults can both be “me”.
8. **No durable Android identity.** The post-join prompt is Sign in with Apple and is skipped off iOS.
9. **Links are not universal.** The share URL is an app scheme, so a tap in Messages does not open Saavi until `https://saavi.app/invite/...` exists.

## How Family should be built

Do this in order. Do not put the SKU back on the paywall until 1–4 work on two phones.

1. **One household per login.** Accepting an invite sets this account’s only `household_members` row to the owner’s household and clears the sync cursor (`resetSyncStateForUser`). Rows already in the old household stay there. They are not copied.
2. **The seat follows the owner’s subscription.** While the owner’s Family entitlement is active, members have app access and draw from one household Talk pool. When it ends, members see the subscription-ended paywall. They do not start a new trial. Their old household is not restored automatically.
3. **Server seat count.** `create_household_invite` and `accept_household_invite` refuse a login past owner + 3. The owner’s phone reads that count from the server.
4. **Identity.** iOS: Sign in with Apple before the seat is considered durable. Android: Google sign-in, or do not offer a seat. Anonymous ids are not seats.
5. **About vs audience.** About is who the row is for (already on classes, habits, reminders). Audience is which logins may see it, enforced in RLS, not only on one phone. The creator can always open a row they created. A private row never syncs to the other phone and is not sent to Talk.
6. **Defaults.** A row about a person with no login (a child, a pet) is visible to both logins. A row about the signed-in user starts private. A row explicitly for the other adult starts with that login.
7. **Check-in.** Anyone in the audience can check in. One log clears it for every login who can see it.
8. **“Me”.** The person row for the signed-in user stores `user_id`. Talk’s “I attended” uses that row, not “the owner person”.
9. **Links.** Universal link `https://saavi.app/invite/<code>`, single use, hashed, 7-day TTL, owner-only create.
10. **Billing.** A separate Family entitlement and product (`saavi_family_monthly` / `saavi_family_yearly`). The webhook may raise `trial` or `pro` to `family`. Members do not purchase. Pro stays one login. Talk for Family is one shared daily pool on `household` scope, sized when we know real Pro usage (100 is the solo guard, not the shared number).

## RevenueCat — hide Family so the phone cannot buy it

The app already ignores Family packages. Do this in RevenueCat as well, or a restore on an old build can still see the product.

1. Open the RevenueCat project → **Product catalog** → **Offerings**.
2. Open the **current** offering (the one the paywall loads).
3. Remove the Family packages (`family_monthly`, `family_annual`, or whatever identifier maps to `saavi_family_monthly` / `saavi_family_yearly`). Leave the Pro monthly and yearly packages.
4. Save the offering. The app calls `getOfferings()` and only renders what is in `current`.
5. Do not delete the Family entitlement or the App Store products yet. Existing sandbox subscribers keep access, and the app treats that entitlement as Pro until you turn the SKU back on.
6. In App Store Connect, you can also set the Family subscription to **Removed from Sale** if you do not want it offered anywhere, including a custom code. Do that only after no TestFlight tester still needs that product. Removing from sale does not cancel an active sandbox subscription by itself.

After step 3, force-quit the app so the next offerings fetch drops Family. Pro monthly and yearly should be the only prices on the paywall.
