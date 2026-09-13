import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ChevronLeft } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import { fonts, radius, spacing } from '@/constants/theme';
import { type ModuleOrigin } from '@/lib/moduleNav';
import { useModuleBack } from '@/lib/useModuleBack';
import { useTheme } from '@/lib/ThemeContext';

export interface ModuleScreenProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  right?: ReactNode;
  /** Whether to show the top back button. Defaults to true. */
  showBack?: boolean;
  /** Fallback origin when there is no `?from=` param. Defaults to 'today'. */
  defaultOrigin?: ModuleOrigin;
  /** Parent module label — overrides origin (e.g. detail → "Expenses"). */
  backLabel?: string;
  /** Custom back action. If omitted, calls router.back() or router.replace(backFallbackHref). */
  onBack?: () => void;
  /** Fallback URL if router.canGoBack() is false. */
  backFallbackHref?: Href;
  /**
   * Lifestyle detail: identity lives in a dotted hero below chrome.
   * When set, the chrome title/subtitle are hidden (back label stays).
   */
  hero?: ReactNode;
  /** Extra bottom scroll pad for the floating dock. Defaults to 108. */
  bottomExtra?: number;
}

/**
 * Shared module layout: fixed back chrome above the scroll area so navigation
 * never looks like empty header space, and titles stay consistent.
 */
export function ModuleScreen({
  title,
  subtitle,
  children,
  contentStyle,
  right,
  showBack = true,
  defaultOrigin = 'today',
  backLabel: backLabelProp,
  onBack: onBackProp,
  backFallbackHref: backFallbackHrefProp,
  hero,
  bottomExtra = 108,
}: ModuleScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(), []);
  const scrollRef = useRef<ScrollView>(null);
  const { backLabel, onBack: handleBack } = useModuleBack({
    defaultOrigin,
    backLabel: backLabelProp,
    backFallbackHref: backFallbackHrefProp,
    onBack: onBackProp,
  });
  const lifestyle = Boolean(hero);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  return (
    <Screen>
      <View
        style={[
          styles.chrome,
          {
            paddingTop: Math.max(insets.top, 12),
            borderBottomColor: colors.line,
            borderBottomWidth: lifestyle ? 0 : StyleSheet.hairlineWidth,
            paddingBottom: lifestyle ? spacing.xs : spacing.sm,
          },
        ]}
      >
        <View
          style={[
            styles.topRow,
            lifestyle && { marginBottom: spacing.xs },
          ]}
        >
          {showBack ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                { marginBottom: 0 },
                pressed && styles.backBtnPressed,
              ]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={backLabel ? `Go back to ${backLabel}` : 'Go back'}
            >
              <ChevronLeft size={22} color={colors.ink} strokeWidth={2.2} />
              <Text style={[styles.backLabel, { color: colors.ink }]}>{backLabel}</Text>
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}
          {lifestyle && right ? <View style={styles.topRight}>{right}</View> : null}
        </View>

        {!lifestyle ? (
          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title">{title}</Text>
              {subtitle ? (
                <Text variant="caption" style={styles.lead} numberOfLines={1}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
        ) : null}
      </View>

      <KeyboardFormScroll
        ref={scrollRef}
        contentContainerStyle={[styles.content, contentStyle]}
        bottomExtra={bottomExtra}
        keyboardShouldPersistTaps="always"
      >
        {hero}
        {children}
      </KeyboardFormScroll>
    </Screen>
  );
}

export function ModuleSection({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="label" style={[styles.sectionLabel, { color: colors.mute }]}>
          {label}
        </Text>
        {count != null ? <Text variant="caption">{count}</Text> : null}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    marginBottom: spacing.lg,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  sectionLabel: {},
});

function makeStyles() {
  return StyleSheet.create({
    chrome: {
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    backBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 2,
      paddingVertical: 4,
      marginBottom: spacing.md,
      marginLeft: -8,
      borderRadius: radius.sm,
    },
    backBtnPressed: {
      opacity: 0.55,
    },
    backLabel: {
      fontFamily: fonts.sans,
      fontSize: 17,
      letterSpacing: -0.2,
    },
    backSpacer: {
      height: 8,
    },
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
    },
    topRight: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
      marginTop: 2,
    },
    lead: {
      marginTop: 4,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
  });
}
