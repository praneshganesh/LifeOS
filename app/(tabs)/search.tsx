import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';
import { useMemo, useState } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  TextInput,
  Pressable,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Search as SearchIcon } from 'lucide-react-native';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { Card } from '@/components/ui/Card';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useClasses } from '@/lib/ClassesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { confirmDelete } from '@/lib/confirmDelete';
import { crossSearch, type SearchHit } from '@/lib/crossSearch';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

/**
 * On-device cross-search — Things, docs, spaces, spend, habits, people.
 * No LLM.
 */
export default function SearchScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { items: inventory, removeItem, getById } = useInventory();
  const { showError } = useToast();
  const { spaces } = useSpaces();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { packs: classPacks } = useClasses();
  const { members } = useHousehold();
  const { subscriptions } = useSubscriptions();
  const { items: lastDone } = useLastDone();
  const [query, setQuery] = useState('');

  async function onDeleteThing(assetId: string, name: string) {
    if (!getById(assetId)) return;
    const ok = await confirmDelete(name);
    if (!ok) return;
    await removeItem(assetId).catch(() => showError('Couldn’t delete — try again.'));
  }

  const spaceNameById = useMemo(
    () => Object.fromEntries(spaces.map((s) => [s.id, s.name])),
    [spaces]
  );

  const result = useMemo(
    () =>
      crossSearch({
        query,
        inventory,
        spaces,
        spaceNameById,
        expenses,
        habits,
        classPacks,
        people: members,
        subscriptions,
        lastDone,
      }),
    [
      query,
      inventory,
      spaces,
      spaceNameById,
      expenses,
      habits,
      classPacks,
      members,
      subscriptions,
      lastDone,
    ]
  );

  const sections: { label: string; hits: SearchHit[] }[] = [
    { label: 'Things', hits: result.things },
    { label: 'Documents', hits: result.documents },
    { label: 'Spaces', hits: result.spaces },
    { label: 'Expenses', hits: result.expenses },
    { label: 'Subscriptions', hits: result.subscriptions },
    { label: 'Habits', hits: result.habits },
    { label: 'Classes', hits: result.classes },
    { label: 'People', hits: result.people },
    { label: 'Maintenance', hits: result.maintenance },
  ].filter((s) => s.hits.length > 0);

  return (
    <ModuleScreen
      title="Search"
      defaultOrigin="today"
    >
      <View style={styles.inputCard}>
        <SearchIcon size={18} color={colors.mute} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Passport, coffee, Prado…"
          placeholderTextColor={colors.faint}
          style={styles.input}
          autoCorrect={false}
          autoFocus
          returnKeyType="search"
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </View>

      {!query.trim() ? (
        <>
          <Text variant="label" style={styles.blockLabel}>
            Try
          </Text>
          <View style={styles.chips}>
            {result.chips.map((chip) => (
              <Pressable
                key={chip}
                onPress={() => setQuery(chip)}
                style={styles.chip}
              >
                <Text style={styles.chipText}>{chip}</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <View style={{ marginTop: spacing.lg }}>
          <Text variant="caption" style={{ marginBottom: spacing.md }}>
            {result.total} result{result.total === 1 ? '' : 's'}
          </Text>

          {sections.map((section) => (
            <View key={section.label} style={{ marginBottom: spacing.md }}>
              <Text variant="label" style={styles.groupLabel}>
                {section.label}
              </Text>
              {section.hits.map((hit) =>
                hit.kind === 'thing' || hit.kind === 'document' ? (
                  <SwipeableThingRow
                    key={`${hit.kind}-${hit.id}`}
                    name={hit.title}
                    icon={hit.icon}
                    subtitle={hit.subtitle}
                    onPress={() => router.push(hit.href as Href)}
                    onEdit={
                      getById(hit.id)
                        ? () => router.push(`/asset/edit/${hit.id}` as Href)
                        : undefined
                    }
                    onDelete={
                      getById(hit.id)
                        ? () => void onDeleteThing(hit.id, hit.title)
                        : undefined
                    }
                  />
                ) : (
                  <HitCard
                    key={`${hit.kind}-${hit.id}`}
                    icon={hit.icon}
                    title={hit.title}
                    subtitle={hit.subtitle}
                    styles={styles}
                    onPress={() => router.push(hit.href as Href)}
                  />
                )
              )}
            </View>
          ))}

          {result.total === 0 ? (
            <Text variant="body">
              Nothing matched. Try a name, brand, merchant, habit, or person.
            </Text>
          ) : null}
        </View>
      )}
    </ModuleScreen>
  );
}

function HitCard({
  icon,
  title,
  subtitle,
  onPress,
  styles,
}: {
  icon: Icon3DName;
  title: string;
  subtitle: string;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <Card style={styles.resultCard} onPress={onPress}>
      <View style={styles.resultRow}>
        <Icon3DBadge name={icon} size={48} />
        <View style={{ flex: 1 }}>
          <Text variant="headline">{title}</Text>
          {subtitle ? (
            <Text variant="caption" style={{ marginTop: 4 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    inputCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.white,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
      paddingHorizontal: spacing.lg,
      height: 52,
    },
    input: {
      flex: 1,
      fontFamily: fonts.sans,
      fontSize: 16,
      color: colors.ink,
      ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
    },
    clear: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.forest,
    },
    blockLabel: {
      marginTop: spacing.xl,
      marginBottom: spacing.sm,
      color: colors.mute,
    },
    groupLabel: {
      marginBottom: spacing.sm,
      marginTop: spacing.sm,
      color: colors.mute,
    },
    chips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: colors.white,
      borderRadius: radius.full,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.line,
    },
    chipText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.slate,
    },
    resultCard: {
      marginBottom: spacing.sm,
      paddingVertical: spacing.md,
    },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
    },
  });
}
