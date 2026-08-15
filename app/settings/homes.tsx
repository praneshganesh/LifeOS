import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useSpaces } from '@/lib/SpacesContext';
import { colors, fonts, spacing } from '@/constants/theme';

export default function HomesSettingsScreen() {
  const router = useRouter();
  const { spaces } = useSpaces();
  const homes = spaces.filter((s) => s.kind === 'home');

  return (
    <ModuleScreen title="Homes & defaults" subtitle="Your places on this device.">
      <ModuleSection label="Homes" count={homes.length}>
        <ListCard>
          {homes.map((h, i) => (
            <ListRow
              key={h.id}
              icon={h.icon}
              title={h.name}
              subtitle={h.meta}
              meta={h.id === 's1' ? 'Default' : h.custom ? 'Yours' : undefined}
              onPress={() => router.push(`/space/${h.id}` as Href)}
              last={i === homes.length - 1}
            />
          ))}
        </ListCard>
      </ModuleSection>
      <Pressable
        onPress={() => router.push('/space/create' as Href)}
        style={styles.add}
      >
        <Text style={styles.addText}>Add a home or space</Text>
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  add: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  addText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.forest,
  },
});
