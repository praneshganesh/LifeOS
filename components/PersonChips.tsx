import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/components/ui/Text';
import type { HouseholdMember } from '@/lib/household';
import { useHousehold } from '@/lib/HouseholdContext';
import { messageForPlanLimit } from '@/lib/planLimits';
import { selfMember } from '@/lib/people';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export function PersonChips({
  members,
  personId,
  onChange,
  label = 'Who',
  noneLabel = 'Unassigned',
  allowCreate = true,
}: {
  members: HouseholdMember[];
  personId: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  noneLabel?: string;
  /** Show a "+ New" chip that creates a household member inline. */
  allowCreate?: boolean;
}) {
  const { colors } = useTheme();
  const { addMember } = useHousehold();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  // The user's own member chip reads "Me" — otherwise it shows their name
  // right next to the "unassigned" chip and looks like two different people.
  const self = selfMember(members);

  if (!members.length && !allowCreate) return null;

  async function createPerson() {
    const name = newName.trim();
    if (!name || saving) return;
    setSaving(true);
    try {
      const member = await addMember({
        name,
        role: 'adult',
        relation: 'Family',
      });
      onChange(member.id);
      setNewName('');
      setAdding(false);
    } catch (err) {
      Alert.alert('Couldn’t add person', messageForPlanLimit(err) || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Text style={[styles.label, { color: colors.mute }]}>{label}</Text>
      <View style={styles.chips}>
        <Pressable
          onPress={() => onChange(null)}
          style={[
            styles.chip,
            {
              backgroundColor: !personId ? colors.accentSoft : colors.surface,
              borderColor: !personId ? colors.accent : colors.line,
            },
          ]}
        >
          <Text
            style={[
              styles.chipText,
              { color: !personId ? colors.accent : colors.ink },
            ]}
          >
            {noneLabel}
          </Text>
        </Pressable>
        {members.map((m) => {
          const on = personId === m.id;
          return (
            <Pressable
              key={m.id}
              onPress={() => onChange(m.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: on ? colors.accentSoft : colors.surface,
                  borderColor: on ? colors.accent : colors.line,
                },
              ]}
            >
              <Text
                style={[styles.chipText, { color: on ? colors.accent : colors.ink }]}
              >
                {m.id === self?.id ? 'Me' : m.name}
              </Text>
            </Pressable>
          );
        })}
        {allowCreate && !adding ? (
          <Pressable
            onPress={() => setAdding(true)}
            style={[
              styles.chip,
              styles.chipDashed,
              { borderColor: colors.line, backgroundColor: colors.surface },
            ]}
          >
            <Text style={[styles.chipText, { color: colors.mute }]}>+ New</Text>
          </Pressable>
        ) : null}
      </View>
      {allowCreate && adding ? (
        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            placeholder="Name, e.g. Maya"
            placeholderTextColor={colors.faint}
            autoFocus
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void createPerson()}
            style={[
              styles.addInput,
              {
                color: colors.ink,
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          />
          <Pressable
            onPress={() => void createPerson()}
            disabled={!newName.trim() || saving}
            style={[
              styles.addBtn,
              { backgroundColor: colors.accent },
              (!newName.trim() || saving) && { opacity: 0.45 },
            ]}
          >
            <Text style={[styles.addBtnText, { color: colors.accentOn }]}>
              {saving ? '…' : 'Add'}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => {
              setAdding(false);
              setNewName('');
            }}
            hitSlop={8}
          >
            <Text style={[styles.cancel, { color: colors.mute }]}>Cancel</Text>
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
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
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipDashed: {
    borderStyle: 'dashed',
    borderWidth: 1,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  addInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 16,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  addBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radius.md,
  },
  addBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  cancel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
