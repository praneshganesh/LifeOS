import { Redirect } from 'expo-router';

/** Legacy step, home naming removed from onboarding. */
export default function OnboardingHomeRedirect() {
  return <Redirect href="/onboarding/intent" />;
}
