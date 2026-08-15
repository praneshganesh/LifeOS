import { Stack } from 'expo-router';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function FamilyLayout() {
  const { colors } = useTheme();

  return (
    <Stack
      screenOptions={{
        headerBackTitle: 'Back',
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.forest,
        headerTitleStyle: { fontFamily: fonts.sansMedium, color: colors.ink },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="index" options={{ title: '' }} />
      <Stack.Screen name="create" options={{ title: 'Add person' }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
