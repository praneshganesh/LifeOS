import { useTheme } from '@/lib/ThemeContext';
import { useMemo } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Trash2 } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import {
  LastDoneActivityCard,
  LastDoneCategoryHeader,
} from '@/components/LastDoneActivityCard';
import { useLastDone } from '@/lib/LastDoneContext';
import {
  formatRelativeDone,
  formatRemindStatus,
  sortLogsNewestFirst,
} from '@/lib/lastDone';
import { categorizeLastDone, paintLastDoneCategory } from '@/lib/lastDoneCategories';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, fonts, radius, shadows, spacing  } from '@/constants/theme';

function confirmDelete(message: string): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(message));
  }
  return new Promise((resolve) => {
    Alert.alert('Delete?', message, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

export default function LastDoneDetailScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { items, remove, removeLog, logDone } = useLastDone();

  const item = useMemo(
    () => items.find((i) => i.id === id),
    [items, id]
  );

  const logs = useMemo(
    () => (item ? sortLogsNewestFirst(item.logs ?? []) : []),
    [item]
  );

  const category = item
    ? paintLastDoneCategory(categorizeLastDone(item.label).id, colors)
    : null;

  async function onDeleteLog(logId: string) {
    if (!item) return;
    const ok = await confirmDelete('Remove this log entry?');
    if (!ok) return;
    blurActiveElement();
    const wasLast = logs.length <= 1;
    await removeLog(item.id, logId);
    if (wasLast) {
      if (router.canGoBack()) router.back();
    }
  }

  async function onDeleteAll() {
    if (!item) return;
    const ok = await confirmDelete(
      `Delete “${item.label}” and all ${logs.length} log${logs.length === 1 ? '' : 's'}?`
    );
    if (!ok) return;
    blurActiveElement();
    await remove(item.id);
    if (router.canGoBack()) router.back();
  }

  if (!item || !category) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Not found' }} />
        <View style={styles.missing}>
          <Text variant="bodyMedium" style={{ color: colors.mute }}>
            This activity is gone.
          </Text>
          <Pressable onPress={() => router.back()} style={styles.backLink}>
            <Text style={styles.backLinkText}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: item.label, headerBackTitle: 'Back' }} />
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <LastDoneCategoryHeader category={category} />
        <LastDoneActivityCard item={item} />

        {item.remindAt ? (
          <Text variant="caption" style={styles.remindLine}>
            {formatRemindStatus(item.remindAt)}
            {item.remindInterval
              ? ` · every ${item.remindInterval.value} ${item.remindInterval.unit}`
              : ''}
          </Text>
        ) : null}

        <View style={styles.sectionHead}>
          <Text variant="label" style={styles.sectionLabel}>
            All logs
          </Text>
          <Text variant="caption">{logs.length}</Text>
        </View>

        <View style={styles.listCard}>
          {logs.map((log, index) => {
            const last = index === logs.length - 1;
            const when = formatRelativeDone(log.doneAt);
            const absolute = new Date(log.doneAt).toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            });
            return (
              <View
                key={log.id}
                style={[styles.logRow, !last && styles.logRowBorder]}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text variant="headline" style={styles.logWhen}>
                    {when}
                  </Text>
                  <Text variant="caption" style={{ marginTop: 2 }}>
                    {absolute}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void onDeleteLog(log.id)}
                  hitSlop={10}
                  style={({ pressed }) => [
                    styles.deleteBtn,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityLabel={`Delete log from ${absolute}`}
                >
                  <Trash2 size={15} color={colors.coral} strokeWidth={2} />
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() => void logDone({ id: item.id })}
          style={({ pressed }) => [styles.markBtn, pressed && { opacity: 0.92 }]}
        >
          <Text style={styles.markBtnText}>Mark done again</Text>
        </Pressable>

        <Pressable
          onPress={() => void onDeleteAll()}
          style={({ pressed }) => [styles.dangerBtn, pressed && { opacity: 0.85 }]}
        >
          <Trash2 size={14} color={colors.coral} strokeWidth={2} />
          <Text style={styles.dangerBtnText}>Delete activity</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  backLink: {
    padding: spacing.sm,
  },
  backLinkText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  remindLine: {
    marginTop: -4,
    marginBottom: spacing.md,
    marginLeft: 2,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  sectionLabel: {
    color: colors.mute,
    fontSize: 16,
  },
  listCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    overflow: 'hidden',
    ...shadows.soft,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  logRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  logWhen: {
    fontSize: 16,
    lineHeight: 20,
  },
  deleteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.coralSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBtn: {
    marginTop: spacing.lg,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
  dangerBtn: {
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 44,
    borderRadius: radius.sm,
    backgroundColor: colors.coralSoft,
  },
  dangerBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
  },
});
}
