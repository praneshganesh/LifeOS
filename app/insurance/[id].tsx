import { useEffect } from 'react';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { colors } from '@/constants/theme';

/** Insurance detail is the Thing — redirect when present. */
export default function InsuranceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { getById, ready } = useInventory();
  const item = id ? getById(id) : undefined;

  useEffect(() => {
    if (!ready || !id) return;
    if (item) router.replace(`/asset/${id}` as Href);
  }, [ready, id, item, router]);

  return (
    <ModuleScreen
      title="Policy"
      backLabel="Insurance"
      backFallbackHref="/insurance"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <Text variant="body" style={{ color: colors.mute }}>
        {ready && !item
          ? 'That policy isn’t in inventory anymore.'
          : 'Opening the linked Thing…'}
      </Text>
    </ModuleScreen>
  );
}
