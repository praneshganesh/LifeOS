import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus, Search as SearchIcon, User } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { HomeSurfaceSwitch } from '@/components/HomeSurfaceSwitch';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { moduleHref } from '@/lib/moduleNav';
import { blurActiveElement } from '@/lib/a11y';
import type { HomeSurface } from '@/lib/homeSurface';

/** Shared top bar for home surfaces — Today, Ask, and Life. */
export function HomeHeader({
  surface,
  avatarLetter,
  onAdd,
}: {
  surface: HomeSurface;
  avatarLetter: string;
  /** Optional Add action — same size as profile avatar, sits left of search. */
  onAdd?: () => void;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  return (
    <View style={[styles.bar, { paddingTop: insets.top + 8 }]}>
      <View style={{ flex: 1 }}>
        <HomeSurfaceSwitch value={surface} />
      </View>
      {onAdd ? (
        <Pressable
          onPress={() => {
            blurActiveElement();
            onAdd();
          }}
          hitSlop={8}
          style={styles.iconBtn}
          accessibilityLabel="Add"
        >
          <Plus size={20} color={colors.ink} strokeWidth={2.4} />
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => {
          blurActiveElement();
          router.push(
            moduleHref(
              '/(tabs)/search',
              surface === 'things' ? 'things' : 'today'
            )
          );
        }}
        hitSlop={8}
        style={styles.iconBtn}
        accessibilityLabel="Search"
      >
        <SearchIcon size={20} color={colors.ink} strokeWidth={1.8} />
      </Pressable>
      <Pressable
        onPress={() => {
          blurActiveElement();
          router.push(
            moduleHref('/profile', surface === 'things' ? 'things' : 'today')
          );
        }}
        style={[
          styles.avatar,
          {
            backgroundColor: colors.surface,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: colors.line,
          },
        ]}
        accessibilityLabel="Profile"
      >
        {avatarLetter ? (
          <Text style={[styles.avatarLetter, { color: colors.ink }]}>
            {avatarLetter}
          </Text>
        ) : (
          <User size={15} color={colors.ink} strokeWidth={1.8} />
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
