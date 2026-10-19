import { Redirect } from 'expo-router';

/** Legacy step, merged into /onboarding/details. */
export default function OnboardingLegacyRedirect() {
  return <Redirect href="/onboarding/details" />;
}
