import { Link, Stack } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { colors, fonts, spacing } from '@/constants/theme';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <Screen>
        <View style={styles.container}>
          <Text variant="title">This screen doesn’t exist</Text>
          <Text variant="body" style={{ marginTop: spacing.sm, textAlign: 'center' }}>
            Head back to Chat and keep going.
          </Text>
          <Link href="/" style={styles.link}>
            <Text style={styles.linkText}>Go to Chat</Text>
          </Link>
        </View>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
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
    fontSize: 15,
    color: colors.forest,
  },
});
