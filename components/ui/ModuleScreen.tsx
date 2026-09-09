import { type ReactNode, useCallback, useMemo, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
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
import { fonts, radius, spacing, type ThemeColors } from '@/constants/theme';
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
}: ModuleScreenProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scrollRef = useRef<ScrollView>(null);
  const { backLabel, onBack: handleBack } = useModuleBack({
    defaultOrigin,
    backLabel: backLabelProp,
    backFallbackHref: backFallbackHrefProp,
    onBack: onBackProp,
  });

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  return (
    <Screen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            styles.chrome,
            {
              paddingTop: Math.max(insets.top, 12),
              borderBottomColor: colors.line,
              backgroundColor: colors.bgElevated,
            },
          ]}
        >
          {showBack ? (
            <Pressable
              onPress={handleBack}
              style={({ pressed }) => [
                styles.backBtn,
                pressed && styles.backBtnPressed,
              ]}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={backLabel ? `Go back to ${backLabel}` : 'Go back'}
            >
              <View style={[styles.backIcon, { backgroundColor: colors.surfaceSoft }]}>
                <ChevronLeft size={18} color={colors.ink} strokeWidth={2.6} />
              </View>
              <Text style={[styles.backLabel, { color: colors.ink }]}>{backLabel}</Text>
            </Pressable>
          ) : (
            <View style={styles.backSpacer} />
          )}

          <View style={styles.header}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text variant="title">{title}</Text>
              {subtitle ? (
                <Text variant="body" style={styles.lead}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
        </View>

        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 108 },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="always"
          keyboardDismissMode="on-drag"
        >
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
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

function makeStyles(colors: ThemeColors) {
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
      gap: 8,
      paddingVertical: 4,
      marginBottom: spacing.xs,
      marginLeft: -2,
      borderRadius: radius.sm,
    },
    backBtnPressed: {
      opacity: 0.7,
    },
    backIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: 'center',
      justifyContent: 'center',
    },
    backLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      letterSpacing: -0.2,
    },
    backSpacer: {
      height: 8,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.md,
    },
    lead: {
      marginTop: 2,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
    },
  });
}
