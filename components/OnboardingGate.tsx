import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSegments, type Href } from 'expo-router';
import { isOnboardingDone } from '@/lib/onboarding';

/**
 * Sends first-run users into /onboarding until completeOnboarding() is called.
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const [needOnboarding, setNeedOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    void isOnboardingDone().then((done) => {
      if (alive) setNeedOnboarding(!done);
    });
    return () => {
      alive = false;
    };
  }, [segments]);

  useEffect(() => {
    if (needOnboarding == null) return;
    const root = segments[0];
    const inOnboarding = root === 'onboarding';
    const inPaywall = root === 'paywall';
    const inInvite = root === 'invite';
    if (needOnboarding && !inOnboarding && !inPaywall && !inInvite) {
      router.replace('/onboarding' as Href);
    } else if (!needOnboarding && inOnboarding) {
      router.replace('/(tabs)' as Href);
    }
  }, [needOnboarding, segments, router]);

  return <>{children}</>;
}
