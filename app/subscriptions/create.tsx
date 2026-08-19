import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
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
import { useSubscriptions } from '@/lib/SubscriptionsContext';
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
  const existing = editId ? getById(editId) : undefined;
  const editing = Boolean(existing);

  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [provider, setProvider] = useState('');
  const [cycle, setCycle] = useState<SubscriptionCycle>('monthly');
  const [category, setCategory] = useState<SubscriptionCategory>('other');
  const [renewsOn, setRenewsOn] = useState(defaultRenewsOn('monthly'));
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
          cycle,
          category,
          renewsOn: renewsOn.trim() || defaultRenewsOn(cycle),
          provider: provider.trim() || undefined,
        });
        router.replace(`/subscriptions/${existing.id}` as Href);
      } else {
        const sub = await addSubscription({
          title: title.trim(),
          amount: amountNum,
          cycle,
          category,
          renewsOn: renewsOn.trim() || undefined,
          provider: provider.trim() || undefined,
          source: 'manual',
        });
        router.replace(`/subscriptions/${sub.id}` as Href);
      }
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

          <Text style={styles.label}>Amount (AED)</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
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

          <Text style={styles.label}>Next renewal (YYYY-MM-DD)</Text>
          <TextInput
            value={renewsOn}
            onChangeText={setRenewsOn}
            placeholder="2026-09-01"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoCapitalize="none"
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
