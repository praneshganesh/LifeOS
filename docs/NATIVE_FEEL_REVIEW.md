# Native feel review

Tracks the design feedback from 11 October 2026 across every screen in Saavi.

## Feedback being addressed

| # | Feedback | Rule applied in the app |
| --- | --- | --- |
| F1 | ↗ arrows on rows read as “opens an external link.” | Drill-in rows use a chevron (›). Rows with no destination show nothing. |
| F2 | The white featured card on a dark screen reads as a banner or ad. | Featured and highlighted cards are tinted or elevated surfaces, never a light block on a dark page. |
| F3 | Underlined Today / Life tabs read as web or Android. | Switching between top-level views uses a segmented control. |
| F4 | The floating Capture / Ask / Talk pill has no material behind it. | Anything floating over content sits on a translucent blurred material. |
| F5 | Everything is a tap target. Big check buttons feel like web buttons. | Check controls are small, quiet rings. Rows that can be completed or snoozed support swipe right to complete and swipe left to snooze. |
| F6 | “Skating class class” is doubled, and the time repeats in the title and subtitle. | A class is named once. The time lives in the subtitle only. |
| F7 | PE uniform shows under both Done today and Coming up. | Anything done today is left out of Overdue, Today and Coming up. |
| F8 | A 9+ notification badge next to only 2 actionable items. | The bell shows a dot for unread notifications, not a count. |

Status: **Changed**, **Covered by shared component** (the screen picks up a fix from a shared component listed below), or **Checked, no change** (reviewed and none of F1–F8 apply).

### How screens were checked

Besides reading each screen touched below, the whole `app/` and `components/` tree was searched for the patterns behind the feedback:

- Link-style arrows (`ArrowUpRight`, `ArrowRight`, `ExternalLink`): the only uses were on Today. The remaining `ExternalLink` component is Expo starter code that no screen renders.
- Underline tab markers (thick bottom borders, 2px marker bars, `role="tab"`): only the Today / Life switch had one.
- Light-filled blocks (`colors.ink`, `colors.pure` or white fills): the only card was Today’s featured card. Every other use is a selected chip, a primary button, the camera shutter, or the appearance dot. All are expected native patterns. `colors.white` maps to the dark surface colour in dark mode.
- Elements floating over content (`position: 'absolute'`): the dock, and the back and delete buttons on a thing’s photo. The rest are decorative glows or gradients behind content.
- Bottom action bars on detail and create screens (`DetailStickyActions`) are docked edge to edge, not floating, which is the native pattern. No change.

## Shared components

| Component | Used by | Feedback | Status | What changed |
| --- | --- | --- | --- | --- |
| `components/ui/SwipeActions.tsx` (new) | Today, Tasks, Notifications, Habits, Classes, Activities | F5 | Changed | New full-swipe wrapper. Swipe right past 88px completes (green, check icon). Swipe left past 88px snoozes (amber, clock icon). Built on gesture-handler Pan plus Reanimated, the same stack as `SwipeableThingRow`. |
| `components/HomeSurfaceSwitch.tsx` | Today, Life | F3 | Changed | Underlined text tabs replaced with an iOS segmented control: a rounded track, the selected segment raised with a light shadow, and no underline. |
| `components/HomeHeader.tsx` | Today, Life | F8 | Changed | The bell shows a 9px coral dot when anything is unread, instead of a “9+” count. VoiceOver still reads the exact unread count. |
| `components/TalkOverlay.tsx` → `FloatingNav` | Today, Life, Things, Tasks, Habits, Classes, Expenses, Subscriptions, Reminders, Household and other list screens | F4 | Changed | The dock is now an `expo-blur` `BlurView` using `systemUltraThinMaterialDark` / `Light`, with a translucent tint. Ask and Talk buttons are transparent so the material shows through. Android, which has no live blur here, gets a 92% opaque fallback. |
| `components/ui/ListKit.tsx` → `ListRow` | Settings, Tasks, Notifications, Documents, Warranties, Insurance, Purchases, Vehicles, Maintenance, Reports, Household, Profile and others | F1, F5 | Changed | The ✕ dismiss button is gone. Rows that can be dismissed use swipe left to snooze, and can opt into swipe right to complete (`onComplete`). Every tappable row now shows a chevron. Swipe actions are also exposed as VoiceOver actions. |
| `components/HabitCard.tsx` | Habits list | F5 | Changed | Habit cards on the list support swipe right to check in (“Undo” if already done today). The small 18px check stays as the tap alternative. |
| `components/LastDoneActivityCard.tsx` | Activities (Done tab) | F5 | Changed | Activity cards support swipe right to log done. The small check stays. |
| `components/SwipeableThingRow.tsx` | Things, Room, Space, Person, Search | F5 | Checked, no change | Already swipe-based (swipe left reveals Edit / Delete). Nothing to complete or snooze on things. |
| `lib/attentionDismiss.ts` | Today, Tasks, Notifications | F5 | Changed | `dismiss(id, until?)` accepts a custom end time so Today can snooze until tomorrow. Adds `startOfTomorrow()` and `reload()` so Today picks up snoozes made on other screens. |
| `lib/dashboard.ts` | Today | F7 | Changed | Reminders logged today are filtered out of Overdue, Today and Coming up, so they appear once under Done today. Covered by a new test. |
| `lib/classes.ts` → `classLabel()` (new) | Attention items, class notifications | F6 | Changed | Adds “class” only when the title doesn’t already end in class, lesson, session, practice, training, tuition, coaching or course. |
| `lib/attention.ts` | Today, Tasks, Notifications, Talk agenda | F6 | Changed | Class title is now “Ishaan · Skating class today”. The time stays only in the subtitle (“12 sessions left · Every Sunday · 4:00 PM”). Also fixed “in 1 days”: subtitles now read “Due tomorrow”, “Renews today”, “warranty ends in 5 days” and so on. |
| `lib/classSchedule.ts` | Class push notifications | F6 | Changed | Notification titles use `classLabel()`. Fixed the body grammar: “Ishaan has Skating class tomorrow at 10:00 AM.” instead of “Ishaan has Skating class is tomorrow…”. |
| `lib/lastDoneNotifications.ts` | Reminder push notifications | F6 | Changed | “Due in 1 days” is now “Due in 1 day”. |

## Screens

### Home surfaces

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Today | `/` | `app/(tabs)/index.tsx` | Changed | **F1:** ↗ replaced with a chevron, and rows with no destination show nothing. **F2:** The white featured card is now a tinted dark card (`surfaceTint`, hairline border, 3px accent rail, “Up next” label, item icon). **F5:** The 32px filled check buttons are now 22px outline rings. Every open row supports swipe right to complete (habits and reminders) and swipe left to snooze until tomorrow. Snoozed rows are hidden, and the overdue / due-today pills count only visible rows. **F3, F4, F6, F7, F8:** come from the shared components. |
| Life | `/spaces` | `app/(tabs)/spaces.tsx` | Covered by shared component | Segmented control (F3), unread dot (F8) and blurred dock (F4). Module tiles are tinted dark cards with no arrows. |
| Ask | `/ask` | `app/(tabs)/ask.tsx` | Checked, no change | Chat screen. No arrows, light cards, tabs or check buttons. The dock is hidden here. |
| Search | `/search` | `app/(tabs)/search.tsx` | Checked, no change | Results use `SwipeableThingRow` and chevron rows. The input card fill is the dark surface. |
| Activities (Done tab) | `/done` | `app/(tabs)/done.tsx` | Covered by shared component | Activity cards support swipe right to log done (F5). |
| Talk tab (redirect) | `/talk` | `app/(tabs)/talk.tsx` | Checked, no change | Redirect only, no UI. |
| Capture tab (redirect) | `/capture-tab` | `app/(tabs)/capture-tab.tsx` | Checked, no change | Redirect only, no UI. |
| AI tab (redirect) | `/ai` | `app/(tabs)/ai.tsx` | Checked, no change | Redirect only, no UI. |
| Talk overlay | modal | `components/TalkOverlay.tsx` | Checked, no change | Full-screen voice orb on its own dark canvas. The white orb is the intended focal element, not a card. Not changed, per the standing decision to leave the orb alone. |

### Capture

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Capture | `/capture` | `app/capture.tsx` | Checked, no change | The white shutter ring is the standard camera control. Review cards use dark surfaces. The dock is hidden here. |

### Things and places

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Things | `/things` | `app/things/index.tsx` | Checked, no change | Already uses swipe rows (`SwipeableThingRow`). |
| Thing detail | `/asset/[id]` | `app/asset/[id].tsx` | Changed | **F4:** The back and delete buttons floating over the hero photo were solid circles. They now sit on a blurred material (`systemThinMaterial`) with a translucent tint. |
| Edit thing | `/asset/edit/[id]` | `app/asset/edit/[id].tsx` | Checked, no change | Form screen with a docked save bar. |
| Space detail | `/space/[id]` | `app/space/[id].tsx` | Checked, no change | Swipe rows and chevrons already. |
| Create space | `/space/create` | `app/space/create.tsx` | Checked, no change | Form screen with a docked action bar. |
| Edit space | `/space/edit/[id]` | `app/space/edit/[id].tsx` | Checked, no change | Form screen with a docked action bar. |
| Room | `/room/[id]` | `app/room/[id].tsx` | Checked, no change | Swipe rows already. |
| Documents | `/documents` | `app/documents/index.tsx` | Covered by shared component | `ListRow` chevrons. |
| Warranties | `/warranties` | `app/warranties/index.tsx` | Covered by shared component | `ListRow` chevrons. Subtitles read “ends tomorrow” instead of “in 1 days”. |
| Insurance | `/insurance` | `app/insurance/index.tsx` | Covered by shared component | `ListRow` chevrons. |
| Insurance detail | `/insurance/[id]` | `app/insurance/[id].tsx` | Checked, no change | Detail fields only. |
| Purchases | `/purchases` | `app/purchases/index.tsx` | Covered by shared component | `ListRow` chevrons. |
| Purchase detail | `/purchases/[id]` | `app/purchases/[id].tsx` | Checked, no change | Detail fields only. |
| Vehicles | `/vehicles` | `app/vehicles/index.tsx` | Covered by shared component | `ListRow` chevrons. |
| Maintenance | `/maintenance` | `app/maintenance/index.tsx` | Covered by shared component | `ListRow` chevrons. |

### Daily life

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Tasks & reminders | `/tasks` | `app/tasks/index.tsx` | Changed | **F5:** The ✕ button is replaced by swipe left to snooze (one week, as before) and, for reminders, swipe right to mark done. Rows with a destination show a chevron. |
| Reminders (Last done) | `/last-done` | `app/last-done/index.tsx` | Checked, no change | Composer and picker screen. Its checkmarks show selection state in pickers; they aren’t completion buttons. Selected chips use ink, the native selected-chip pattern. |
| Reminder detail | `/last-done/[id]` | `app/last-done/[id].tsx` | Checked, no change | Detail with a docked action bar. |
| Habits | `/habits` | `app/habits/index.tsx` | Covered by shared component | Habit cards support swipe right to check in (F5). |
| Habit detail | `/habits/[id]` | `app/habits/[id].tsx` | Checked, no change | Interactive heatmap. Swiping would fight the calendar, so swipes are off on detail. The small check stays. |
| Create habit | `/habits/create` | `app/habits/create.tsx` | Checked, no change | Form screen. |
| Classes | `/classes` | `app/classes/index.tsx` | Changed | **F5:** The filled “Log session” / “Today ✓” text button on every card is now a 22px ring, filled green with a check once logged. Swipe right on a card logs today’s session (“Undo” if already logged). |
| Class detail | `/classes/[id]` | `app/classes/[id].tsx` | Checked, no change | Attendance is logged from detail with a docked action. |
| Create class | `/classes/create` | `app/classes/create.tsx` | Checked, no change | Form screen. |
| Notifications | `/notifications` | `app/notifications/index.tsx` | Changed | **F5:** Due-soon rows lose the ✕ button and gain swipe left to snooze, plus swipe right to complete reminders. Also switched to theme-aware colours via `useTheme`, matching the other screens. **F8:** The bell on Today / Life now shows a dot instead of a count. |

### Money

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Expenses | `/expenses` | `app/expenses/index.tsx` | Checked, no change | List of expense rows with chevrons. No completion actions. |
| Expense detail | `/expenses/[id]` | `app/expenses/[id].tsx` | Checked, no change | Detail fields. |
| Add expense | `/expenses/create` | `app/expenses/create.tsx` | Checked, no change | Form screen. |
| Subscriptions | `/subscriptions` | `app/subscriptions/index.tsx` | Checked, no change | Rows with chevrons. Renewal subtitles read “Renews tomorrow” instead of “in 1 days”. |
| Subscription detail | `/subscriptions/[id]` | `app/subscriptions/[id].tsx` | Checked, no change | Detail fields. |
| Add subscription | `/subscriptions/create` | `app/subscriptions/create.tsx` | Checked, no change | Form screen. |
| Reports | `/reports` | `app/reports/index.tsx` | Covered by shared component | `ListRow` chevrons. |

### Household

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Household | `/family` | `app/family/index.tsx` | Changed | **F1:** Member rows open a person’s page but had no drill-in hint. Added a chevron. |
| Person detail | `/family/[id]` | `app/family/[id].tsx` | Checked, no change | Uses swipe rows for linked things. |
| Add person | `/family/create` | `app/family/create.tsx` | Checked, no change | Form screen. |
| Invite | `/invite` | `app/invite/index.tsx` | Checked, no change | Share sheet screen. |
| Accept invite | `/invite/[code]` | `app/invite/[code].tsx` | Checked, no change | Single confirm screen. |
| Profile | `/profile` | `app/profile/index.tsx` | Covered by shared component | `ListRow` chevrons. |

### Settings and plan

All Settings screens use grouped `ListRow` lists, which already had chevrons. None had arrows, light cards, tabs or check buttons.

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Settings | `/settings` | `app/settings/index.tsx` | Checked, no change | Grouped list with chevrons. |
| Account | `/settings/account` | `app/settings/account.tsx` | Checked, no change | |
| Plan | `/settings/plan` | `app/settings/plan.tsx` | Checked, no change | |
| Notifications settings | `/settings/notifications` | `app/settings/notifications.tsx` | Checked, no change | Toggles. |
| Appearance | `/settings/appearance` | `app/settings/appearance.tsx` | Checked, no change | The ink dot marks the selected option. |
| Homes & defaults | `/settings/homes` | `app/settings/homes.tsx` | Checked, no change | Ink selected chips. |
| Privacy | `/settings/privacy` | `app/settings/privacy.tsx` | Checked, no change | |
| Privacy policy | `/settings/privacy-policy` | `app/settings/privacy-policy.tsx` | Checked, no change | Text page. |
| Terms | `/settings/terms` | `app/settings/terms.tsx` | Checked, no change | Text page. |
| Security | `/settings/security` | `app/settings/security.tsx` | Checked, no change | Toggles. |
| Export & backup | `/settings/data` | `app/settings/data.tsx` | Checked, no change | |
| Sharing | `/settings/sharing` | `app/settings/sharing.tsx` | Checked, no change | |
| About | `/settings/about` | `app/settings/about.tsx` | Checked, no change | |
| Paywall | `/paywall` | `app/paywall.tsx` | Checked, no change | The underlined Terms and Privacy Policy links are legal links inside a sentence, which is correct on iOS. |

### Onboarding

Redesigned to feel like a personal app rather than a setup wizard. It borrows the app's own look: the dotted, tinted Life tiles, pill-shaped buttons, big friendly type, pager dots instead of a progress bar, and soft staggered entrance animations. Each step draws its own round back button and dots (no native header). Shared pieces live in `components/OnboardingKit.tsx`.

The flow is now Welcome, then four short steps, then a finish screen. Currency and quiet hours were merged into one screen, and your name is asked first so later screens can use it.

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Welcome | `/onboarding` | `app/onboarding/index.tsx` | Redesigned | A loose pile of Life tiles springs in at the top. Headline “Life at home, all in one calm place.” The trial is a small pill (“Free for 7 days. No card needed.”), with a “Let’s get started” pill button and “Private by default. Never sold.” |
| Name | `/onboarding/name` | `app/onboarding/name.tsx` | New | Step 1. “First, what should we call you?” with one large borderless name field. Saves your profile name and your own household entry, and updates it instead of duplicating if you come back. Skippable. |
| Household | `/onboarding/family` | `app/onboarding/family.tsx` | Redesigned | Step 2. “Who’s at home with you, Pranesh?” Four colored circles (Partner, Child, Parent, Pet); tap one and a pill-shaped name field slides in. People appear as avatar chips with their initial and can be removed. They are saved as you add them, so going back and forward never duplicates anyone. The button reads “It’s just me” until someone is added. |
| Intent | `/onboarding/intent` | `app/onboarding/intent.tsx` | Redesigned | Step 3. “What would you like a hand with?” Each option is a mini Life tile in that module’s color with its icon; picking one adds an accent ring and a check that pops in. Friendlier labels (“My things”, “Small daily wins”, “Everyone at home”). The button reads “Skip for now” until something is picked. |
| Two quick things | `/onboarding/details` | `app/onboarding/details.tsx` | New | Step 4. Currency (guessed from your region, tap to open a set of currency pills) and quiet nights (From and Until times) in two cards. Button “Looks good”. |
| You’re all set | `/onboarding/how-it-works` | `app/onboarding/how-it-works.tsx` | Redesigned | “You’re all set, Pranesh.” A replica of the real bottom bar, then Capture, Ask, and Talk, with example messages shown as chat bubbles. Button “Let’s go”. |
| Currency, Quiet hours | `/onboarding/currency`, `/onboarding/quiet-hours` | `app/onboarding/{currency,quiet-hours}.tsx` | Redirect | Merged into Two quick things; old links redirect there. |
| Home, Capture intro, Talk intro | `/onboarding/home`, `/onboarding/capture`, `/onboarding/talk` | `app/onboarding/{home,capture,talk}.tsx` | Checked, no change | Redirects left over from older versions of the flow. Nothing links to them. |

### System

| Screen | Route | File | Status | What changed |
| --- | --- | --- | --- | --- |
| Not found | any unknown route | `app/+not-found.tsx` | Checked, no change | |

## Verification

- `npx tsc --noEmit`: clean.
- `npm test`: 305 tests pass, including one for the em dash cleanup. New tests cover “Skating class” not doubling and a reminder done today staying out of Coming up. Class notification tests were updated for the corrected wording.
- Checked in the browser (web build, dark mode, phone width) with sample data:
  - Segmented control on Today and Life.
  - Tinted “Up next” card.
  - Chevrons on rows.
  - The class reads “Ishaan · Skating class today”.
  - PE uniform appears only under Done today.
  - The dock renders with backdrop blur.
  - Swipe left on “Water plants” snoozed it until midnight.
  - Swipe right on “Meditate” moved it to Done today.
  - The Classes list shows the quiet ring instead of the “Log session” button.
- Walked the redesigned onboarding in the browser at phone size (390 by 844, dark mode): Welcome, name, adding and removing a pet, picking two intents, opening the currency picker, and the finish screen. Every screen fits without scrolling.
- Not yet checked on a device: blur intensity on iOS, and swipe feel next to vertical scrolling. Both need a TestFlight or dev build.

## Em dashes

The app no longer shows em dashes.

- User-facing text: every message, toast, empty state, and accessibility label that used an em dash was rewritten with a comma, colon, or period. This includes the Talk and Ask replies built in code (for example “Logged Coffee for AED 25.”).
- AI replies: the chat prompt tells the model not to use em dashes, and any that slip through are replaced on the server (`stripEmDashes` in `server/chat.mjs`) and again in the app (`lib/chat/applyActions.ts`), so older server deployments are covered too.
- Empty values: the app stores `—` internally to mean “no value” on Things (price, serial, room and similar). That marker stays in storage so existing and synced data keep working, but it is no longer displayed. Subtitles skip it (`hasValue` in `lib/inventoryNormalize.ts`), the Thing detail facts show “Not set”, the Today tiles show 0, Habits shows 0d, Purchases shows None, and the paywall shows “Unavailable” when a price can’t load.
- Code comments and docs: rewritten with plain punctuation, including the public privacy and terms copy.
- What still contains `—`: the stored “no value” marker and checks against it, the OCR pattern that reads ID numbers printed with dashes, and test inputs that check the cleanup.

