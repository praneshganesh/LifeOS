import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useSpaces } from '@/lib/SpacesContext';
import {
  currentMonthKey,
  expensesInMonth,
  formatAmount,
  sumExpenses,
} from '@/lib/expenses';
import { getRuntimeDefaultCurrency } from '@/lib/currency';
import {
  daysUntilRenewal,
  formatAmount as formatSubAmount,
  sortByRenewal,
  sumMonthly,
} from '@/lib/subscriptions';
import { warrantyRecordsFromInventory } from '@/lib/attention';
import {
  isDocumentItem,
  isInsuranceItem,
  isPurchaseItem,
  isVehicleItem,
  spaceIdByKind,
} from '@/lib/moduleFilters';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function ReportsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { items } = useInventory();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { subscriptions } = useSubscriptions();
  const { items: lastDone } = useLastDone();
  const { members } = useHousehold();
  const { spaces } = useSpaces();

  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const vehicleSpaceId = spaceIdByKind(spaces, 'vehicle');

  const month = currentMonthKey();
  const monthSpend = sumExpenses(expensesInMonth(expenses, month));
  const currency = expenses[0]?.currency || getRuntimeDefaultCurrency();
  const monthlySubs = sumMonthly(subscriptions);
  const upcoming = sortByRenewal(subscriptions).slice(0, 5);
  const warranties = warrantyRecordsFromInventory(items);
  const expiringW = warranties.filter(
    (w) => w.status === 'expiring' || w.status === 'expired'
  ).length;

  const counts = useMemo(
    () => ({
      things: items.length,
      docs: items.filter((i) => isDocumentItem(i, documentsSpaceId)).length,
      vehicles: items.filter((i) => isVehicleItem(i, vehicleSpaceId)).length,
      purchases: items.filter(isPurchaseItem).length,
      insurance: items.filter(isInsuranceItem).length,
      homes: spaces.filter((s) => s.kind === 'home').length,
    }),
    [items, spaces, documentsSpaceId, vehicleSpaceId]
  );

  return (
    <ModuleScreen
      title="Reports"
      subtitle="Live snapshot of your data."
      defaultOrigin="settings"
    >
      <StatStrip
        items={[
          { label: 'Things', value: String(counts.things) },
          { label: 'This month', value: formatAmount(monthSpend, currency) },
          { label: 'Subs / mo', value: formatSubAmount(monthlySubs, currency) },
        ]}
      />

      <ModuleSection label="Inventory">
        <ListCard>
          <ListRow title="Things" meta={String(counts.things)} />
          <ListRow title="Documents" meta={String(counts.docs)} />
          <ListRow title="Vehicles" meta={String(counts.vehicles)} />
          <ListRow title="Purchases" meta={String(counts.purchases)} />
          <ListRow title="Insurance" meta={String(counts.insurance)} />
          <ListRow title="Homes / spaces" meta={`${counts.homes} / ${spaces.length}`} last />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Life">
        <ListCard>
          <ListRow title="Household" meta={String(members.length)} />
          <ListRow title="Habits" meta={String(habits.length)} />
          <ListRow title="Last Done" meta={String(lastDone.length)} />
          <ListRow
            title="Warranties due"
            subtitle="Expiring or expired"
            meta={String(expiringW)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Upcoming renewals" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute }}>
            No subscriptions logged yet.
          </Text>
        ) : (
          <ListCard>
            {upcoming.map((s, i) => {
              const days = daysUntilRenewal(s.renewsOn);
              return (
                <ListRow
                  key={s.id}
                  icon="credit"
                  title={s.title}
                  subtitle={
                    days == null
                      ? s.renewsOn
                      : days < 0
                        ? 'Overdue'
                        : days === 0
                          ? 'Today'
                          : `In ${days} days`
                  }
                  meta={formatSubAmount(s.amount, s.currency)}
                  onPress={() => router.push(`/subscriptions/${s.id}` as Href)}
                  last={i === upcoming.length - 1}
                />
              );
            })}
          </ListCard>
        )}
      </ModuleSection>

      <View style={styles.note}>
        <Text variant="caption">
          PDF export comes later. Use Settings → Export for a full JSON backup.
        </Text>
      </View>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  note: {
    marginTop: spacing.lg,
    marginBottom: spacing.xl,
    padding: spacing.md,
    backgroundColor: colors.surfaceSoft,
    borderRadius: radius.md,
  },
});
}
