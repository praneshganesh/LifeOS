import type { InventoryItem } from '@/lib/InventoryContext';
import { startOfDayISO } from '@/lib/lastDone';

/** Human-readable date for timeline rows (e.g. "10 Aug 2026"). */
export function timelineDateLabel(isoOrDate: string | Date = new Date()): string {
  const d =
    typeof isoOrDate === 'string' ? new Date(startOfDayISO(isoOrDate)) : isoOrDate;
  if (Number.isNaN(d.getTime())) {
    return new Date().toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Append a maintenance event onto an inventory item's timeline.
 * Keeps the newest event first.
 */
export function timelineAfterMaintenance(
  item: InventoryItem,
  activityLabel: string,
  doneAt?: string
): InventoryItem['timeline'] {
  const date = timelineDateLabel(doneAt || new Date());
  const event = `Service · ${activityLabel.trim()}`;
  const next = [{ date, event }, ...(item.timeline || [])];
  if (
    next.length > 1 &&
    next[0].date === next[1].date &&
    next[0].event === next[1].event
  ) {
    return item.timeline || [];
  }
  return next;
}
