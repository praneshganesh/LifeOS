import { Redirect } from 'expo-router';

/** Legacy step — replaced by how-it-works. */
export default function OnboardingTalkRedirect() {
  return <Redirect href="/onboarding/how-it-works" />;
}
