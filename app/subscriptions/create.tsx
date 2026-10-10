import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
  StyleSheet,
  Switch,
  View,
} from 'react-native';
import { Stack, Redirect, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailSection,
  DetailStickyActions,
  DetailTrashButton,
  DETAIL_STICKY_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useToast } from '@/lib/ToastContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { sanitizeAmountInput } from '@/lib/currency';
import {
  SUBSCRIPTION_CATEGORIES,
  SUBSCRIPTION_CYCLES,
  defaultRenewsOn,
  labelForCycle,
  parseAmount,
  type SubscriptionCategory,
  type SubscriptionCycle,
} from '@/lib/subscriptions';
import { confirmDelete } from '@/lib/confirmDelete';
import { MODULE_TONE_FALLBACK, moduleTone } from '@/lib/moduleTone';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export function SubscriptionForm({
  subscriptionId,
  inline = false,
}: {
  subscriptionId?: string;
  inline?: boolean;
}) {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { editId: editParam } = useLocalSearchParams<{ editId?: string }>();
  const paramEdit = Array.isArray(editParam) ? editParam[0] : editParam;
  const editId = subscriptionId || paramEdit;
  const { addSubscription, updateSubscription, removeSubscription, getById } =
    useSubscriptions();
  const { showToast, showError } = useToast();
  const { currency: defaultCurrency } = useCurrency();
  const existing = editId ? getById(editId) : undefined;
  const editing = Boolean(existing);
  const currency = existing?.currency || defaultCurrency;
  const tone = moduleTone('subscriptions', colors, resolved === 'light');

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('');
  const [cycle, setCycle] = useState<SubscriptionCycle>('monthly');
  const [category, setCategory] = useState<SubscriptionCategory>('other');
  const [renewsOn, setRenewsOn] = useState(defaultRenewsOn('monthly'));
  const [autoRenew, setAutoRenew] = useState(true);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [hydrated, setHydrated] = useState(!editId);

  useEffect(() => {
    if (!editId) return;
    const s = getById(editId);
    if (!s) {
      setHydrated(true);
      return;
    }
    setTitle(s.title);
    setAmount(String(s.amount));
    setProvider(s.provider || '');
    setCycle(s.cycle);
    setCategory(s.category);
    setRenewsOn(s.renewsOn || defaultRenewsOn(s.cycle));
    setAutoRenew(s.autoRenew !== false);
    setNote(s.note || '');
    setHydrated(true);
  }, [editId, getById]);

  const amountNum = parseAmount(amount);
  const canSave = Boolean(title.trim()) && Number.isFinite(amountNum) && amountNum > 0;

  function onCycle(next: SubscriptionCycle) {
    setCycle(next);
    if (!editing) setRenewsOn(defaultRenewsOn(next));
  }

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      if (editing && existing) {
        await updateSubscription(existing.id, {
          title: title.trim(),
          amount: amountNum,
          currency,
          cycle,
          category,
          renewsOn: renewsOn.trim() || defaultRenewsOn(cycle),
          provider: provider.trim() || undefined,
          autoRenew,
          note: note.trim() || undefined,
        });
        showToast('Subscription updated');
        if (!inline) router.replace(`/subscriptions/${existing.id}` as Href);
      } else {
        const sub = await addSubscription({
          title: title.trim(),
          amount: amountNum,
          currency,
          cycle,
          category,
          renewsOn: renewsOn.trim() || undefined,
          provider: provider.trim() || undefined,
          autoRenew,
          note: note.trim() || undefined,
          source: 'manual',
        });
        showToast('Subscription added');
        router.replace(`/subscriptions/${sub.id}` as Href);
      }
    } catch {
      showError('Couldn’t save the subscription — try again.');
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!existing) return;
    const ok = await confirmDelete(existing.title);
    if (!ok) return;
    try {
      await removeSubscription(existing.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/subscriptions' as Href);
  }

  const fields = (
    <>
      {!inline ? (
        <DetailSection label="Name">
          <DetailField
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Netflix"
            autoFocus={!editing}
          />
        </DetailSection>
      ) : null}

      <DetailSection label={`Amount (${currency})`}>
        <DetailField
          value={amount}
          onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
          placeholder="0.00"
          keyboardType="decimal-pad"
        />
      </DetailSection>

      <DetailSection label="Provider">
        <DetailField
          value={provider}
          onChangeText={setProvider}
          placeholder="e.g. Apple"
        />
      </DetailSection>

      <DetailSection label="Billing cycle">
        <DetailChipRow>
          {SUBSCRIPTION_CYCLES.map((c) => (
            <DetailChip
              key={c.id}
              label={c.label}
              selected={cycle === c.id}
              onPress={() => onCycle(c.id)}
              accent={colors.accent}
            />
          ))}
        </DetailChipRow>
      </DetailSection>

      <DetailSection label="Next renewal">
        <DateField value={renewsOn} onChange={setRenewsOn} />
      </DetailSection>

      <View style={[styles.switchRow, { backgroundColor: colors.surfaceSoft }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.switchTitle, { color: colors.ink }]}>Auto-renews</Text>
          <Text style={[styles.switchHint, { color: colors.mute }]}>
            Off if you cancel it and it just runs out.
          </Text>
        </View>
        <Switch
          value={autoRenew}
          onValueChange={setAutoRenew}
          trackColor={{ false: colors.lineStrong, true: colors.accent }}
          thumbColor={colors.white}
        />
      </View>

      <DetailSection label="Note">
        <DetailField
          value={note}
          onChangeText={setNote}
          placeholder="e.g. Family plan, shared with Maya"
        />
      </DetailSection>

      <DetailSection label="Category">
        <DetailChipRow>
          {SUBSCRIPTION_CATEGORIES.map((c) => (
            <DetailChip
              key={c.id}
              label={c.label}
              selected={category === c.id}
              onPress={() => setCategory(c.id)}
              accent={colors.accent}
            />
          ))}
        </DetailChipRow>
      </DetailSection>
    </>
  );

  const saveBar = (
    <DetailStickyActions>
      <DetailPrimaryButton
        label={saving ? 'Saving…' : editing ? 'Save changes' : 'Save subscription'}
        disabled={!canSave || saving}
        onPress={() => void save()}
      />
    </DetailStickyActions>
  );

  if (inline) {
    if (!hydrated) {
      return (
        <ModuleScreen
          title="Subscription"
          backLabel="Subscriptions"
          backFallbackHref="/subscriptions"
        >
          <Stack.Screen options={{ headerShown: false }} />
        </ModuleScreen>
      );
    }
    if (!existing) {
      return (
        <ModuleScreen
          title="Not found"
          backLabel="Subscriptions"
          backFallbackHref="/subscriptions"
        >
          <Stack.Screen options={{ headerShown: false }} />
          <Text variant="body">Subscription not found.</Text>
        </ModuleScreen>
      );
    }
    return (
      <ModuleScreen
        title={title.trim() || existing.title}
        backLabel="Subscriptions"
        backFallbackHref="/subscriptions"
        bottomExtra={DETAIL_STICKY_PAD}
        right={<DetailTrashButton onPress={() => void onDelete()} />}
        footer={saveBar}
        hero={
          <DetailHero
            eyebrow="Subscription"
            editableTitle
            titleValue={title}
            onTitleChange={setTitle}
            titlePlaceholder="Subscription name"
            meta={
              amount.trim()
                ? `${currency} ${amount} / ${labelForCycle(cycle)}`
                : undefined
            }
            accent={tone.accent}
            vividFallback={MODULE_TONE_FALLBACK.subscriptions}
          />
        }
      >
        <Stack.Screen options={{ headerShown: false }} />
        {fields}
      </ModuleScreen>
    );
  }

  if (editId && hydrated && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add subscription' }} />
        <View style={{ padding: spacing.lg }}>
          <Text variant="body">Subscription not found.</Text>
        </View>
      </Screen>
    );
  }

  if (!hydrated) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Add subscription' }} />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add subscription' }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_STICKY_PAD}>
        {fields}
      </KeyboardFormScroll>
      {saveBar}
    </Screen>
  );
}

export default function SubscriptionFormScreen() {
  const { editId: editParam } = useLocalSearchParams<{ editId?: string }>();
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  if (editId) {
    return <Redirect href={`/subscriptions/${editId}` as Href} />;
  }
  return <SubscriptionForm />;
}

function makeStyles(_colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      marginBottom: spacing.lg,
      borderRadius: radius.md,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    switchTitle: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
    },
    switchHint: {
      fontFamily: fonts.sans,
      fontSize: 13,
      marginTop: 2,
    },
  });
}
