import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { AddButton } from '@/components/ui/AddButton';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useClasses } from '@/lib/ClassesContext';
import { openAttentionQueue } from '@/lib/attention';
import { useAttentionDismissals } from '@/lib/attentionDismiss';
import { moduleHrefPreserveFrom } from '@/lib/moduleNav';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'soon', label: 'Soon' },
];

/**
 * M7, action queue derived from the same attention data as Notifications.
 * Add opens the reminder composer (not a separate task store).
 */
export default function TasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { items } = useInventory();
  const { items: lastDone, logDone } = useLastDone();
  const { subscriptions } = useSubscriptions();
  const { packs: classPacks } = useClasses();
  const [filter, setFilter] = useState('open');
  const { dismiss, isDismissed } = useAttentionDismissals();

  const queue = useMemo(
    () =>
      openAttentionQueue(items, lastDone, subscriptions, classPacks).filter(
        (a) => !isDismissed(a.id)
      ),
    [items, lastDone, subscriptions, classPacks, isDismissed]
  );

  const list = useMemo(() => {
    if (filter === 'soon') return queue.filter((a) => a.urgency === 'soon');
    return queue;
  }, [queue, filter]);

  const soon = queue.filter((a) => a.urgency === 'soon').length;

  function openAddReminder() {
    blurActiveElement();
    router.push(moduleHrefPreserveFrom('/last-done?mode=remind', from));
  }

  return (
    <ModuleScreen
      title="Tasks & reminders"
      defaultOrigin="today"
      right={
        <AddButton onPress={openAddReminder} label="Add reminder" />
      }
    >
      <StatStrip
        items={[
          { label: 'Open', value: String(queue.length) },
          { label: 'Soon', value: String(soon) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Queue" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Nothing queued.
            </Text>
            <Pressable
              onPress={openAddReminder}
              style={({ pressed }) => [styles.emptyAdd, pressed && { opacity: 0.9 }]}
            >
              <Plus size={16} color={colors.forestOn} strokeWidth={2.4} />
              <Text style={styles.emptyAddText}>Add reminder</Text>
            </Pressable>
          </View>
        ) : (
          <ListCard>
            {list.map((a, i) => (
              <ListRow
                key={a.id}
                icon={a.icon}
                title={a.title}
                subtitle={a.subtitle}
                meta={a.category}
                tone={
                  a.urgency === 'urgent'
                    ? colors.coral
                    : a.urgency === 'soon'
                      ? colors.amber
                      : undefined
                }
                onPress={a.href ? () => router.push(a.href as Href) : undefined}
                onComplete={
                  a.id.startsWith('ld-')
                    ? () => void logDone({ id: a.id.slice(3) })
                    : undefined
                }
                onDismiss={() => void dismiss(a.id)}
                last={i === list.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    emptyAdd: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: spacing.md,
      backgroundColor: colors.forest,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.md,
      minHeight: 40,
      justifyContent: 'center',
    },
    emptyAddText: {
      fontFamily: fonts.sansSemi,
      fontSize: 15,
      color: colors.forestOn,
    },
  });
}
