# Saavi (LifeOS)

Expo app for household inventory, habits, classes, reminders, and Talk.

## Local development

```bash
npm install
npm start          # Expo dev server
npm run ios        # iOS simulator
npm run android    # Android emulator
npm run web        # Web
npm test           # Unit tests
```

## Store builds (EAS)

Requires [EAS CLI](https://docs.expo.dev/build/setup/) (`npx eas-cli` or global `eas`), an Expo account, and Apple / Google store credentials.

Profiles live in `eas.json`:

| Profile | Purpose |
| --- | --- |
| `production` | App Store / Play Store + TestFlight / Play internal testing. Auto-increments build number. |
| `preview` | Internal distribution (APK / ad-hoc). Not for public store listing. |
| `development` | Dev client on a physical device. |
| `development-simulator` | Dev client for iOS Simulator only. |

### iOS → TestFlight / App Store

| Command | What it does |
| --- | --- |
| `npm run build:ios:submit` | **Usual path.** Cloud-build a production iOS binary, then auto-submit to App Store Connect (appears in TestFlight after Apple processing). |
| `npm run build:ios` | Production iOS build only. Does **not** upload to TestFlight. |
| `npm run submit:ios` | Submit the **latest** successful iOS production build to App Store Connect / TestFlight. |
| `npm run build:ios:preview` | Internal/preview iOS build (not the production TestFlight pipeline). |

One-liner equivalent:

```bash
npx eas-cli build --platform ios --profile production --auto-submit
```

After submit, processing usually takes a few minutes. Track it in [App Store Connect → TestFlight](https://appstoreconnect.apple.com/apps/6805518688/testflight/ios).

### Android → Play Console

| Command | What it does |
| --- | --- |
| `npm run build:android:submit` | Cloud-build a production Android binary, then auto-submit to Google Play (needs Play credentials configured in EAS). |
| `npm run build:android` | Production Android build only (AAB). Download from the EAS build page or install via EAS. |
| `npm run submit:android` | Submit the **latest** successful Android production build to Play Console. |
| `npm run build:android:preview` | Internal preview build (handy for sideloading / early QA). |

One-liner equivalent:

```bash
npx eas-cli build --platform android --profile production --auto-submit
```

### Tips

- Run builds from a clean git state you intend to ship; EAS builds from the current project (and linked git metadata).
- Env vars like `EXPO_PUBLIC_REVENUECAT_IOS_KEY` must be set in **EAS secrets / environment** for the profile; local `.env` is not baked into cloud builds.
- `npm start` / web / localhost cannot exercise real StoreKit or Play Billing; use a device build (TestFlight or Play) for purchase testing.
