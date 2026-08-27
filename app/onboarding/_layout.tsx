import { Stack } from 'expo-router';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerTitleStyle: {
          fontFamily: fonts.sansMedium,
          color: colors.ink,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'fade',
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="home" options={{ title: 'Your home', headerBackTitle: 'Back' }} />
      <Stack.Screen name="currency" options={{ title: 'Currency', headerBackTitle: 'Back' }} />
      <Stack.Screen name="family" options={{ title: 'Household', headerBackTitle: 'Back' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture', headerBackTitle: 'Back' }} />
      <Stack.Screen name="talk" options={{ title: 'Talk', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
