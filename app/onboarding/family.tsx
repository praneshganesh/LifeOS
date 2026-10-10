import { useMemo, useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useHousehold } from '@/lib/HouseholdContext';
import { loadLocalProfile, saveLocalProfile } from '@/lib/profile';
import type { HouseholdRole } from '@/lib/household';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type DraftPerson = {
  key: string;
  name: string;
  role: HouseholdRole;
  relation: string;
};

const EXTRA_PRESETS: Array<{
  label: string;
  role: HouseholdRole;
  relation: string;
}> = [
  { label: 'Partner', role: 'adult', relation: 'Partner' },
  { label: 'Child', role: 'child', relation: 'Child' },
  { label: 'Parent', role: 'parent', relation: 'Parent' },
  { label: 'Pet', role: 'pet', relation: 'Pet' },
];

export default function OnboardingFamily() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { members, addMember } = useHousehold();
  const [yourName, setYourName] = useState('');
  const [extras, setExtras] = useState<DraftPerson[]>([]);
  const [draftName, setDraftName] = useState('');
  const [draftPreset, setDraftPreset] = useState(EXTRA_PRESETS[0]!);
  const [saving, setSaving] = useState(false);

  const alreadyHavePeople = members.length > 0;

  function addExtra() {
    const trimmed = draftName.trim();
    if (!trimmed) return;
    setExtras((prev) => [
      ...prev,
      {
        key: `d-${Date.now()}-${prev.length}`,
        name: trimmed,
        role: draftPreset.role,
        relation: draftPreset.relation,
      },
    ]);
    setDraftName('');
  }

  function removeExtra(key: string) {
    setExtras((prev) => prev.filter((p) => p.key !== key));
  }

  async function continueNext(includePeople: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (includePeople) {
        const selfName = yourName.trim();
        if (selfName) {
          await addMember({
            name: selfName,
            role: 'adult',
            relation: 'You',
            permission: 'owner',
          });
          const existing = await loadLocalProfile();
          await saveLocalProfile({ ...existing, displayName: selfName });
        }
        for (const p of extras) {
          await addMember({
            name: p.name,
            role: p.role,
            relation: p.relation,
          });
        }
      }
      router.push('/onboarding/currency');
    } finally {
      setSaving(false);
    }
  }

  const canContinue =
    Boolean(yourName.trim()) || alreadyHavePeople || extras.length > 0;

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.body,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
        keyboardShouldPersistTaps="handled"
        onScrollBeginDrag={Keyboard.dismiss}
      >
        <Text style={styles.step}>Step 2 of 5</Text>
        <Text style={styles.title}>Who’s in your household?</Text>
        <Text style={styles.lead}>
          Tag people on habits, classes, and Things. This is not sharing a
          login — Family plan invites come later if you subscribe.
        </Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          value={yourName}
          onChangeText={setYourName}
          placeholder="e.g. Pranesh"
          placeholderTextColor={colors.faint}
          style={styles.input}
          autoFocus={!alreadyHavePeople}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          autoCapitalize="words"
          returnKeyType="done"
        />

        <Text style={[styles.label, { marginTop: spacing.xl }]}>
          Add others (optional)
        </Text>
        <View style={styles.presets}>
          {EXTRA_PRESETS.map((p) => {
            const on = draftPreset.label === p.label;
            return (
              <Pressable
                key={p.label}
                onPress={() => setDraftPreset(p)}
                style={[styles.preset, on && styles.presetOn]}
              >
                <Text style={[styles.presetText, on && styles.presetTextOn]}>
                  {p.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.addRow}>
          <TextInput
            value={draftName}
            onChangeText={setDraftName}
            placeholder={`${draftPreset.label}’s name`}
            placeholderTextColor={colors.faint}
            style={[styles.input, styles.addInput]}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={addExtra}
          />
          <Pressable
            onPress={addExtra}
            disabled={!draftName.trim()}
            style={[
              styles.addBtn,
              { backgroundColor: colors.ink },
              !draftName.trim() && { opacity: 0.4 },
            ]}
          >
            <Text style={[styles.addBtnText, { color: colors.onInk }]}>Add</Text>
          </Pressable>
        </View>

        {extras.length > 0 ? (
          <View style={styles.list}>
            {extras.map((p) => (
              <View
                key={p.key}
                style={[
                  styles.listRow,
                  { backgroundColor: colors.surface, borderColor: colors.lineStrong },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.listName, { color: colors.ink }]}>{p.name}</Text>
                  <Text style={[styles.listMeta, { color: colors.mute }]}>
                    {p.relation}
                  </Text>
                </View>
                <Pressable onPress={() => removeExtra(p.key)} hitSlop={8}>
                  <X size={18} color={colors.mute} strokeWidth={2} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
        ]}
      >
        <Pressable
          onPress={() => void continueNext(true)}
          disabled={!canContinue && !alreadyHavePeople}
          style={({ pressed }) => [
            styles.cta,
            pressed && { opacity: 0.92 },
            !canContinue && !alreadyHavePeople && { opacity: 0.45 },
          ]}
        >
          <Text style={styles.ctaText}>
            {saving
              ? 'Saving…'
              : extras.length
                ? 'Save & continue'
                : yourName.trim()
                  ? 'Continue'
                  : 'Continue'}
          </Text>
        </Pressable>
        <Pressable onPress={() => void continueNext(false)} hitSlop={8}>
          <Text style={styles.skip}>Skip for now</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    body: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.md,
    },
    step: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      color: colors.mute,
      marginBottom: spacing.sm,
    },
    title: {
      fontFamily: fonts.sansSemi,
      fontSize: 28,
      color: colors.ink,
      marginBottom: spacing.sm,
    },
    lead: {
      fontFamily: fonts.sans,
      fontSize: 16,
      lineHeight: 24,
      color: colors.mute,
      marginBottom: spacing.xl,
    },
    label: {
      fontFamily: fonts.sansMedium,
      fontSize: 13,
      color: colors.mute,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    input: {
      fontFamily: fonts.sansMedium,
      fontSize: 17,
      color: colors.ink,
      backgroundColor: colors.surface,
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.lineStrong,
      paddingHorizontal: spacing.md,
      paddingVertical: 14,
    },
    presets: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    preset: {
      borderRadius: radius.md,
      borderWidth: 1.5,
      borderColor: colors.lineStrong,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    presetOn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    presetText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
      color: colors.ink,
    },
    presetTextOn: { color: colors.onInk },
    addRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
    },
    addInput: { flex: 1 },
    addBtn: {
      height: 48,
      paddingHorizontal: 16,
      borderRadius: radius.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    addBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
    },
    list: { marginTop: spacing.md, gap: 8 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderRadius: radius.md,
      borderWidth: 1.5,
      paddingHorizontal: spacing.md,
      paddingVertical: 12,
    },
    listName: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
    },
    listMeta: {
      fontFamily: fonts.sans,
      fontSize: 13,
      marginTop: 2,
    },
    footer: {
      paddingHorizontal: spacing.xl,
      paddingTop: spacing.sm,
      gap: spacing.md,
      alignItems: 'center',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.line,
    },
    cta: {
      alignSelf: 'stretch',
      height: 52,
      borderRadius: radius.md,
      backgroundColor: colors.forest,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ctaText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.forestOn,
    },
    skip: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.mute,
    },
  });
}
