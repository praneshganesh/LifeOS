import { useCallback } from 'react';
import { confirmDelete } from '@/lib/confirmDelete';
import { useToast } from '@/lib/ToastContext';

/** Confirm, delete, then toast. Shared by every swipe-to-delete list. */
export function useDeleteWithConfirm() {
  const { showToast, showError } = useToast();
  return useCallback(
    async (name: string, remove: () => Promise<void>) => {
      const ok = await confirmDelete(name);
      if (!ok) return false;
      try {
        await remove();
        showToast('Deleted');
        return true;
      } catch {
        showError('Couldn’t delete. Try again.');
        return false;
      }
    },
    [showToast, showError]
  );
}
