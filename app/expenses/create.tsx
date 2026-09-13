import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { useExpenses } from '@/lib/ExpensesContext';
import { useToast } from '@/lib/ToastContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { sanitizeAmountInput } from '@/lib/currency';
import {
  EXPENSE_CATEGORIES,
  parseAmount,
  type ExpenseCategory,
} from '@/lib/expenses';
import { localDayKey } from '@/lib/dates';
import { type ThemeColors, spacing } from '@/constants/theme';

export default function ExpenseFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { editId: editParam } = useLocalSearchParams<{ editId?: string }>();
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  const { addExpense, updateExpense, getById } = useExpenses();
  const { showToast, showError } = useToast();
  const { currency: defaultCurrency } = useCurrency();
  const existing = editId ? getById(editId) : undefined;
  const editing = Boolean(existing);
  const currency = existing?.currency || defaultCurrency;
  const accent = colors.forest;

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [date, setDate] = useState(localDayKey());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!editId);

  useEffect(() => {
    if (!editId) return;
    const e = getById(editId);
    if (!e) {
      setHydrated(true);
      return;
    }
    setTitle(e.title);
    setAmount(String(e.amount));
    setMerchant(e.merchant || '');
    setCategory(e.category);
    setDate(e.date || localDayKey());
    setNote(e.note || '');
    setHydrated(true);
  }, [editId, getById]);

  const amountNum = parseAmount(amount);
  const canSave = Boolean(title.trim()) && Number.isFinite(amountNum) && amountNum > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (editing && existing) {
        await updateExpense(existing.id, {
          title: title.trim(),
          amount: amountNum,
          currency,
          category,
          date: date.trim() || localDayKey(),
          merchant: merchant.trim() || undefined,
          note: note.trim() || undefined,
        });
        showToast('Expense updated');
        router.replace(`/expenses/${existing.id}` as Href);
      } else {
        const expense = await addExpense({
          title: title.trim(),
          amount: amountNum,
          currency,
          category,
          date: date.trim() || undefined,
          merchant: merchant.trim() || undefined,
          note: note.trim() || undefined,
          source: 'manual',
        });
        showToast('Expense logged');
        router.replace(`/expenses/${expense.id}` as Href);
      }
    } catch {
      showError('Couldn’t save the expense — try again.');
    } finally {
      setSaving(false);
    }
  }

  if (editId && hydrated && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit expense' }} />
        <View style={{ padding: spacing.lg }}>
          <Text variant="body">Expense not found.</Text>
        </View>
      </Screen>
    );
  }

  if (!hydrated) {
    return (
      <Screen>
        <Stack.Screen options={{ title: editing ? 'Edit expense' : 'Add expense' }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: editing ? 'Edit expense' : 'Add expense' }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_DOCK_PAD}>
        <DetailSection label="What for">
          <DetailField
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Groceries"
            autoFocus={!editing}
          />
        </DetailSection>

        <DetailSection label={`Amount (${currency})`}>
          <DetailField
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </DetailSection>

        <DetailSection label="Merchant">
          <DetailField
            value={merchant}
            onChangeText={setMerchant}
            placeholder="e.g. Carrefour"
          />
        </DetailSection>

        <DetailSection label="Date">
          <DateField value={date} onChange={setDate} />
        </DetailSection>

        <DetailSection label="Note">
          <DetailField
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Split with Maya"
          />
        </DetailSection>

        <DetailSection label="Category">
          <DetailChipRow>
            {EXPENSE_CATEGORIES.map((c) => (
              <DetailChip
                key={c.id}
                label={c.label}
                selected={category === c.id}
                onPress={() => setCategory(c.id)}
                accent={accent}
              />
            ))}
          </DetailChipRow>
        </DetailSection>

        <DetailPrimaryButton
          label={saving ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
          accent={accent}
          disabled={!canSave || saving}
          onPress={() => void save()}
        />
      </KeyboardFormScroll>
    </Screen>
  );
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
  });
}
