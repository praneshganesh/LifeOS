import { Stack } from 'expo-router';
import { colors, fonts } from '@/constants/theme';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.forest,
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
      <Stack.Screen name="family" options={{ title: 'Household', headerBackTitle: 'Back' }} />
      <Stack.Screen name="capture" options={{ title: 'Capture', headerBackTitle: 'Back' }} />
      <Stack.Screen name="talk" options={{ title: 'Talk', headerBackTitle: 'Back' }} />
    </Stack>
  );
}
