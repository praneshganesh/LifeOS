import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { AddButton } from '@/components/ui/AddButton';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useDeleteWithConfirm } from '@/lib/useDeleteWithConfirm';
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
  const { subscriptions, removeSubscription } = useSubscriptions();
  const deleteWithConfirm = useDeleteWithConfirm();
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
        <AddButton
          onPress={() => router.push('/subscriptions/create' as Href)}
          label="Add subscription"
        />
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
                  onDelete={() => void deleteWithConfirm(s.title, () => removeSubscription(s.id))}
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
});
}
