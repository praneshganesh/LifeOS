import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { FilterChips, ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useClasses } from '@/lib/ClassesContext';
import { buildAttentionItems } from '@/lib/attention';
import { useAttentionDismissals } from '@/lib/attentionDismiss';
import { moduleHref } from '@/lib/moduleNav';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors, colors, fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const FILTERS = [
  { key: 'open', label: 'Open' },
  { key: 'urgent', label: 'Urgent' },
  { key: 'soon', label: 'Soon' },
];

/**
 * M7 — action queue derived from the same attention data as Notifications.
 * Add opens the reminder composer (not a separate task store).
 */
export default function TasksScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { items } = useInventory();
  const { items: lastDone } = useLastDone();
  const { subscriptions } = useSubscriptions();
  const { packs: classPacks } = useClasses();
  const [filter, setFilter] = useState('open');
  const { dismiss, isDismissed } = useAttentionDismissals();

  const queue = useMemo(
    () =>
      buildAttentionItems(items, lastDone, subscriptions, classPacks).filter(
        (a) =>
          (a.urgency === 'urgent' || a.urgency === 'soon') && !isDismissed(a.id)
      ),
    [items, lastDone, subscriptions, classPacks, isDismissed]
  );

  const list = useMemo(() => {
    if (filter === 'urgent') return queue.filter((a) => a.urgency === 'urgent');
    if (filter === 'soon') return queue.filter((a) => a.urgency === 'soon');
    return queue;
  }, [queue, filter]);

  const urgent = queue.filter((a) => a.urgency === 'urgent').length;
  const soon = queue.filter((a) => a.urgency === 'soon').length;

  function openAddReminder() {
    blurActiveElement();
    router.push(moduleHref('/last-done?mode=remind', 'things'));
  }

  return (
    <ModuleScreen
      title="Tasks & reminders"
      subtitle="Due soon from warranties, docs, renewals, and reminders."
      defaultOrigin="things"
      right={
        <Pressable
          onPress={openAddReminder}
          style={styles.addBtn}
          accessibilityLabel="Add reminder"
        >
          <Plus size={18} color={colors.forest} strokeWidth={2.2} />
          <Text style={styles.addLabel}>Add</Text>
        </Pressable>
      }
    >
      <StatStrip
        items={[
          { label: 'Open', value: String(queue.length) },
          { label: 'Urgent', value: String(urgent) },
          { label: 'Soon', value: String(soon) },
        ]}
      />
      <FilterChips options={FILTERS} value={filter} onChange={setFilter} />
      <ModuleSection label="Queue" count={list.length}>
        {list.length === 0 ? (
          <View style={{ paddingVertical: 12 }}>
            <Text variant="body" style={{ color: colors.mute }}>
              Nothing queued. Tap Add to set a reminder, or add warranty / renewal dates on Things.
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
                onPress={() => {
                  if (a.href) router.push(a.href as Href);
                }}
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
    addBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.forestSoft,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: radius.full,
    },
    addLabel: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.forest,
    },
    emptyAdd: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: spacing.md,
      backgroundColor: colors.forest,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: radius.full,
    },
    emptyAddText: {
      fontFamily: fonts.sansMedium,
      fontSize: 15,
      color: colors.forestOn,
    },
  });
}
