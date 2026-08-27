import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useInventory } from '@/lib/InventoryContext';
import { formatAmount } from '@/lib/expenses';
import {
  isPurchaseItem,
  purchaseSortKey,
  sumPurchasePrices,
} from '@/lib/moduleFilters';
import { colors } from '@/constants/theme';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'priced', label: 'With price' },
  { key: 'receipts', label: 'With photo' },
  { key: 'recent', label: 'This year' },
];

export default function PurchasesScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const [filter, setFilter] = useState('all');
  const year = new Date().getFullYear().toString();

  const purchases = useMemo(
    () =>
      items
        .filter(isPurchaseItem)
        .sort((a, b) => purchaseSortKey(b).localeCompare(purchaseSortKey(a))),
    [items]
  );

  const list = useMemo(() => {
    if (filter === 'priced') {
      return purchases.filter((p) => p.price && p.price !== '—');
    }
    if (filter === 'receipts') {
      return purchases.filter((p) => Boolean(p.imageUri));
    }
    if (filter === 'recent') {
      return purchases.filter((p) => purchaseSortKey(p).startsWith(year));
    }
    return purchases;
  }, [filter, purchases, year]);

  const priced = purchases.filter((p) => p.price && p.price !== '—');
  const withPhoto = purchases.filter((p) => Boolean(p.imageUri));
  const sum = sumPurchasePrices(priced);

  return (
    <ModuleScreen
      title="Purchases"
      subtitle="Things you bought — from your inventory."
      right={<CaptureContextButton kind="purchase" label="Capture purchase" />}
    >
      <StatStrip
        items={[
          { label: 'Purchases', value: String(purchases.length) },
          {
            label: 'Logged spend',
            value: sum.counted
              ? formatAmount(sum.total, sum.currency)
              : '—',
          },
          { label: 'Photos', value: String(withPhoto.length) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="History" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              No purchases yet. Capture a receipt, or tell Talk what you bought and where.
            </Text>
          </View>
        ) : (
          <ListCard>
            {list.map((p, i) => (
              <ListRow
                key={p.id}
                icon={p.icon}
                title={p.name}
                subtitle={[p.purchasedFrom || p.brand, purchaseSortKey(p)]
                  .filter((x) => x && x !== '—')
                  .join(' · ')}
                meta={p.price && p.price !== '—' ? p.price : undefined}
                onPress={() => router.push(`/asset/${p.id}` as Href)}
                last={i === list.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}
