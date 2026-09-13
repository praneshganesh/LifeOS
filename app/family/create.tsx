import { useState } from 'react';
import {
  Alert,
  StyleSheet,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { useHousehold } from '@/lib/HouseholdContext';
import type { HouseholdRole } from '@/lib/household';
import { messageForPlanLimit } from '@/lib/planLimits';
import { useToast } from '@/lib/ToastContext';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { noFocusRing } from '@/lib/a11y';

const ROLES: { id: HouseholdRole; label: string }[] = [
  { id: 'adult', label: 'Adult' },
  { id: 'child', label: 'Child' },
  { id: 'pet', label: 'Pet' },
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
  const router = useRouter();
  const { addMember } = useHousehold();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [saving, setSaving] = useState(false);
  const accent = colors.amber;

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

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add person' }} />
      <KeyboardFormScroll
        contentContainerStyle={styles.content}
        bottomExtra={DETAIL_DOCK_PAD}
      >
        <DetailSection label="Name">
          <DetailField
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ananya"
            autoFocus
            style={noFocusRing}
            {...NAME_FIELD}
          />
        </DetailSection>

        <DetailSection label="Relation">
          <DetailField
            value={relation}
            onChangeText={setRelation}
            placeholder="e.g. Partner, Son, You"
            style={noFocusRing}
            {...NAME_FIELD}
          />
        </DetailSection>

        <DetailSection label="Type">
          <DetailChipRow>
            {ROLES.map((r) => (
              <DetailChip
                key={r.id}
                label={r.label}
                selected={role === r.id}
                onPress={() => setRole(r.id)}
                accent={accent}
              />
            ))}
          </DetailChipRow>
        </DetailSection>

        <DetailPrimaryButton
          label={saving ? 'Saving…' : 'Save'}
          accent={accent}
          disabled={!name.trim() || saving}
          onPress={() => void save()}
        />
      </KeyboardFormScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
});
