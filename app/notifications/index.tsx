import { useCallback, useMemo, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useClasses } from '@/lib/ClassesContext';
import { buildAttentionItems } from '@/lib/attention';
import { useAttentionDismissals } from '@/lib/attentionDismiss';
import {
  loadNotificationLog,
  syncDeliveredFromOS,
  type DeliveredNotification,
} from '@/lib/notificationLog';
import { colors } from '@/constants/theme';

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'soon', label: 'Soon' },
];

export default function NotificationsScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { items: lastDone } = useLastDone();
  const { subscriptions } = useSubscriptions();
  const { packs: classPacks } = useClasses();
  const [filter, setFilter] = useState('all');
  const { dismiss, isDismissed } = useAttentionDismissals();
  const [history, setHistory] = useState<DeliveredNotification[]>([]);

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void syncDeliveredFromOS()
        .then(loadNotificationLog)
        .then((log) => {
          if (live) setHistory(log);
        });
      return () => {
        live = false;
      };
    }, [])
  );

  const due = useMemo(
    () =>
      buildAttentionItems(items, lastDone, subscriptions, classPacks).filter(
        (a) =>
          (a.urgency === 'urgent' || a.urgency === 'soon') && !isDismissed(a.id)
      ),
    [items, lastDone, subscriptions, classPacks, isDismissed]
  );

  const list = useMemo(() => {
    if (filter === 'all') return due;
    return due.filter((a) => a.urgency === filter);
  }, [due, filter]);

  const urgent = due.filter((a) => a.urgency === 'urgent').length;
  const soon = due.filter((a) => a.urgency === 'soon').length;

  return (
    <ModuleScreen
      title="Notifications"
      defaultOrigin="things"
    >
      <StatStrip
        items={[
          { label: 'Urgent', value: String(urgent) },
          { label: 'Soon', value: String(soon) },
          { label: 'Total', value: String(due.length) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Due soon" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Nothing due in the next two weeks. Set a Last Done reminder or add warranty dates on Things.
            </Text>
          </View>
        ) : (
          <ListCard>
            {list.map((a, i) => (
              <ListRow
                key={a.id}
                icon={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                meta={a.category}
                tone={
                  a.urgency === 'urgent'
                    ? colors.coral
                    : a.urgency === 'soon'
                      ? colors.amber
                      : undefined
                }
                onPress={() => {
                  if (a.href) router.push(a.href as Href);
                }}
                onDismiss={() => void dismiss(a.id)}
                last={i === list.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>

      <ModuleSection label="Delivered" count={history.length}>
        {history.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Push notifications you receive will show up here.
            </Text>
          </View>
        ) : (
          <ListCard>
            {history.map((n, i) => (
              <ListRow
                key={n.id}
                icon="bell"
                title={n.title}
                subtitle={n.body}
                meta={timeAgo(n.receivedAt)}
                onPress={
                  n.href
                    ? () => router.push(n.href as Href)
                    : undefined
                }
                last={i === history.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
