import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { StyleSheet, Pressable } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useToast } from '@/lib/ToastContext';
import {
  daysUntilRenewal,
  formatAmount,
  labelForCycle,
  labelForSubscriptionCategory,
  monthlyCost,
} from '@/lib/subscriptions';
import { confirmDelete } from '@/lib/confirmDelete';
import { type ThemeColors,  colors, fonts, spacing  } from '@/constants/theme';
import CreateScreen from './create';

export default function SubscriptionDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, removeSubscription } = useSubscriptions();
  const { showError } = useToast();

  if (id === 'new') {
    return <CreateScreen />;
  }
  const sub = id ? getById(id) : undefined;

  async function onDelete() {
    if (!sub) return;
    const ok = await confirmDelete(sub.title);
    if (!ok) return;
    try {
      await removeSubscription(sub.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/subscriptions' as Href);
  }

  if (!sub) {
    return (
      <ModuleScreen title="Not found">
        <Text variant="body">Subscription not found.</Text>
      </ModuleScreen>
    );
  }

  const days = daysUntilRenewal(sub.renewsOn);

  return (
    <ModuleScreen
      title={sub.title}
      subtitle={formatAmount(sub.amount, sub.currency) + ` / ${sub.cycle}`}
    >
      <Stack.Screen options={{ title: '' }} />
      <ListCard>
        <ListRow
          title="Amount"
          meta={formatAmount(sub.amount, sub.currency)}
        />
        <ListRow title="Cycle" meta={labelForCycle(sub.cycle)} />
        <ListRow
          title="Monthly est."
          meta={formatAmount(monthlyCost(sub), sub.currency)}
        />
        <ListRow
          title="Renews"
          meta={
            days == null
              ? sub.renewsOn
              : days < 0
                ? `Overdue · ${sub.renewsOn}`
                : days === 0
                  ? `Today · ${sub.renewsOn}`
                  : `${days}d · ${sub.renewsOn}`
          }
        />
        <ListRow
          title="Category"
          meta={labelForSubscriptionCategory(sub.category)}
        />
        {sub.provider ? <ListRow title="Provider" meta={sub.provider} /> : null}
        <ListRow
          title="Auto-renew"
          meta={sub.autoRenew === false ? 'Off' : 'On'}
        />
        <ListRow title="Source" meta={sub.source || 'manual'} last />
      </ListCard>

      {sub.note ? (
        <Text variant="body" style={styles.note}>
          {sub.note}
        </Text>
      ) : null}

      <Pressable
        onPress={() =>
          router.push(
            `/subscriptions/create?editId=${encodeURIComponent(sub.id)}` as Href
          )
        }
        style={styles.edit}
      >
        <Text style={styles.editText}>Edit subscription</Text>
      </Pressable>

      <Pressable onPress={() => void onDelete()} style={styles.remove}>
        <Text style={styles.removeText}>Delete subscription</Text>
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
