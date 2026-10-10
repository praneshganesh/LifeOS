import { Redirect } from 'expo-router';

/** Legacy step — Capture is explained on how-it-works, not as a first action. */
export default function OnboardingCaptureRedirect() {
  return <Redirect href="/onboarding/how-it-works" />;
}
