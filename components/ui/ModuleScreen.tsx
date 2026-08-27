import { type ReactNode, useCallback, useRef } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Shared scroll layout for module screens — keeps padding consistent. */
export function ModuleScreen({
  title,
  subtitle,
  children,
  contentStyle,
  right,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  right?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  return (
    <Screen>
      {/* Detail screens edit inline (classes, habits, family) — keep the
          focused field and Save reachable above the keyboard. */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 108 },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="title">{title}</Text>
              {subtitle ? (
                <Text variant="body" style={styles.lead}>
                  {subtitle}
                </Text>
              ) : null}
            </View>
            {right}
          </View>
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  lead: {
    marginTop: 2,
  },
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
