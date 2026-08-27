import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useClasses } from '@/lib/ClassesContext';
import { buildAttentionItems } from '@/lib/attention';
import { useAttentionDismissals } from '@/lib/attentionDismiss';
import { colors } from '@/constants/theme';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'soon', label: 'Soon' },
];

/**
 * M7 — action queue derived from the same attention data as Notifications.
 * Not a separate task store.
 */
export default function TasksScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { items: lastDone } = useLastDone();
  const { subscriptions } = useSubscriptions();
  const { packs: classPacks } = useClasses();
  const [filter, setFilter] = useState('open');
  const { dismiss, isDismissed } = useAttentionDismissals();

  const queue = useMemo(
    () =>
      buildAttentionItems(items, lastDone, subscriptions, classPacks).filter(
        (a) =>
          (a.urgency === 'urgent' || a.urgency === 'soon') && !isDismissed(a.id)
      ),
    [items, lastDone, subscriptions, classPacks, isDismissed]
  );

  const list = useMemo(() => {
    if (filter === 'urgent') return queue.filter((a) => a.urgency === 'urgent');
    if (filter === 'soon') return queue.filter((a) => a.urgency === 'soon');
    return queue;
  }, [queue, filter]);

  const urgent = queue.filter((a) => a.urgency === 'urgent').length;
  const soon = queue.filter((a) => a.urgency === 'soon').length;

  return (
    <ModuleScreen
      title="Tasks & reminders"
      subtitle="Due soon from warranties, docs, renewals, and Last Done."
    >
      <StatStrip
        items={[
          { label: 'Open', value: String(queue.length) },
          { label: 'Urgent', value: String(urgent) },
          { label: 'Soon', value: String(soon) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Queue" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Nothing queued. Set Last Done reminders or add warranty / renewal dates on Things.
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
    </ModuleScreen>
  );
}
