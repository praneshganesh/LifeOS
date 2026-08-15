import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { DateField } from '@/components/ui/DateField';
import { useClasses } from '@/lib/ClassesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { addCalendarMonths, localDayKey } from '@/lib/dates';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const MONTH_CHIPS = [1, 2, 3, 6] as const;

export default function CreateClassPackScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addPack } = useClasses();
  const { members } = useHousehold();
  const [title, setTitle] = useState('');
  const [total, setTotal] = useState('24');
  const [months, setMonths] = useState(3);
  const [startsOn, setStartsOn] = useState(localDayKey());
  const [personId, setPersonId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const endsOn = useMemo(
    () => addCalendarMonths(startsOn, months),
    [startsOn, months]
  );
  const person = members.find((m) => m.id === personId);
  const totalN = Math.max(1, Math.round(Number(total) || 0));
  const canSave = Boolean(title.trim()) && totalN > 0;

  async function save() {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const pack = await addPack({
        title: title.trim(),
        total: totalN,
        months,
        startsOn,
        endsOn,
        personId: person?.id,
        assignedTo: person?.name,
      });
      router.replace(`/classes/${pack.id}` as Href);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New class pack' }} />
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
          <Text variant="body" style={{ color: colors.mute, marginBottom: spacing.md }}>
            A finite pack — like 24 skating classes in 3 months — not a daily habit.
          </Text>

          <Text style={styles.label}>Class</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Skating, Piano, Swimming"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>How many classes</Text>
          <TextInput
            value={total}
            onChangeText={setTotal}
            keyboardType="number-pad"
            placeholder="24"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Use within</Text>
          <View style={styles.chips}>
            {MONTH_CHIPS.map((n) => {
              const on = months === n;
              return (
                <Pressable
                  key={n}
                  onPress={() => setMonths(n)}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {n} {n === 1 ? 'month' : 'months'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Starts</Text>
          <DateField value={startsOn} onChange={setStartsOn} />

          <Text style={styles.preview}>
            {totalN} classes until{' '}
            {new Date(`${endsOn}T12:00:00`).toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </Text>

          {members.length ? (
            <>
              <Text style={styles.label}>Who (optional)</Text>
              <View style={styles.chips}>
                <Pressable
                  onPress={() => setPersonId(null)}
                  style={[styles.chip, !personId && styles.chipOn]}
                >
                  <Text style={[styles.chipText, !personId && styles.chipTextOn]}>
                    Unassigned
                  </Text>
                </Pressable>
                {members.map((m) => {
                  const on = personId === m.id;
                  return (
                    <Pressable
                      key={m.id}
                      onPress={() => setPersonId(m.id)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {m.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Pressable
            onPress={() => void save()}
            disabled={!canSave || saving}
            style={[styles.save, (!canSave || saving) && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>
              {saving ? 'Saving…' : 'Save class pack'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
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
  preview: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 14,
    color: colors.forest,
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
    fontSize: 13,
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
