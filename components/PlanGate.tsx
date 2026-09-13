import { useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSegments, type Href } from 'expo-router';
import { usePlanOptional } from '@/lib/PlanContext';

const ALLOWED_WHEN_LOCKED = new Set([
  'paywall',
  'onboarding',
  'invite',
  'settings',
]);

/**
 * Blocks the app when trial has ended and user hasn't subscribed.
 * Allows paywall, plan settings, onboarding, and invite accept.
 */
export function PlanGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const segments = useSegments();
  const plan = usePlanOptional();
  const [boot, setBoot] = useState(true);

  useEffect(() => {
    // Brief delay so PlanProvider can load prefs before redirecting.
    const t = setTimeout(() => setBoot(false), 40);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (boot) return;
    if (!plan?.ready) return;
    if (plan.entitlement.hasAccess) return;

    const root = segments[0] as string | undefined;
    if (root && ALLOWED_WHEN_LOCKED.has(root)) return;
    // settings/plan is under settings
    if (root === 'settings' && segments[1] === 'plan') return;

    router.replace('/paywall' as Href);
  }, [boot, plan?.ready, plan?.entitlement.hasAccess, segments, router, plan]);

  return <>{children}</>;
}
