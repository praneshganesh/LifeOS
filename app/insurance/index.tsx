import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useInventory } from '@/lib/InventoryContext';
import {
  expiryDaysLeft,
  expiryMeta,
  insuranceBucket,
  isInsuranceItem,
  type InsuranceBucket,
} from '@/lib/moduleFilters';
import { colors } from '@/constants/theme';

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'home', label: 'Home' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'medical', label: 'Medical' },
  { key: 'travel', label: 'Travel' },
  { key: 'life', label: 'Life' },
];

const BUCKET_LABEL: Record<InsuranceBucket, string> = {
  home: 'Home',
  vehicle: 'Vehicle',
  medical: 'Medical',
  travel: 'Travel',
  life: 'Life',
  other: 'Other',
};

export default function InsuranceScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const [filter, setFilter] = useState('all');

  const policies = useMemo(
    () =>
      items
        .filter(isInsuranceItem)
        .map((p) => ({ ...p, bucket: insuranceBucket(p) }))
        .sort((a, b) => {
          const da = expiryDaysLeft(a.expiryDate || a.warrantyExpiry);
          const db = expiryDaysLeft(b.expiryDate || b.warrantyExpiry);
          if (da == null && db == null) return a.name.localeCompare(b.name);
          if (da == null) return 1;
          if (db == null) return -1;
          return da - db;
        }),
    [items]
  );

  const list = useMemo(() => {
    if (filter === 'all') return policies;
    return policies.filter((p) => p.bucket === filter);
  }, [policies, filter]);

  const expiring = policies.filter((p) => {
    const d = expiryDaysLeft(p.expiryDate || p.warrantyExpiry);
    return d != null && d >= 0 && d <= 90;
  }).length;
  const active = policies.filter((p) => {
    const d = expiryDaysLeft(p.expiryDate || p.warrantyExpiry);
    return d == null || d >= 0;
  }).length;

  return (
    <ModuleScreen
      title="Insurance"
      defaultOrigin="things"
      right={<CaptureContextButton kind="insurance" label="Capture insurance" />}
    >
      <StatStrip
        items={[
          { label: 'Active', value: String(active) },
          { label: 'Expiring', value: String(expiring) },
          { label: 'Policies', value: String(policies.length) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Policies" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              No policies yet. Capture a schedule or card, or add an insurance Thing.
            </Text>
          </View>
        ) : (
          <ListCard>
            {list.map((p, i) => {
              const raw = p.expiryDate || p.warrantyExpiry;
              const days = expiryDaysLeft(raw);
              return (
                <ListRow
                  key={p.id}
                  icon={p.icon === 'package' ? 'shield' : p.icon}
                  title={p.name}
                  subtitle={`${BUCKET_LABEL[p.bucket]}${
                    p.brand !== '—' ? ` · ${p.brand}` : ''
                  }`}
                  meta={expiryMeta(raw) || p.serial}
                  tone={
                    days != null && days < 0
                      ? colors.coral
                      : days != null && days <= 30
                        ? colors.coral
                        : days != null && days <= 90
                          ? colors.amber
                          : undefined
                  }
                  onPress={() => router.push(`/asset/${p.id}` as Href)}
                  last={i === list.length - 1}
                />
              );
            })}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
