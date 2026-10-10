import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { reloadAppAfterWipe, wipeLifeOsData } from '@/lib/dataExport';

/**
 * Erases the signed-in Supabase user (and a household they alone belong to),
 * then wipes this phone. Does not cancel an Apple subscription.
 */
export async function deleteMyAccount(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (isSupabaseConfigured() && supabase) {
    const { error } = await supabase.rpc('delete_my_account');
    if (error) {
      return { ok: false, error: error.message };
    }
    try {
      await supabase.auth.signOut();
    } catch {
      /* The user row is already gone. */
    }
  }

  try {
    const Purchases = (await import('react-native-purchases')).default;
    if (await Purchases.isConfigured()) {
      await Purchases.logOut();
    }
  } catch {
    /* Anonymous RevenueCat users cannot log out. A new id is fine. */
  }

  await wipeLifeOsData();
  await reloadAppAfterWipe();
  return { ok: true };
}
