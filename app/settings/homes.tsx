import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSpaces } from '@/lib/SpacesContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { CURRENCY_OPTIONS, labelForCurrency } from '@/lib/currency';
import { useToast } from '@/lib/ToastContext';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

export default function HomesSettingsScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { spaces } = useSpaces();
  const { currency, setCurrency } = useCurrency();
  const { showToast, showError } = useToast();
  const homes = spaces.filter((s) => s.kind === 'home');

  async function onPickCurrency(code: string) {
    if (code === currency) return;
    try {
      await setCurrency(code);
      showToast(`Currency set to ${code}`);
    } catch {
      showError('Couldn’t save currency — try again.');
    }
  }

  return (
    <ModuleScreen
      title="Homes & defaults"
      subtitle="Your places and household currency."
      backLabel="Settings"
      backFallbackHref="/settings"
    >
      <ModuleSection label="Homes" count={homes.length}>
        <ListCard>
          {homes.map((h, i) => (
            <ListRow
              key={h.id}
              icon={h.icon}
              title={h.name}
              subtitle={h.meta}
              meta={h.id === 's1' ? 'Default' : h.custom ? 'Yours' : undefined}
              onPress={() => router.push(`/space/${h.id}` as Href)}
              last={i === homes.length - 1}
            />
          ))}
        </ListCard>
      </ModuleSection>
      <Pressable
        onPress={() => router.push('/space/create' as Href)}
        style={styles.add}
      >
        <Text style={styles.addText}>Add a home or space</Text>
      </Pressable>

      <ModuleSection label="Currency">
        <Text style={styles.currencyLead}>
          Default for new expenses, subscriptions, and Talk. Current:{' '}
          {labelForCurrency(currency)}.
        </Text>
        <View style={styles.chips}>
          {CURRENCY_OPTIONS.map((c) => {
            const on = currency === c.code;
            return (
              <Pressable
                key={c.code}
                onPress={() => void onPickCurrency(c.code)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {c.code}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </ModuleSection>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    add: {
      marginTop: spacing.lg,
      alignItems: 'center',
      paddingVertical: spacing.md,
    },
    addText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.forest,
    },
    currencyLead: {
      fontFamily: fonts.sans,
      fontSize: 14,
      color: colors.mute,
      marginBottom: spacing.sm,
      lineHeight: 20,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
    },
    chipOn: {
      backgroundColor: colors.ink,
      borderColor: colors.ink,
    },
    chipText: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.slate,
    },
    chipTextOn: {
      color: colors.onInk,
    },
  });
}
