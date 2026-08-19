import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useExpenses } from '@/lib/ExpensesContext';
import {
  EXPENSE_CATEGORIES,
  parseAmount,
  type ExpenseCategory,
} from '@/lib/expenses';
import { localDayKey } from '@/lib/dates';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function ExpenseFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { editId: editParam } = useLocalSearchParams<{ editId?: string }>();
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  const { addExpense, updateExpense, getById } = useExpenses();
  const existing = editId ? getById(editId) : undefined;
  const editing = Boolean(existing);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [merchant, setMerchant] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('other');
  const [date, setDate] = useState(localDayKey());
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
          category,
          date: date.trim() || localDayKey(),
          merchant: merchant.trim() || undefined,
        });
        router.replace(`/expenses/${existing.id}` as Href);
      } else {
        const expense = await addExpense({
          title: title.trim(),
          amount: amountNum,
          category,
          date: date.trim() || undefined,
          merchant: merchant.trim() || undefined,
          source: 'manual',
        });
        router.replace(`/expenses/${expense.id}` as Href);
      }
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>What for</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Groceries"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus={!editing}
          />

          <Text style={styles.label}>Amount (AED)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            placeholderTextColor={colors.faint}
            style={styles.input}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Merchant (optional)</Text>
          <TextInput
            value={merchant}
            onChangeText={setMerchant}
            placeholder="e.g. Carrefour"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
          <TextInput
            value={date}
            onChangeText={setDate}
            placeholder="2026-08-10"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoCapitalize="none"
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {EXPENSE_CATEGORIES.map((c) => {
              const on = category === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => setCategory(c.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={!canSave || saving}
            style={[styles.save, (!canSave || saving) && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save expense'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    padding: spacing.lg,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.forestSoft,
    borderColor: colors.forest,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  chipTextOn: {
    color: colors.forest,
  },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveDisabled: {
    opacity: 0.45,
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.pure,
  },
});
}
