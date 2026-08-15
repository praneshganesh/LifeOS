import { Stack } from 'expo-router';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function SpaceLayout() {
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
      <Stack.Screen name="create" options={{ title: 'New space' }} />
      {/* Detail sets its own title — no ModuleScreen hero */}
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="edit/[id]" options={{ title: 'Edit space' }} />
    </Stack>
  );
}
