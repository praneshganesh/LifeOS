import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { reloadAppAfterWipe, wipeLifeOsData } from '@/lib/dataExport';
import { MEDIA_BUCKET } from '@/lib/media/mediaSync';

/**
 * Erases the signed-in Supabase user (and a household they alone belong to),
 * then wipes this phone. Does not cancel an Apple subscription.
 */
export async function deleteMyAccount(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (isSupabaseConfigured() && supabase) {
    // Storage forbids DELETE on storage.objects from SQL. List + remove via
    // the Storage API first. Do not erase the account if listing fails — that
    // would orphan media.
    const { data: paths, error: listError } = await supabase.rpc(
      'list_my_media_paths'
    );
    if (listError) {
      return { ok: false, error: listError.message };
    }
    if (!Array.isArray(paths)) {
      return { ok: false, error: 'Could not list photos to delete.' };
    }
    const names = paths.filter(
      (p): p is string => typeof p === 'string' && p.length > 0
    );
    for (let i = 0; i < names.length; i += 100) {
      const chunk = names.slice(i, i + 100);
      const { error: removeError } = await supabase.storage
        .from(MEDIA_BUCKET)
        .remove(chunk);
      if (removeError) {
        return { ok: false, error: removeError.message };
      }
    }

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
