import { useTheme } from '@/lib/ThemeContext';
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
import CreateScreen from './create';

export default function SubscriptionDetailScreen() {
  const { colors } = useTheme();
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
      <ModuleScreen
        title="Not found"
        backLabel="Subscriptions"
        backFallbackHref="/subscriptions"
      >
        <Text variant="body">Subscription not found.</Text>
      </ModuleScreen>
    );
  }

  const days = daysUntilRenewal(sub.renewsOn);
  const renewLabel =
    days == null
      ? sub.renewsOn
      : days < 0
        ? `Overdue · ${sub.renewsOn}`
        : days === 0
          ? `Today · ${sub.renewsOn}`
          : `${days}d · ${sub.renewsOn}`;
  const amountCycle = `${formatAmount(sub.amount, sub.currency)} / ${labelForCycle(sub.cycle)}`;
  const editHref =
    `/subscriptions/create?editId=${encodeURIComponent(sub.id)}` as Href;

  return (
    <ModuleScreen
      title={sub.title}
      backLabel="Subscriptions"
      backFallbackHref="/subscriptions"
      bottomExtra={DETAIL_DOCK_PAD}
      right={
        <DetailEditButton
          accent={colors.forest}
          onPress={() => router.push(editHref)}
        />
      }
      hero={
        <DetailHero
          eyebrow="Subscription"
          title={sub.title}
          meta={amountCycle}
          accent={colors.forest}
          vividFallback="#6A7D5C"
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <DetailFacts>
        <DetailFact label="Renews" value={renewLabel} />
        <DetailFact
          label="Monthly est."
          value={formatAmount(monthlyCost(sub), sub.currency)}
        />
        <DetailFact
          label="Category"
          value={labelForSubscriptionCategory(sub.category)}
        />
        {sub.provider ? (
          <DetailFact label="Provider" value={sub.provider} />
        ) : null}
        <DetailFact
          label="Auto-renew"
          value={sub.autoRenew === false ? 'Off' : 'On'}
        />
        <DetailFact label="Source" value={sub.source || 'manual'} last />
      </DetailFacts>

      {sub.note ? (
        <DetailSection label="Note">
          <Text variant="body" style={{ color: colors.mute }}>
            {sub.note}
          </Text>
        </DetailSection>
      ) : null}

      <DetailRemoveButton onPress={() => void onDelete()} />
    </ModuleScreen>
  );
}
