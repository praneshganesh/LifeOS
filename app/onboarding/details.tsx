import { useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';
import { ChevronDown, Moon, Wallet, type LucideIcon } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { TimePillRow } from '@/components/ui/TimeField';
import { OnboardingPrimaryButton, OnboardingScreen, enter } from '@/components/OnboardingKit';
import {
  CURRENCY_OPTIONS,
  guessCurrencyFromDevice,
  resolveDefaultCurrency,
} from '@/lib/currency';
import { useCurrency } from '@/lib/CurrencyContext';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  normalizeQuietHoursTime,
  saveNotificationPrefs,
} from '@/lib/notificationPrefs';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingDetails() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { currency: saved, setCurrency } = useCurrency();
  const [currency, setPicked] = useState(
    () => resolveDefaultCurrency(saved) || guessCurrencyFromDevice()
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [start, setStart] = useState(DEFAULT_NOTIFICATION_PREFS.quietHoursStart);
  const [end, setEnd] = useState(DEFAULT_NOTIFICATION_PREFS.quietHoursEnd);
  const [saving, setSaving] = useState(false);
  const currencyName = CURRENCY_OPTIONS.find((c) => c.code === currency)?.hint;

  async function next() {
    if (saving) return;
    setSaving(true);
    try {
      await setCurrency(currency);
      const prefs = await loadNotificationPrefs();
      await saveNotificationPrefs({
        ...prefs,
        quietHoursStart: normalizeQuietHoursTime(start, DEFAULT_NOTIFICATION_PREFS.quietHoursStart),
        quietHoursEnd: normalizeQuietHoursTime(end, DEFAULT_NOTIFICATION_PREFS.quietHoursEnd),
      });
      router.push('/onboarding/how-it-works');
    } finally {
      setSaving(false);
    }
  }

  return (
    <OnboardingScreen
      step={4}
      title="Two quick things"
      lead="We’ve guessed these for you. You can change them later in Settings."
      footer={
        <OnboardingPrimaryButton
          label={saving ? 'Saving…' : 'Looks good'}
          onPress={() => void next()}
        />
      }
    >
      <Animated.View entering={enter(2)} layout={LinearTransition} style={styles.card}>
        <Pressable
          onPress={() => setPickerOpen((v) => !v)}
          accessibilityRole="button"
          accessibilityLabel={`Currency, ${currency}${currencyName ? `, ${currencyName}` : ''}`}
          accessibilityHint="Shows other currencies"
          accessibilityState={{ expanded: pickerOpen }}
          style={styles.cardHead}
        >
          <Badge Icon={Wallet} colors={colors} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Currency</Text>
            <Text style={styles.cardSub}>For spending and subscriptions</Text>
          </View>
          <View style={[styles.valuePill, { backgroundColor: colors.surfaceSoft }]}>
            <Text style={styles.valueText}>{currency}</Text>
            <View style={{ transform: [{ rotate: pickerOpen ? '180deg' : '0deg' }] }}>
              <ChevronDown size={14} color={colors.mute} strokeWidth={2.4} />
            </View>
          </View>
        </Pressable>

        {pickerOpen && Platform.OS !== 'android' ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={styles.currencies}
            accessibilityRole="radiogroup"
          >
            {CURRENCY_OPTIONS.map((c) => {
              const on = c.code === currency;
              return (
                <Pressable
                  key={c.code}
                  onPress={() => {
                    setPicked(c.code);
                    setPickerOpen(false);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  accessibilityLabel={`${c.code}, ${c.hint}`}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: on ? colors.accent : colors.surfaceSoft,
                    },
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Text style={[styles.chipText, { color: on ? colors.accentOn : colors.ink }]}>
                    {c.code}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>
        ) : null}
      </Animated.View>

      {Platform.OS === 'android' ? (
        <Modal
          visible={pickerOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setPickerOpen(false)}
        >
          <Pressable
            style={styles.modalBackdrop}
            onPress={() => setPickerOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close currency list"
          >
            <Pressable
              style={[styles.modalSheet, { backgroundColor: colors.surface }]}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={styles.modalTitle}>Currency</Text>
              <ScrollView
                style={styles.modalScroll}
                contentContainerStyle={styles.currencies}
                keyboardShouldPersistTaps="handled"
              >
                {CURRENCY_OPTIONS.map((c) => {
                  const on = c.code === currency;
                  return (
                    <Pressable
                      key={c.code}
                      onPress={() => {
                        setPicked(c.code);
                        setPickerOpen(false);
                      }}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`${c.code}, ${c.hint}`}
                      style={({ pressed }) => [
                        styles.chip,
                        {
                          backgroundColor: on ? colors.accent : colors.surfaceSoft,
                        },
                        pressed && { opacity: 0.7 },
                      ]}
                    >
                      <Text
                        style={[styles.chipText, { color: on ? colors.accentOn : colors.ink }]}
                      >
                        {c.code}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}

      <Animated.View entering={enter(3)} layout={LinearTransition} style={styles.card}>
        <View style={styles.cardHead}>
          <Badge Icon={Moon} colors={colors} />
          <View style={styles.cardText}>
            <Text style={styles.cardTitle}>Quiet nights</Text>
            <Text style={styles.cardSub}>Reminders stay silent while you sleep</Text>
          </View>
        </View>
        <View style={[styles.times, { borderTopColor: colors.line }]}>
          <TimePillRow label="From" value={start} onChange={setStart} />
          <TimePillRow label="Until" value={end} onChange={setEnd} last />
        </View>
      </Animated.View>
    </OnboardingScreen>
  );
}

function Badge({ Icon, colors }: { Icon: LucideIcon; colors: ThemeColors }) {
  return (
    <View style={[badgeStyle, { backgroundColor: colors.accentWash }]}>
      <Icon size={18} color={colors.glyph} strokeWidth={2.1} />
    </View>
  );
}

const badgeStyle = {
  width: 38,
  height: 38,
  borderRadius: 12,
  alignItems: 'center',
  justifyContent: 'center',
} as const;

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 22,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      marginBottom: 12,
      overflow: 'hidden',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.35)',
      justifyContent: 'flex-end',
      padding: spacing.lg,
    },
    modalSheet: {
      borderRadius: 22,
      maxHeight: '70%',
      paddingTop: spacing.md,
      paddingBottom: spacing.lg,
    },
    modalTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 17,
      color: colors.ink,
      paddingHorizontal: spacing.md,
      marginBottom: spacing.sm,
    },
    modalScroll: {
      maxHeight: 360,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: spacing.md,
    },
    cardText: { flex: 1 },
    cardTitle: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
      color: colors.ink,
    },
    cardSub: {
      fontFamily: fonts.sans,
      fontSize: 13,
      color: colors.mute,
      marginTop: 1,
    },
    valuePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 12,
      height: 32,
      borderRadius: 16,
    },
    valueText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.ink,
    },
    currencies: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.md,
    },
    chip: {
      paddingHorizontal: 14,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    chipText: {
      fontFamily: fonts.sansSemi,
      fontSize: 14,
    },
    times: {
      borderTopWidth: StyleSheet.hairlineWidth,
    },
  });
}
