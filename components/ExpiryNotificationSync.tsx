import { useEffect } from 'react';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { loadNotificationPrefs } from '@/lib/notificationPrefs';
import { syncExpiryNotifications } from '@/lib/expiryNotifications';

/** Keeps warranty / document / policy / subscription alerts in step with local data. */
export function ExpiryNotificationSync() {
  const { items: inventory, ready: inventoryReady } = useInventory();
  const { subscriptions, ready: subsReady } = useSubscriptions();
  const { items: reminders } = useLastDone();

  useEffect(() => {
    if (!inventoryReady || !subsReady) return;
    const timer = setTimeout(() => {
      void loadNotificationPrefs().then((prefs) =>
        syncExpiryNotifications({ inventory, subscriptions, reminders, prefs })
      );
    }, 1500);
    return () => clearTimeout(timer);
  }, [inventory, subscriptions, reminders, inventoryReady, subsReady]);

  return null;
}
