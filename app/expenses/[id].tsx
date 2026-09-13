import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import {
  DetailEditButton,
  DetailFact,
  DetailFacts,
  DetailHero,
  DetailRemoveButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { useExpenses } from '@/lib/ExpensesContext';
import {
  formatAmount,
  labelForCategory,
} from '@/lib/expenses';
import { confirmDelete } from '@/lib/confirmDelete';
import CreateScreen from './create';

export default function ExpenseDetailScreen() {
  const { colors } = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, removeExpense } = useExpenses();
  const { showError } = useToast();

  if (id === 'new') {
    return <CreateScreen />;
  }
  const expense = id ? getById(id) : undefined;

  async function onDelete() {
    if (!expense) return;
    const ok = await confirmDelete(expense.title);
    if (!ok) return;
    try {
      await removeExpense(expense.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/expenses' as Href);
  }

  if (!expense) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Expenses"
        backFallbackHref="/expenses"
      >
        <Text variant="body">Expense not found.</Text>
      </ModuleScreen>
    );
  }

  const amount = formatAmount(expense.amount, expense.currency);
  const editHref =
    `/expenses/create?editId=${encodeURIComponent(expense.id)}` as Href;

  return (
    <ModuleScreen
      title={expense.title}
      backLabel="Expenses"
      backFallbackHref="/expenses"
      bottomExtra={DETAIL_DOCK_PAD}
      right={
        <DetailEditButton
          accent={colors.forest}
          onPress={() => router.push(editHref)}
        />
      }
      hero={
        <DetailHero
          eyebrow="Expense"
          title={expense.title}
          meta={amount}
          accent={colors.forest}
          vividFallback="#6A7D5C"
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <DetailFacts>
        <DetailFact label="Date" value={expense.date} />
        <DetailFact label="Category" value={labelForCategory(expense.category)} />
        {expense.merchant ? (
          <DetailFact label="Merchant" value={expense.merchant} />
        ) : null}
        <DetailFact
          label="Source"
          value={expense.source || 'manual'}
          last
        />
      </DetailFacts>

      {expense.note ? (
        <DetailSection label="Note">
          <Text variant="body" style={{ color: colors.mute }}>
            {expense.note}
          </Text>
        </DetailSection>
      ) : null}

      <DetailRemoveButton onPress={() => void onDelete()} />
    </ModuleScreen>
  );
}
