import { Stack, useLocalSearchParams } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import CreateScreen, { SubscriptionForm } from './create';

export default function SubscriptionDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (id === 'new') {
    return <CreateScreen />;
  }
  if (!id) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Subscriptions"
        backFallbackHref="/subscriptions"
      >
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body">Subscription not found.</Text>
      </ModuleScreen>
    );
  }
  return <SubscriptionForm subscriptionId={id} inline />;
}
