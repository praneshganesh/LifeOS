import { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput } from 'react-native';
import { useRouter } from 'expo-router';
import Animated from 'react-native-reanimated';
import {
  OnboardingPrimaryButton,
  OnboardingScreen,
  OnboardingSecondaryButton,
  enter,
} from '@/components/OnboardingKit';
import { useHousehold } from '@/lib/HouseholdContext';
import { DEFAULT_PROFILE, loadLocalProfile, saveLocalProfile } from '@/lib/profile';
import { type ThemeColors, fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingName() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { members, addMember, updateMember } = useHousehold();
  const [name, setName] = useState('');
  const [focused, setFocused] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void loadLocalProfile().then((p) => {
      if (p.displayName && p.displayName !== DEFAULT_PROFILE.displayName) {
        setName((cur) => cur || p.displayName);
      }
    });
  }, []);

  const trimmed = name.trim();

  async function next(save: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      if (save && trimmed) {
        const existing = await loadLocalProfile();
        await saveLocalProfile({ ...existing, displayName: trimmed });
        const self = members.find((m) => m.relation === 'You');
        if (self) {
          if (self.name !== trimmed) await updateMember(self.id, { name: trimmed });
        } else {
          await addMember({
            name: trimmed,
            role: 'adult',
            relation: 'You',
            permission: 'owner',
          });
        }
      }
      router.push('/onboarding/family');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingScreen
      step={1}
      title="First, what should we call you?"
      lead="Just your first name is fine."
      footer={
        <>
          <OnboardingPrimaryButton
            label="Continue"
            onPress={() => void next(true)}
            disabled={!trimmed || saving}
          />
          <OnboardingSecondaryButton label="Skip" onPress={() => void next(false)} />
        </>
      }
    >
      <Animated.View entering={enter(2)}>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="Your name"
          placeholderTextColor={colors.faint}
          style={[styles.input, { borderBottomColor: focused ? colors.accent : colors.line }]}
          autoFocus
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoCorrect={false}
          spellCheck={false}
          autoComplete="given-name"
          textContentType="givenName"
          autoCapitalize="words"
          returnKeyType="next"
          onSubmitEditing={() => trimmed && void next(true)}
          accessibilityLabel="Your name"
          maxLength={40}
        />
      </Animated.View>
    </OnboardingScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    input: {
      fontFamily: fonts.sansSemi,
      fontSize: 30,
      letterSpacing: -0.6,
      color: colors.ink,
      paddingVertical: 10,
      borderBottomWidth: 2,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
    },
  });
}
