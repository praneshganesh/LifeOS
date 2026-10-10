import { Stack, useLocalSearchParams } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import CreateScreen, { ExpenseForm } from './create';

export default function ExpenseDetailScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;

  if (id === 'new') {
    return <CreateScreen />;
  }
  if (!id) {
    return (
      <ModuleScreen title="Not found" backLabel="Expenses" backFallbackHref="/expenses">
        <Stack.Screen options={{ headerShown: false }} />
        <Text variant="body">Expense not found.</Text>
      </ModuleScreen>
    );
  }
  return <ExpenseForm expenseId={id} inline />;
}
