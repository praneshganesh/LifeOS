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

const SEGMENTS: { key: HomeSurface; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'things', label: 'Life' },
];

/** iOS-style segmented control for the two home surfaces. */
export function HomeSurfaceSwitch({ value }: { value: HomeSurface }) {
  const router = useRouter();
  const { colors, resolved } = useTheme();

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
    <View
      style={[styles.track, { backgroundColor: colors.surfaceSoft }]}
      accessibilityRole="tablist"
    >
      {SEGMENTS.map((seg) => {
        const active = seg.key === value;
        return (
          <Pressable
            key={seg.key}
            onPress={() => go(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.segment,
              active && [
                styles.segmentOn,
                {
                  backgroundColor:
                    resolved === 'dark' ? colors.surfaceTint : colors.surface,
                },
              ],
              pressed && !active && { opacity: 0.6 },
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: active ? colors.ink : colors.mute },
              ]}
            >
              {seg.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    minWidth: 76,
    height: 30,
    paddingHorizontal: 14,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentOn: {
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.2,
  },
});
