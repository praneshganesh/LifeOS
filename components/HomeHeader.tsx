import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Search as SearchIcon, User } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { HomeSurfaceSwitch } from '@/components/HomeSurfaceSwitch';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';
import type { HomeSurface } from '@/lib/homeSurface';

/** Shared top bar for the two home surfaces — identical on Today and Ask. */
export function HomeHeader({
  surface,
  avatarLetter,
}: {
  surface: HomeSurface;
  avatarLetter: string;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={{ flex: 1 }}>
        <HomeSurfaceSwitch value={surface} />
      </View>
      <Pressable
        onPress={() => {
          blurActiveElement();
          router.push('/(tabs)/search' as Href);
        }}
        hitSlop={8}
        style={styles.iconBtn}
        accessibilityLabel="Search"
      >
        <SearchIcon size={20} color={colors.slate} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        onPress={() => {
          blurActiveElement();
          router.push('/profile' as Href);
        }}
        style={[styles.avatar, { backgroundColor: colors.ink }]}
        accessibilityLabel="Profile"
      >
        {avatarLetter ? (
          <Text style={[styles.avatarLetter, { color: colors.onInk }]}>
            {avatarLetter}
          </Text>
        ) : (
          <User size={15} color={colors.onInk} strokeWidth={1.8} />
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
});
