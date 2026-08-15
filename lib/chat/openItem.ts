import type { ChatAction } from '@/lib/chat/types';

/**
 * Resolve which inventory id to open from model/local actions + session focus.
 */
export function resolveOpenItemId(params: {
  actions: ChatAction[] | undefined;
  openItemId: string | null;
  focusItemId: string | null;
  inventoryIds: string[];
}): string | null {
  const ids = new Set(params.inventoryIds);
  const focus =
    params.focusItemId && ids.has(params.focusItemId) ? params.focusItemId : null;

  if (params.openItemId && ids.has(params.openItemId)) {
    return params.openItemId;
  }

  const wantsOpen = (params.actions ?? []).some((a) => a?.type === 'open_item');
  if (!wantsOpen) return null;

  // Model often emits open_item with a missing/hallucinated id
  if (focus) return focus;
  // Newest item is first in our inventory list
  return params.inventoryIds[0] ?? params.focusItemId ?? null;
}
