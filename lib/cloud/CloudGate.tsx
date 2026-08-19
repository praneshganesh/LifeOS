import { useEffect, useState, type ReactNode } from 'react';
import { AppState, View } from 'react-native';
import { useTheme } from '@/lib/ThemeContext';
import { isSupabaseConfigured } from '@/lib/supabase';
import { bootstrapCloud, syncCloudNow } from '@/lib/cloud/sync';

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
    });
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') void syncCloudNow();
    });
    return () => sub.remove();
  }, []);

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  }
  return <>{children}</>;
}
