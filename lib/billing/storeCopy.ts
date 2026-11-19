import { Platform } from 'react-native';

/** Store billing copy. iOS strings stay Apple-only; Android never mentions Apple. */
export function storeIsApple(): boolean {
  return Platform.OS === 'ios';
}

export function trialSubscribeLine(): string {
  return storeIsApple()
    ? 'Full access while you try Saavi. Subscribe anytime with Apple.'
    : 'Full access while you try Saavi. Subscribe anytime with Google Play.';
}

export function cancelRenewalLine(): string {
  return storeIsApple()
    ? 'Cancel in Apple Settings to stop the next renewal. The period you already paid for stays active until it ends.'
    : 'Cancel in Google Play to stop the next renewal. The period you already paid for stays active until it ends.';
}

export function billingUnavailableTitle(): string {
  return storeIsApple() ? 'Apple billing' : 'Google Play billing';
}

export function billingUnavailableBody(): string {
  return storeIsApple()
    ? 'Subscriptions need a TestFlight or App Store build with billing connected.'
    : 'Subscriptions need a Play Store build with billing connected.';
}

export function restoreUnavailableBody(): string {
  return storeIsApple()
    ? 'Restore works on TestFlight or App Store builds once billing is connected.'
    : 'Restore works on a Play Store build once billing is connected.';
}

export function chargeFinePrint(): string {
  return storeIsApple()
    ? 'Charged to your Apple ID. Renews automatically until you cancel in Apple Settings. Cancel stops the next charge. It does not refund the current period.'
    : 'Charged to your Google Play account. Renews automatically until you cancel in Google Play. Cancel stops the next charge. It does not refund the current period.';
}

export function manageSubscriptionLabel(): string {
  return storeIsApple()
    ? 'Manage subscription in Apple Settings'
    : 'Manage subscription in Google Play';
}

export function manageSubscriptionUrl(): string {
  return storeIsApple()
    ? 'https://apps.apple.com/account/subscriptions'
    : 'https://play.google.com/store/account/subscriptions';
}

/** Short line under Settings → Account → Delete account. */
export function deleteAccountSubtitle(): string {
  return storeIsApple()
    ? 'Deletes your login, the saved home record, and this phone. Does not cancel Apple billing.'
    : 'Deletes your login, the saved home record, and this phone. Does not cancel Google Play billing.';
}

/** First confirm. Says the cloud record is deleted, and billing is not. */
export function deleteAccountConfirm(): string {
  return storeIsApple()
    ? 'This deletes your Saavi login, the home record and files saved to your account, and the copy on this phone. Apple keeps charging until you cancel. Open Manage subscription to cancel first, or delete now and cancel there yourself.'
    : 'This deletes your Saavi login, the home record and files saved to your account, and the copy on this phone. Google Play keeps charging until you cancel. Open Manage subscription to cancel in Google Play first, or delete now and cancel there yourself.';
}

export function deleteAccountFinalConfirm(): string {
  return storeIsApple()
    ? 'This deletes the login, the home record saved to your account, and this phone. It cannot be undone. Apple billing is not cancelled.'
    : 'This deletes the login, the home record saved to your account, and this phone. It cannot be undone. Google Play billing is not cancelled.';
}

export function noSubscriptionRestoreError(): string {
  return storeIsApple()
    ? 'No active subscription found for this Apple ID.'
    : 'No active subscription found for this Google Play account.';
}

export function paywallLegal(): string {
  return storeIsApple()
    ? 'Payment is charged to your Apple ID. Renews automatically until you cancel in Apple Settings (at least 24 hours before the period ends). Cancel stops the next renewal. It does not refund the period already paid.'
    : 'Payment is charged to your Google Play account. Renews automatically until you cancel in Google Play (at least 24 hours before the period ends). Cancel stops the next renewal. It does not refund the period already paid.';
}

export function paywallNotReadyTitle(): string {
  return storeIsApple()
    ? 'Apple billing not connected on this build'
    : 'Google Play billing not connected on this build';
}

export function paywallNotReadyBody(): string {
  return storeIsApple()
    ? 'Prices and payment use App Store subscriptions via RevenueCat. Open a TestFlight build that includes your RevenueCat iOS key.'
    : 'Prices and payment use Google Play subscriptions via RevenueCat. Open a Play build that includes your RevenueCat Android key.';
}

export function paywallPurchaseAlertTitle(): string {
  return storeIsApple() ? 'App Store billing' : 'Google Play billing';
}

export function paywallPurchaseAlertBody(): string {
  return storeIsApple()
    ? 'Subscriptions are purchased through Apple on a TestFlight or App Store build with RevenueCat connected. This preview can’t charge your Apple ID.'
    : 'Subscriptions are purchased through Google Play on a Play build with RevenueCat connected. This preview can’t charge your Google account.';
}

export function paywallProductsBody(): string {
  return storeIsApple()
    ? 'Store products aren’t loaded yet. Check RevenueCat offerings and App Store Connect subscriptions, then try again.'
    : 'Store products aren’t loaded yet. Check RevenueCat offerings and Play Console subscriptions, then try again.';
}

export function paywallRestoreBody(): string {
  return storeIsApple()
    ? 'Restore works on TestFlight / App Store builds once RevenueCat is connected.'
    : 'Restore works on a Play build once RevenueCat is connected.';
}

export function storeProductsUnavailableError(): string {
  return storeIsApple()
    ? 'Store products unavailable. Use a TestFlight / dev build with StoreKit, or Restore.'
    : 'Store products unavailable. Use a Play Store build with Google Play Billing, or Restore.';
}

export function notificationDeniedLine(): string {
  return storeIsApple() ? 'Off in iPhone Settings' : 'Off in Android Settings';
}
