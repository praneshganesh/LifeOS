import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useExpenses } from '@/lib/ExpensesContext';
import {
  currentMonthKey,
  expensesInMonth,
  formatAmount,
  iconForCategory,
  labelForCategory,
  sumExpenses,
  totalsByCategory,
} from '@/lib/expenses';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export default function ExpensesScreen() {
  const router = useRouter();
  const { expenses } = useExpenses();
  const month = currentMonthKey();
  const thisMonth = useMemo(() => expensesInMonth(expenses, month), [expenses, month]);
  const monthTotal = sumExpenses(thisMonth);
  const byCategory = useMemo(() => totalsByCategory(thisMonth).slice(0, 4), [thisMonth]);
  const currency = thisMonth[0]?.currency || expenses[0]?.currency || 'AED';

  return (
    <ModuleScreen
      title="Expenses"
      subtitle="Spend on this device — Talk insights come next."
      right={
        <Pressable
          onPress={() => router.push('/expenses/create' as Href)}
          style={styles.addBtn}
          accessibilityLabel="Add expense"
        >
          <Plus size={18} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      }
    >
      <StatStrip
        items={[
          { label: 'This month', value: formatAmount(monthTotal, currency) },
          { label: 'Entries', value: String(thisMonth.length) },
          { label: 'All time', value: String(expenses.length) },
        ]}
      />

      {byCategory.length ? (
        <ModuleSection label="By category">
          <View style={styles.bars}>
            {byCategory.map((row) => {
              const pct = monthTotal > 0 ? row.total / monthTotal : 0;
              return (
                <View key={row.category} style={styles.barRow}>
                  <Text style={styles.barLabel}>{labelForCategory(row.category)}</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { width: `${Math.round(Math.max(pct, 0.04) * 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.barAmount}>
                    {formatAmount(row.total, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </ModuleSection>
      ) : null}

      <ModuleSection label="Recent" count={expenses.length}>
        {expenses.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute }}>
            No expenses yet. Add a coffee run, or Capture a receipt later.
          </Text>
        ) : (
          <ListCard>
            {expenses.slice(0, 40).map((e, i) => (
              <ListRow
                key={e.id}
                icon={iconForCategory(e.category)}
                title={e.title}
                subtitle={[e.merchant || labelForCategory(e.category), e.date]
                  .filter(Boolean)
                  .join(' · ')}
                meta={formatAmount(e.amount, e.currency)}
                onPress={() => router.push(`/expenses/${e.id}` as Href)}
                last={i === Math.min(expenses.length, 40) - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.forestSoft,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
  },
  addLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 14,
    color: colors.forest,
  },
  bars: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  barRow: {
    gap: 4,
  },
  barLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.mute,
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
    backgroundColor: colors.forestSoft,
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.forest,
    borderRadius: 4,
  },
  barAmount: {
    fontFamily: fonts.sansSemi,
    fontSize: 12,
    color: colors.ink,
    alignSelf: 'flex-end',
  },
});
