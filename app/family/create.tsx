import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { useHousehold } from '@/lib/HouseholdContext';
import type { HouseholdRole } from '@/lib/household';
import { messageForPlanLimit } from '@/lib/planLimits';
import { useToast } from '@/lib/ToastContext';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { noFocusRing } from '@/lib/a11y';

const ROLES: { id: HouseholdRole; label: string; hint: string }[] = [
  { id: 'adult', label: 'Adult', hint: 'You, partner, roommate' },
  { id: 'child', label: 'Child', hint: 'Kids' },
  { id: 'pet', label: 'Pet', hint: 'Dogs, cats…' },
];

const NAME_FIELD = {
  autoCorrect: false as const,
  spellCheck: false,
  autoComplete: 'off' as const,
  textContentType: 'none' as const,
  autoCapitalize: 'words' as const,
};

export default function NewFamilyMemberScreen() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addMember } = useHousehold();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [saving, setSaving] = useState(false);
  const [focus, setFocus] = useState<'name' | 'relation' | null>(null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const member = await addMember({
        name: trimmed,
        role,
        relation: relation.trim() || (role === 'adult' ? 'Family' : ''),
      });
      showToast(`${member.name} added`);
      router.replace(`/family/${member.id}`);
    } catch (err) {
      Alert.alert('Couldn’t add person', messageForPlanLimit(err) || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  const field = (key: 'name' | 'relation') => ({
    backgroundColor: colors.surface,
    borderColor: focus === key ? colors.ink : colors.line,
    color: colors.ink,
    ...noFocusRing,
  });

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add person' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 108 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[styles.label, { color: colors.mute }]}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ananya"
            placeholderTextColor={colors.faint}
            style={[styles.input, field('name')]}
            autoFocus
            onFocus={() => setFocus('name')}
            onBlur={() => setFocus(null)}
            {...NAME_FIELD}
          />

          <Text style={[styles.label, { color: colors.mute }]}>Relation</Text>
          <TextInput
            value={relation}
            onChangeText={setRelation}
            placeholder="e.g. Partner, Son, You"
            placeholderTextColor={colors.faint}
            style={[styles.input, field('relation')]}
            onFocus={() => setFocus('relation')}
            onBlur={() => setFocus(null)}
            {...NAME_FIELD}
          />

          <Text style={[styles.label, { color: colors.mute }]}>Type</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const on = role === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRole(r.id)}
                  style={[
                    styles.roleChip,
                    {
                      backgroundColor: on ? colors.ink : colors.surface,
                      borderColor: on ? colors.ink : colors.line,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.roleLabel,
                      { color: on ? colors.onInk : colors.ink },
                    ]}
                  >
                    {r.label}
                  </Text>
                  <Text
                    style={[
                      styles.roleHint,
                      { color: on ? colors.onInk : colors.mute, opacity: on ? 0.7 : 1 },
                    ]}
                  >
                    {r.hint}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={!name.trim() || saving}
            style={[
              styles.save,
              { backgroundColor: colors.ink },
              (!name.trim() || saving) && styles.saveDisabled,
            ]}
          >
            <Text style={[styles.saveText, { color: colors.onInk }]}>
              {saving ? 'Saving…' : 'Save'}
            </Text>
          </Pressable>
          {!name.trim() ? (
            <Text style={[styles.saveHint, { color: colors.mute }]}>
              Add a name to save.
            </Text>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  roleRow: {
    gap: spacing.sm,
  },
  roleChip: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
  roleLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  roleHint: {
    fontFamily: fonts.sans,
    fontSize: 16,
    marginTop: 2,
  },
  save: {
    marginTop: spacing.xl,
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
  },
  saveHint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    textAlign: 'center',
    marginTop: spacing.sm,
  },
});
