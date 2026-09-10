import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';
import {
  saveHomeSurface,
  type HomeSurface,
} from '@/lib/homeSurface';

export function HomeSurfaceSwitch({ value }: { value: HomeSurface }) {
  const router = useRouter();

  function go(next: HomeSurface) {
    if (next === value) return;
    blurActiveElement();
    void saveHomeSurface(next);
    const href =
      next === 'ask'
        ? '/(tabs)/ask'
        : next === 'things'
          ? '/(tabs)/spaces'
          : '/(tabs)';
    router.replace(href as Href);
  }

  return (
    <View style={styles.row} accessibilityRole="tablist">
      <Tab
        label="Today"
        active={value === 'today'}
        onPress={() => go('today')}
      />
      <Tab
        label="Life"
        active={value === 'things'}
        onPress={() => go('things')}
      />
    </View>
  );
}

function Tab({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.tab, { opacity: pressed ? 0.7 : 1 }]}
    >
      <Text
        style={[
          styles.label,
          { color: active ? colors.ink : colors.faint },
        ]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.marker,
          { backgroundColor: active ? colors.accent : 'transparent' },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 18,
  },
  tab: {
    alignItems: 'center',
  },
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.45,
  },
  marker: {
    width: 18,
    height: 2.5,
    borderRadius: 2,
    marginTop: 4,
  },
});
