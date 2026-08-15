import { useEffect } from 'react';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { colors } from '@/constants/theme';

/** Purchase detail is the Thing — redirect when the inventory id exists. */
export default function PurchaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, ready } = useInventory();
  const item = id ? getById(id) : undefined;

  useEffect(() => {
    if (!ready || !id) return;
    if (item) {
      router.replace(`/asset/${id}` as Href);
    }
  }, [ready, id, item, router]);

  return (
    <ModuleScreen title="Purchase">
      <Stack.Screen options={{ title: 'Purchase' }} />
      <Text variant="body" style={{ color: colors.mute }}>
        {ready && !item
          ? 'That purchase isn’t in inventory anymore.'
          : 'Opening the linked Thing…'}
      </Text>
    </ModuleScreen>
  );
}
