import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
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
  parseAmount,
  type SubscriptionCategory,
  type SubscriptionCycle,
} from '@/lib/subscriptions';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function SubscriptionFormScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { editId: editParam } = useLocalSearchParams<{ editId?: string }>();
  const editId = Array.isArray(editParam) ? editParam[0] : editParam;
  const { addSubscription, updateSubscription, getById } = useSubscriptions();
  const { showToast, showError } = useToast();
  const { currency: defaultCurrency } = useCurrency();
  const existing = editId ? getById(editId) : undefined;
  const editing = Boolean(existing);
  const currency = existing?.currency || defaultCurrency;

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
        router.replace(`/subscriptions/${existing.id}` as Href);
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

  if (editId && hydrated && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit subscription' }} />
        <View style={{ padding: spacing.lg }}>
          <Text variant="body">Subscription not found.</Text>
        </View>
      </Screen>
    );
  }

  if (!hydrated) {
    return (
      <Screen>
        <Stack.Screen
          options={{ title: editing ? 'Edit subscription' : 'Add subscription' }}
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen
        options={{ title: editing ? 'Edit subscription' : 'Add subscription' }}
      />
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
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Netflix"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus={!editing}
          />

          <Text style={styles.label}>Amount ({currency})</Text>
          <TextInput
            value={amount}
            onChangeText={(t) => setAmount(sanitizeAmountInput(t))}
            placeholder="0.00"
            placeholderTextColor={colors.faint}
            style={styles.input}
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>Provider (optional)</Text>
          <TextInput
            value={provider}
            onChangeText={setProvider}
            placeholder="e.g. Apple"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Billing cycle</Text>
          <View style={styles.chips}>
            {SUBSCRIPTION_CYCLES.map((c) => {
              const on = cycle === c.id;
              return (
                <Pressable
                  key={c.id}
                  onPress={() => onCycle(c.id)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Next renewal</Text>
          <DateField value={renewsOn} onChange={setRenewsOn} />

          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Auto-renews</Text>
              <Text style={styles.switchHint}>
                Off if you cancel it and it just runs out.
              </Text>
            </View>
            <Switch
              value={autoRenew}
              onValueChange={setAutoRenew}
              trackColor={{ false: colors.lineStrong, true: colors.forest }}
              thumbColor={colors.white}
            />
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. Family plan, shared with Maya"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chips}>
            {SUBSCRIPTION_CATEGORIES.map((c) => {
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
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Save subscription'}
            </Text>
          </Pressable>
          {!canSave ? (
            <Text style={styles.saveHint}>
              {!title.trim()
                ? 'Add a name to save.'
                : 'Enter an amount above 0 to save.'}
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
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
    color: colors.forestOn,
  },
  saveHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    color: colors.mute,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.md,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  switchTitle: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  switchHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    color: colors.mute,
    marginTop: 2,
  },
});
}
