import { useMemo } from 'react';
import { useTheme } from '@/lib/ThemeContext';
import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { type ThemeColors,  colors, fonts, spacing  } from '@/constants/theme';

export default function NotFoundScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <View style={styles.container}>
          <Text variant="title">This screen doesn’t exist</Text>
          <Text variant="body" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Head back home and keep going.
          </Text>
          <Link href="/" style={styles.link}>
            <Text style={styles.linkText}>Go home</Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: {
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
  },
  linkText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
});
}
