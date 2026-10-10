import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { DetailField } from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/lib/ThemeContext';
import { fonts, radius, spacing } from '@/constants/theme';

type Linkable = { id: string; name: string };

/**
 * Shows the current link as “None” (or the thing’s name). Typing filters
 * household things live — the full list is never laid out as chips.
 */
export function ThingLinkPicker({
  items,
  selectedId,
  selectedName,
  onSelect,
}: {
  items: Linkable[];
  selectedId?: string | null;
  selectedName?: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { colors } = useTheme();
  const [query, setQuery] = useState('');
  const selected = items.find((item) => item.id === selectedId);
  const name = selected?.name ?? (selectedId ? selectedName : null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return items.filter((item) => item.name.toLowerCase().includes(q)).slice(0, 8);
  }, [items, query]);

  function pick(id: string) {
    onSelect(id);
    setQuery('');
  }

  return (
    <View>
      <View style={styles.rest}>
        <Text style={[styles.valueText, { color: name ? colors.ink : colors.mute }]}>
          {name ?? 'None'}
        </Text>
        {selectedId ? (
          <Pressable onPress={() => onSelect(null)} hitSlop={8} accessibilityLabel="Clear linked thing">
            <Text style={[styles.clear, { color: colors.mute }]}>Clear</Text>
          </Pressable>
        ) : null}
      </View>
      <DetailField
        value={query}
        onChangeText={setQuery}
        placeholder="Search to link a thing"
        accessibilityLabel="Search things"
        autoCorrect={false}
      />
      {query.trim() && matches.length === 0 ? (
        <Text variant="caption" style={{ color: colors.mute, marginTop: spacing.xs }}>
          No matches
        </Text>
      ) : null}
      {matches.map((item) => (
        <Pressable
          key={item.id}
          onPress={() => pick(item.id)}
          style={({ pressed }) => [
            styles.match,
            {
              borderColor: colors.line,
              backgroundColor: pressed ? colors.surfaceSoft : colors.surface,
            },
          ]}
        >
          <Text style={{ color: colors.ink, fontFamily: fonts.sansMedium, fontSize: 15 }}>
            {item.name}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  rest: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  valueText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  clear: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
  },
  match: {
    marginTop: spacing.xs,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
});
