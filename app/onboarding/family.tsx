import { useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, FadeOut, LinearTransition, ZoomIn } from 'react-native-reanimated';
import { ArrowUp, Baby, Heart, PawPrint, UserRound, X, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import {
  OnboardingPrimaryButton,
  OnboardingScreen,
  enter,
  useOnboardingName,
} from '@/components/OnboardingKit';
import { useHousehold } from '@/lib/HouseholdContext';
import { moduleTone, type ModuleToneKey } from '@/lib/moduleTone';
import type { HouseholdRole } from '@/lib/household';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type Kind = {
  label: string;
  role: HouseholdRole;
  relation: string;
  Icon: LucideIcon;
  tone: ModuleToneKey;
};

const KINDS: Kind[] = [
  { label: 'Partner', role: 'adult', relation: 'Partner', Icon: Heart, tone: 'habits' },
  { label: 'Child', role: 'child', relation: 'Child', Icon: Baby, tone: 'classes' },
  { label: 'Parent', role: 'parent', relation: 'Parent', Icon: UserRound, tone: 'subscriptions' },
  { label: 'Pet', role: 'pet', relation: 'Pet', Icon: PawPrint, tone: 'expenses' },
];

function kindFor(relation: string | undefined): Kind | undefined {
  return KINDS.find((k) => k.relation === relation);
}

/** Hex color at low opacity, for soft tinted circles. */
function wash(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
  return `#${h.slice(0, 6)}${a}`;
}

export default function OnboardingFamily() {
  const { colors, resolved } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const hueOf = (k: Kind) => moduleTone(k.tone, colors, resolved === 'light').accent;
  const name = useOnboardingName();
  const { members, addMember, removeMember } = useHousehold();
  const [kind, setKind] = useState<Kind | null>(null);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<TextInput>(null);

  const others = members.filter((m) => m.relation !== 'You');

  async function add() {
    const trimmed = draft.trim();
    if (!trimmed || !kind) return;
    setDraft('');
    await addMember({ name: trimmed, role: kind.role, relation: kind.relation });
    inputRef.current?.focus();
  }

  async function next() {
    if (draft.trim() && kind) await add();
    router.push('/onboarding/intent');
  }

  return (
    <OnboardingScreen
      step={2}
      title={name ? `Who’s at home with you, ${name}?` : 'Who’s at home with you?'}
      lead="Add the people and pets you look after, so you can tag them on habits, classes, and Things. Only you can see this."
      footer={
        <OnboardingPrimaryButton
          label={others.length || draft.trim() ? 'Continue' : 'It’s just me'}
          onPress={() => void next()}
        />
      }
    >
      <Animated.View entering={enter(2)} style={styles.kinds}>
        {KINDS.map((k) => {
          const on = kind?.label === k.label;
          const hue = hueOf(k);
          return (
            <Pressable
              key={k.label}
              onPress={() => {
                setKind(k);
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Add a ${k.label.toLowerCase()}`}
              accessibilityState={{ selected: on }}
              style={({ pressed }) => [styles.kind, pressed && { transform: [{ scale: 0.95 }] }]}
            >
              <View
                style={[
                  styles.kindCircle,
                  { backgroundColor: wash(hue, 0.28), borderColor: on ? hue : 'transparent' },
                ]}
              >
                <k.Icon size={24} color={hue} strokeWidth={2} />
              </View>
              <Text style={[styles.kindLabel, { color: on ? colors.ink : colors.mute }]}>
                {k.label}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>

      {kind ? (
        <Animated.View entering={FadeIn.duration(220)} style={styles.addRow}>
          <TextInput
            ref={inputRef}
            value={draft}
            onChangeText={setDraft}
            placeholder={`${kind.label}’s name`}
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoCorrect={false}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void add()}
            blurOnSubmit={false}
            accessibilityLabel={`${kind.label}’s name`}
          />
          <Pressable
            onPress={() => void add()}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel={`Add ${kind.label.toLowerCase()}`}
            style={({ pressed }) => [
              styles.addBtn,
              { backgroundColor: colors.accent },
              !draft.trim() && { opacity: 0.35 },
              pressed && { opacity: 0.8 },
            ]}
          >
            <ArrowUp size={20} color={colors.accentOn} strokeWidth={2.4} />
          </Pressable>
        </Animated.View>
      ) : (
        <Animated.Text entering={enter(3)} style={styles.hint}>
          Tap one to add someone.
        </Animated.Text>
      )}

      {others.length > 0 ? (
        <Animated.View layout={LinearTransition} style={styles.people}>
          {others.map((m) => {
            const k = kindFor(m.relation);
            const hue = k ? hueOf(k) : colors.accent;
            return (
              <Animated.View
                key={m.id}
                entering={ZoomIn.springify().damping(16)}
                exiting={FadeOut.duration(150)}
                layout={LinearTransition}
                style={styles.person}
              >
                <View style={[styles.avatar, { backgroundColor: wash(hue, 0.3) }]}>
                  <Text style={[styles.avatarText, { color: hue }]}>
                    {m.name.trim().charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flexShrink: 1 }}>
                  <Text style={styles.personName} numberOfLines={1}>
                    {m.name}
                  </Text>
                  {m.relation ? <Text style={styles.personMeta}>{m.relation}</Text> : null}
                </View>
                <Pressable
                  onPress={() => void removeMember(m.id)}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${m.name}`}
                  style={styles.remove}
                >
                  <X size={14} color={colors.mute} strokeWidth={2.4} />
                </Pressable>
              </Animated.View>
            );
          })}
        </Animated.View>
      ) : null}
    </OnboardingScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    kinds: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: spacing.lg,
    },
    kind: {
      alignItems: 'center',
      gap: 8,
      width: 72,
    },
    kindCircle: {
      width: 64,
      height: 64,
      borderRadius: 32,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    kindLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
    },
    hint: {
      fontFamily: fonts.sans,
      fontSize: 15,
      color: colors.faint,
      textAlign: 'center',
    },
    addRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.surface,
      borderRadius: 28,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      paddingLeft: spacing.lg,
      paddingRight: 6,
      height: 56,
    },
    input: {
      flex: 1,
      fontFamily: fonts.sansMedium,
      fontSize: 17,
      color: colors.ink,
      height: '100%',
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
    },
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    people: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginTop: spacing.lg,
    },
    person: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      paddingLeft: 6,
      paddingRight: 10,
      paddingVertical: 6,
      maxWidth: '100%',
    },
    avatar: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
    },
    personName: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    personMeta: {
      fontFamily: fonts.sans,
      fontSize: 12,
      color: colors.mute,
    },
    remove: {
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceSoft,
      marginLeft: 2,
    },
  });
}
