import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { StyleSheet, View, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useExpenses } from '@/lib/ExpensesContext';
import {
  formatAmount,
  labelForCategory,
} from '@/lib/expenses';
import { confirmDelete } from '@/lib/confirmDelete';
import { type ThemeColors,  colors, fonts, spacing  } from '@/constants/theme';
import CreateScreen from './create';

export default function ExpenseDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
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

  return (
    <ModuleScreen
      title={expense.title}
      subtitle={formatAmount(expense.amount, expense.currency)}
      backLabel="Expenses"
      backFallbackHref="/expenses"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ListCard>
        <ListRow title="Amount" meta={formatAmount(expense.amount, expense.currency)} />
        <ListRow title="Date" meta={expense.date} />
        <ListRow title="Category" meta={labelForCategory(expense.category)} />
        {expense.merchant ? (
          <ListRow title="Merchant" meta={expense.merchant} />
        ) : null}
        <ListRow title="Source" meta={expense.source || 'manual'} last />
      </ListCard>

      <Pressable
        onPress={() =>
          router.push(`/expenses/create?editId=${encodeURIComponent(expense.id)}` as Href)
        }
        style={styles.edit}
      >
        <Text style={styles.editText}>Edit expense</Text>
      </Pressable>

      {expense.note ? (
        <Text variant="body" style={styles.note}>
          {expense.note}
        </Text>
      ) : null}

      <Pressable onPress={() => void onDelete()} style={styles.remove}>
        <Text style={styles.removeText}>Delete expense</Text>
      </Pressable>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  note: {
    marginTop: spacing.lg,
    color: colors.mute,
  },
  edit: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  editText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  remove: {
    marginTop: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
  },
});
}
