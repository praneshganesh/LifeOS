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
import { colors, fonts, radius, spacing } from '@/constants/theme';

const ROLES: { id: HouseholdRole; label: string; hint: string }[] = [
  { id: 'adult', label: 'Adult', hint: 'You, partner, roommate' },
  { id: 'child', label: 'Child', hint: 'Kids' },
  { id: 'pet', label: 'Pet', hint: 'Dogs, cats…' },
];

export default function NewFamilyMemberScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addMember } = useHousehold();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const member = await addMember({
        name: trimmed,
        role,
        relation: relation.trim() || (role === 'adult' ? 'Family' : ''),
        medicalNotes: notes.trim() || undefined,
      });
      router.replace(`/family/${member.id}`);
    } catch (err) {
      Alert.alert('Couldn’t add person', messageForPlanLimit(err) || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

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
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ananya"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>Relation</Text>
          <TextInput
            value={relation}
            onChangeText={setRelation}
            placeholder="e.g. Partner, Son, You"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.roleRow}>
            {ROLES.map((r) => {
              const on = role === r.id;
              return (
                <Pressable
                  key={r.id}
                  onPress={() => setRole(r.id)}
                  style={[styles.roleChip, on && styles.roleChipOn]}
                >
                  <Text style={[styles.roleLabel, on && styles.roleLabelOn]}>{r.label}</Text>
                  <Text style={styles.roleHint}>{r.hint}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Notes (optional)</Text>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Medical or care notes"
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.notes]}
            multiline
          />

          <Pressable
            onPress={() => void save()}
            disabled={!name.trim() || saving}
            style={[styles.save, (!name.trim() || saving) && styles.saveDisabled]}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save'}</Text>
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
  notes: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  roleRow: {
    gap: spacing.sm,
  },
  roleChip: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  roleChipOn: {
    borderColor: colors.forest,
    backgroundColor: colors.forestSoft,
  },
  roleLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.ink,
  },
  roleLabelOn: {
    color: colors.forest,
  },
  roleHint: {
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mute,
    marginTop: 2,
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
