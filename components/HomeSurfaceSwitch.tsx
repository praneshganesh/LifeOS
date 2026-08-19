import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text } from '@/components/ui/Text';
import { fonts, radius } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';
import {
  saveHomeSurface,
  type HomeSurface,
} from '@/lib/homeSurface';

export function HomeSurfaceSwitch({ value }: { value: HomeSurface }) {
  const { colors } = useTheme();
  const router = useRouter();

  function go(next: HomeSurface) {
    if (next === value) return;
    blurActiveElement();
    void saveHomeSurface(next);
    router.replace((next === 'ask' ? '/(tabs)/ask' : '/(tabs)') as Href);
  }

  return (
    <View
      style={[
        styles.track,
        { backgroundColor: colors.surfaceSoft, borderColor: colors.line },
      ]}
      accessibilityRole="tablist"
    >
      <Seg
        label="Today"
        active={value === 'today'}
        onPress={() => go('today')}
      />
      <Seg label="Ask" active={value === 'ask'} onPress={() => go('ask')} />
    </View>
  );
}

function Seg({
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
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[
        styles.seg,
        active && {
          backgroundColor: colors.surface,
          borderColor: colors.lineStrong,
        },
      ]}
    >
      <Text
        style={[
          styles.label,
          { color: active ? colors.ink : colors.mute },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 2,
  },
  seg: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'transparent',
  },
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    letterSpacing: -0.2,
  },
});
