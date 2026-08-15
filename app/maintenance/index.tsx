import { useMemo } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useLastDone } from '@/lib/LastDoneContext';
import { useInventory } from '@/lib/InventoryContext';
import { formatRelativeDone, getLastDoneAt } from '@/lib/lastDone';
import { colors } from '@/constants/theme';

export default function MaintenanceScreen() {
  const router = useRouter();
  const { items } = useLastDone();
  const { items: inventory } = useInventory();

  const dueSoon = useMemo(() => {
    const now = Date.now();
    return items
      .filter((i) => i.remindAt)
      .map((i) => {
        const t = new Date(i.remindAt!).getTime();
        const days = Math.round((t - now) / (1000 * 60 * 60 * 24));
        return { ...i, days };
      })
      .sort((a, b) => a.days - b.days);
  }, [items]);

  const overdue = dueSoon.filter((i) => i.days < 0).length;
  const week = dueSoon.filter((i) => i.days >= 0 && i.days <= 7).length;

  return (
    <ModuleScreen
      title="Maintenance"
      subtitle="Service due from Last Done — schedules for Things you own."
      right={<CaptureContextButton kind="maintenance" label="Capture maintenance" />}
    >
      <StatStrip
        items={[
          { label: 'Overdue', value: String(overdue) },
          { label: 'This week', value: String(week) },
          { label: 'Tracked', value: String(items.length) },
        ]}
      />

      <ModuleSection label="Schedule" count={dueSoon.length || items.length}>
        {items.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Nothing scheduled. Log service from an item or Last Done.
            </Text>
          </View>
        ) : (
          <ListCard>
            {(dueSoon.length ? dueSoon : items).slice(0, 30).map((m, i, arr) => {
              const itemName = m.inventoryItemId
                ? inventory.find((x) => x.id === m.inventoryItemId)?.name
                : undefined;
              const due =
                'days' in m && typeof m.days === 'number'
                  ? m.days < 0
                    ? 'Overdue'
                    : m.days === 0
                      ? 'Today'
                      : m.days <= 7
                        ? 'This week'
                        : m.remindAt
                          ? formatRelativeDone(m.remindAt)
                          : 'Soon'
                  : formatRelativeDone(getLastDoneAt(m));
              return (
                <ListRow
                  key={m.id}
                  icon="tools"
                  title={m.label}
                  subtitle={[itemName, formatRelativeDone(getLastDoneAt(m))]
                    .filter(Boolean)
                    .join(' · ')}
                  meta={due}
                  tone={
                    'days' in m && typeof m.days === 'number' && m.days < 0
                      ? colors.coral
                      : 'days' in m && typeof m.days === 'number' && m.days <= 7
                        ? colors.amber
                        : undefined
                  }
                  onPress={() =>
                    router.push(
                      (m.inventoryItemId
                        ? `/asset/${m.inventoryItemId}`
                        : `/last-done/${m.id}`) as Href
                    )
                  }
                  last={i === arr.length - 1}
                />
              );
            })}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
