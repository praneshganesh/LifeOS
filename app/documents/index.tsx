import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { CaptureContextButton } from '@/components/CaptureContextButton';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import {
  docBucket,
  expiryDaysLeft,
  expiryMeta,
  isDocumentItem,
  spaceIdByKind,
} from '@/lib/moduleFilters';
import { colors } from '@/constants/theme';

const CATEGORIES = [
  { key: 'all', label: 'All' },
  { key: 'Identity', label: 'Identity' },
  { key: 'Property', label: 'Property' },
  { key: 'Medical', label: 'Medical' },
  { key: 'Financial', label: 'Financial' },
  { key: 'Legal', label: 'Legal' },
];

export default function DocumentsScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const [filter, setFilter] = useState('all');
  const documentsSpaceId = spaceIdByKind(spaces, 'documents');

  const docs = useMemo(
    () =>
      items
        .filter((d) => isDocumentItem(d, documentsSpaceId))
        .map((d) => ({ ...d, bucket: docBucket(d) }))
        .sort((a, b) => {
          const da = expiryDaysLeft(a.expiryDate || a.warrantyExpiry);
          const db = expiryDaysLeft(b.expiryDate || b.warrantyExpiry);
          if (da == null && db == null) return a.name.localeCompare(b.name);
          if (da == null) return 1;
          if (db == null) return -1;
          return da - db;
        }),
    [items, documentsSpaceId]
  );

  const list = useMemo(() => {
    if (filter === 'all') return docs;
    return docs.filter((d) => d.bucket === filter);
  }, [docs, filter]);

  const identityCount = docs.filter((d) => d.bucket === 'Identity').length;
  const expiring = docs.filter((d) => {
    const days = expiryDaysLeft(d.expiryDate || d.warrantyExpiry);
    return days != null && days >= 0 && days <= 180;
  }).length;

  return (
    <ModuleScreen
      title="Documents"
      subtitle="Identity, property, medical, legal — on your device."
      defaultOrigin="things"
      right={
        <CaptureContextButton
          kind="documents"
          spaceId={documentsSpaceId}
          label="Capture document"
        />
      }
    >
      <StatStrip
        items={[
          { label: 'Total', value: String(docs.length) },
          { label: 'Identity', value: String(identityCount) },
          { label: 'Expiring', value: String(expiring) },
        ]}
      />
      <FilterChips options={CATEGORIES} value={filter} onChange={setFilter} />
      <ModuleSection label="Library" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              No documents yet. Use + → Capture → Document, or photograph a passport.
            </Text>
          </View>
        ) : (
          <ListCard>
            {list.map((d, i) => {
              const raw = d.expiryDate || d.warrantyExpiry;
              const days = expiryDaysLeft(raw);
              return (
                <ListRow
                  key={d.id}
                  icon={d.icon}
                  title={d.name}
                  subtitle={`${d.bucket}${
                    d.fullName ? ` · ${d.fullName}` : d.brand !== '—' ? ` · ${d.brand}` : ''
                  }`}
                  meta={expiryMeta(raw) || d.documentNumber}
                  tone={
                    days != null && days < 0
                      ? colors.coral
                      : days != null && days <= 60
                        ? colors.coral
                        : days != null && days <= 180
                          ? colors.amber
                          : undefined
                  }
                  onPress={() => router.push(`/asset/${d.id}` as Href)}
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
