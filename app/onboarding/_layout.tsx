import { Stack } from 'expo-router';
import { useTheme } from '@/lib/ThemeContext';

export default function OnboardingLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: true,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="restore" />
      <Stack.Screen name="name" />
      <Stack.Screen name="family" />
      <Stack.Screen name="intent" />
      <Stack.Screen name="details" />
      <Stack.Screen name="how-it-works" />
      {/* Legacy routes: redirect if bookmarked mid-tour */}
      <Stack.Screen name="currency" />
      <Stack.Screen name="quiet-hours" />
      <Stack.Screen name="home" />
      <Stack.Screen name="capture" />
      <Stack.Screen name="talk" />
    </Stack>
  );
}
