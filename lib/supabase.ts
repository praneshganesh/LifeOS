import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const publishableKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

/** Expo web SSR runs in Node without `window` — skip client init there. */
function canInitSupabaseClient(): boolean {
  if (!url || !publishableKey) return false;
  if (Platform.OS === 'web' && typeof window === 'undefined') return false;
  return true;
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

/**
 * Null until EXPO_PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY are set.
 * Auth session stays on-device (AsyncStorage). Never put a secret / service-role key in the app.
 */
export const supabase: SupabaseClient | null = canInitSupabaseClient()
  ? createClient(url!, publishableKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
