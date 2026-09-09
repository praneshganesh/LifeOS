import { Stack } from 'expo-router';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

/** Nested module stack: back chrome only on list/detail; titled header on create forms. */
export default function ExpensesLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Cancel',
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: { fontFamily: fonts.sansMedium, color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="create" options={{ title: 'Add expense', headerBackTitle: 'Cancel' }} />
      <Stack.Screen name="[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
