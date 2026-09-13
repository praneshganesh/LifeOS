import { useTheme } from '@/lib/ThemeContext';
import { useCallback, useMemo, useRef } from 'react';
import { ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Plus } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  LastDoneActivityCard,
  LastDoneCategoryHeader,
} from '@/components/LastDoneActivityCard';
import { useLastDone } from '@/lib/LastDoneContext';
import { groupByCategory } from '@/lib/lastDoneCategories';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, radius, spacing  } from '@/constants/theme';

export default function DoneTabScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, logDone } = useLastDone();
  const groups = useMemo(() => groupByCategory(items), [items]);
  const scrollRef = useRef<ScrollView>(null);

  useFocusEffect(
    useCallback(() => {
      scrollRef.current?.scrollTo({ y: 0, animated: false });
    }, [])
  );

  function openLog() {
    blurActiveElement();
    router.push('/last-done' as Href);
  }

  function openDetail(id: string) {
    blurActiveElement();
    router.push(`/last-done/${id}` as Href);
  }

  return (
    <Screen>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 110 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text variant="title">Done</Text>
          </View>
          <Pressable
            onPress={openLog}
            style={({ pressed }) => [styles.logBtn, pressed && { opacity: 0.9 }]}
          >
            <Plus size={18} color={colors.forestOn} strokeWidth={2.2} />
          </Pressable>
        </View>

        {items.length === 0 ? (
          <Pressable
            onPress={openLog}
            style={({ pressed }) => [styles.empty, pressed && { opacity: 0.92 }]}
          >
            <Text variant="headline" style={{ color: colors.ink }}>
              Nothing logged yet
            </Text>
            <Text variant="caption" style={{ marginTop: 4 }}>
              Tap + to add
            </Text>
          </Pressable>
        ) : (
          groups.map(({ category, items: groupItems }) => (
            <View key={category.id}>
              <LastDoneCategoryHeader category={category} />
              {groupItems.map((item) => (
                <LastDoneActivityCard
                  key={item.id}
                  item={item}
                  onOpen={() => openDetail(item.id)}
                  onLog={() => void logDone({ id: item.id })}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  lead: {
    marginTop: 6,
    maxWidth: 280,
  },
  logBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    backgroundColor: colors.surfaceTint,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.forestSoft,
    padding: spacing.lg,
  },
});
}
