import { useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { bootstrapCloud, syncCloudNow } from '@/lib/cloud/sync';
import { syncRowsNow } from '@/lib/sync/engine';

/**
 * Pull cloud snapshot into AsyncStorage before inventory providers hydrate.
 * Offline or missing env: continue with whatever is already on the phone.
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
    void bootstrapCloud().finally(() => {
      clearTimeout(timeout);
      if (!cancelled) setReady(true);
      // Row-level sync (docs/SYNC_ARCHITECTURE.md) runs after hydration —
      // it never blocks first paint and merges via last-write-wins.
      void syncRowsNow();
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        void syncCloudNow();
        void syncRowsNow();
      }
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return <>{children}</>;
}
