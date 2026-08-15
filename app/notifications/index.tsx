import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { buildAttentionItems } from '@/lib/attention';
import { colors } from '@/constants/theme';

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
  const [filter, setFilter] = useState('all');

  const due = useMemo(
    () =>
      buildAttentionItems(items, lastDone, subscriptions).filter(
        (a) => a.urgency === 'urgent' || a.urgency === 'soon'
      ),
    [items, lastDone, subscriptions]
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
      subtitle="Due soon from maintenance, warranties, docs, and renewals."
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
                last={i === list.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
