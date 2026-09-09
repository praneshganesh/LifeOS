import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useInventory } from '@/lib/InventoryContext';
import { warrantyRecordsFromInventory } from '@/lib/attention';
import { colors } from '@/constants/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'expiring', label: 'Expiring' },
  { key: 'expired', label: 'Expired' },
  { key: 'missing', label: 'Missing' },
];

function warrantyMeta(w: {
  status: string;
  expiresOn: string;
  daysLeft: number | null;
}): string {
  if (w.status === 'missing') return 'Missing';
  if (w.daysLeft == null) return w.expiresOn;
  if (w.daysLeft < 0) return `Expired · ${w.expiresOn}`;
  if (w.daysLeft === 0) return 'Ends today';
  if (w.daysLeft <= 90) return `${w.daysLeft}d · ${w.expiresOn}`;
  return w.expiresOn;
}

export default function WarrantiesScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const [filter, setFilter] = useState('all');
  const warrantyRecords = useMemo(
    () => warrantyRecordsFromInventory(items),
    [items]
  );

  const list = useMemo(
    () =>
      filter === 'all'
        ? warrantyRecords
        : warrantyRecords.filter((w) => w.status === filter),
    [filter, warrantyRecords]
  );

  const counts = {
    active: warrantyRecords.filter((w) => w.status === 'active').length,
    expiring: warrantyRecords.filter((w) => w.status === 'expiring').length,
    expired: warrantyRecords.filter((w) => w.status === 'expired').length,
    missing: warrantyRecords.filter((w) => w.status === 'missing').length,
  };

  const emptyCopy =
    items.length === 0
      ? 'No things yet — add appliances or electronics to track warranties.'
      : filter === 'missing'
        ? 'Every listed thing already has a warranty date — or add expiry on the item.'
        : filter === 'all'
          ? 'Nothing matched. Capture a warranty card or set expiry on a Thing.'
          : `No ${filter} warranties.`;

  return (
    <ModuleScreen
      title="Warranties"
      subtitle="From your Things — coverage, what’s expiring, and what’s missing."
      defaultOrigin="things"
      right={<CaptureContextButton kind="warranty" label="Capture warranty" />}
    >
      <StatStrip
        items={[
          { label: 'Active', value: String(counts.active) },
          { label: 'Expiring', value: String(counts.expiring) },
          { label: 'Expired', value: String(counts.expired) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Coverage" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              {emptyCopy}
            </Text>
          </View>
        ) : (
          <ListCard>
            {list.map((w, i) => (
              <ListRow
                key={w.id}
                icon={w.icon}
                title={w.assetName}
                subtitle={`${w.brand} · ${w.room}`}
                meta={warrantyMeta(w)}
                tone={
                  w.status === 'expiring'
                    ? colors.amber
                    : w.status === 'expired' || w.status === 'missing'
                      ? colors.coral
                      : colors.forestBright
                }
                onPress={() => router.push(`/asset/${w.assetId}` as Href)}
                last={i === list.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
