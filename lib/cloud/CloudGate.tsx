import { useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { bootstrapCloud, syncCloudNow } from '@/lib/cloud/sync';
import { syncRowsNow } from '@/lib/sync/engine';
import { isOnboardingDone } from '@/lib/onboarding';

/**
 * Pull cloud snapshot into AsyncStorage before inventory providers hydrate.
 * Offline or missing env: continue with whatever is already on the phone.
 *
 * First-run (onboarding not done): do NOT open an anonymous session or create
 * a household — that waits for "Let's get started" or a successful restore.
 */
export function CloudGate({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const [ready, setReady] = useState(!isSupabaseConfigured());

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) setReady(true);
    }, 10000);

    void (async () => {
      try {
        const done = await isOnboardingDone();
        if (!done) {
          // Welcome / restore first; avoid stray empty households.
          return;
        }
        await bootstrapCloud();
        if (!cancelled) void syncRowsNow();
      } finally {
        clearTimeout(timeout);
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sub = AppState.addEventListener('change', (state) => {
      // Flush on background; also catch up when returning so a failed
      // push doesn't wait until the next edit.
      if (state !== 'background' && state !== 'active') return;
      void isOnboardingDone().then((done) => {
        if (!done) return;
        if (state === 'background') void syncCloudNow();
        void syncRowsNow();
      });
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return <>{children}</>;
}
