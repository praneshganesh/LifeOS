import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '@/components/ui/Text';
import { useHousehold } from '@/lib/HouseholdContext';
import { loadLocalProfile, saveLocalProfile } from '@/lib/profile';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function OnboardingFamily() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { members, addMember } = useHousehold();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const alreadyHavePeople = members.length > 0;

  async function continueNext(addPerson: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (addPerson && trimmed) {
        await addMember({
          name: trimmed,
          role: 'adult',
          relation: 'You',
        });
        const existing = await loadLocalProfile();
        await saveLocalProfile({ ...existing, displayName: trimmed });
      }
      router.push('/onboarding/capture');
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.body, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Text style={styles.step}>Step 2 of 4</Text>
        <Text style={styles.title}>Who’s in the household?</Text>
        <Text style={styles.lead}>
          {alreadyHavePeople
            ? 'You already have people saved. Add another, or continue.'
            : 'Start with yourself — add partners, kids, or pets later.'}
        </Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Pranesh"
          placeholderTextColor={colors.faint}
          style={styles.input}
          autoFocus={!alreadyHavePeople}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => void continueNext(true)}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={() => void continueNext(Boolean(name.trim()))}
            disabled={!name.trim() && !alreadyHavePeople}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.92 },
              !name.trim() && !alreadyHavePeople && { opacity: 0.45 },
            ]}
          >
            <Text style={styles.ctaText}>
              {saving ? 'Saving…' : name.trim() ? 'Add & continue' : 'Continue'}
            </Text>
          </Pressable>
          <Pressable onPress={() => void continueNext(false)} hitSlop={8}>
            <Text style={styles.skip}>Skip for now</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  body: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
  },
  step: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.sansSemi,
    fontSize: 26,
    letterSpacing: -0.5,
    color: colors.ink,
    marginBottom: spacing.sm,
  },
  lead: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    color: colors.mute,
    marginBottom: spacing.xxl,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.sansMedium,
    fontSize: 17,
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  footer: {
    marginTop: 'auto',
    gap: spacing.md,
    paddingTop: spacing.xxl,
  },
  cta: {
    height: 52,
    borderRadius: radius.sm,
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
    fontSize: 16,
    color: colors.mute,
    textAlign: 'center',
  },
});
}
