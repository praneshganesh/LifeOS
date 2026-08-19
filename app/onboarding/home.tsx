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
import { useSpaces } from '@/lib/SpacesContext';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

const HOME_ID = 's1';

export default function OnboardingHome() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getSpace, updateSpace } = useSpaces();
  const home = getSpace(HOME_ID);
  const [name, setName] = useState(home?.name && home.name !== 'Home' ? home.name : '');
  const [saving, setSaving] = useState(false);

  async function continueNext() {
    if (saving) return;
    setSaving(true);
    try {
      const trimmed = name.trim();
      if (trimmed) {
        await updateSpace(HOME_ID, {
          name: trimmed,
          meta: home?.meta === 'Your place' ? 'Your place' : home?.meta,
        });
      }
      router.push('/onboarding/family');
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
        <Text style={styles.step}>Step 1 of 4</Text>
        <Text style={styles.title}>What do you call home?</Text>
        <Text style={styles.lead}>
          Spaces hold rooms and Things. You can rename this anytime in Settings.
        </Text>

        <Text style={styles.label}>Home name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Marina apartment"
          placeholderTextColor={colors.faint}
          style={styles.input}
          autoFocus
          returnKeyType="next"
          onSubmitEditing={() => void continueNext()}
        />

        <View style={styles.footer}>
          <Pressable
            onPress={() => void continueNext()}
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.92 }]}
          >
            <Text style={styles.ctaText}>{saving ? 'Saving…' : 'Continue'}</Text>
          </Pressable>
          <Pressable onPress={() => router.push('/onboarding/family')} hitSlop={8}>
            <Text style={styles.skip}>Keep “Home” for now</Text>
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
