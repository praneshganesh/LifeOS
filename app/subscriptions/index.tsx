import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { getRuntimeDefaultCurrency } from '@/lib/currency';
import {
  daysUntilRenewal,
  formatAmount,
  iconForSubscriptionCategory,
  labelForCycle,
  sumMonthly,
  sumYearly,
} from '@/lib/subscriptions';
import { type ThemeColors,  colors, fonts, radius  } from '@/constants/theme';

function renewalMeta(renewsOn: string): string {
  const days = daysUntilRenewal(renewsOn);
  if (days == null) return renewsOn;
  if (days < 0) return `Overdue · ${renewsOn}`;
  if (days === 0) return 'Renews today';
  if (days <= 14) return `${days}d · ${renewsOn}`;
  return renewsOn;
}

export default function SubscriptionsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { subscriptions } = useSubscriptions();
  const monthly = sumMonthly(subscriptions);
  const yearly = sumYearly(subscriptions);
  const currency = subscriptions[0]?.currency || getRuntimeDefaultCurrency();
  const upcoming = useMemo(
    () =>
      [...subscriptions].sort((a, b) => a.renewsOn.localeCompare(b.renewsOn)),
    [subscriptions]
  );

  return (
    <ModuleScreen
      title="Subscriptions"
      defaultOrigin="things"
      right={
        <Pressable
          onPress={() => router.push('/subscriptions/create' as Href)}
          style={styles.addBtn}
          accessibilityLabel="Add subscription"
        >
          <Plus size={18} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      }
    >
      <StatStrip
        items={[
          { label: 'Monthly', value: formatAmount(monthly, currency) },
          { label: 'Yearly est.', value: formatAmount(yearly, currency) },
          { label: 'Active', value: String(subscriptions.length) },
        ]}
      />

      <ModuleSection label="Upcoming renewals" count={upcoming.length}>
        {upcoming.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute }}>
            No subscriptions yet. Add Netflix, or say “I pay AED 50 for Spotify monthly” in Talk.
          </Text>
        ) : (
          <ListCard>
            {upcoming.map((s, i) => {
              const days = daysUntilRenewal(s.renewsOn);
              return (
                <ListRow
                  key={s.id}
                  icon={iconForSubscriptionCategory(s.category)}
                  title={s.title}
                  subtitle={[
                    s.provider || labelForCycle(s.cycle),
                    formatAmount(s.amount, s.currency),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  meta={renewalMeta(s.renewsOn)}
                  tone={
                    days != null && days <= 7
                      ? colors.amber
                      : days != null && days < 0
                        ? colors.coral
                        : undefined
                  }
                  onPress={() => router.push(`/subscriptions/${s.id}` as Href)}
                  last={i === upcoming.length - 1}
                />
              );
            })}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
    fontSize: 16,
    color: colors.forest,
  },
});
}
