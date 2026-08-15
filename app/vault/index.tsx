import { useEffect, useMemo, useState } from 'react';
import { Alert, View, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { authenticateForVault } from '@/components/AppLockGate';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  docBucket,
  expiryMeta,
  isDocumentItem,
  spaceIdByKind,
} from '@/lib/moduleFilters';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export default function VaultScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const ok = await authenticateForVault();
      if (!alive) return;
      setUnlocked(ok);
      setChecking(false);
      if (!ok) {
        Alert.alert(
          'Vault locked',
          'Unlock with Face ID / biometrics, or turn off vault lock in Settings → Security.'
        );
        if (router.canGoBack()) router.back();
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  const identityDocs = useMemo(
    () =>
      items
        .filter((d) => isDocumentItem(d, documentsSpaceId))
        .filter((d) => docBucket(d) === 'Identity')
        .slice(0, 6),
    [items, documentsSpaceId]
  );

  const emergencyPeople = useMemo(
    () =>
      members.filter((m) => {
        if (m.role === 'pet') return false;
        const rel = m.relation.toLowerCase();
        return (
          m.role === 'adult' ||
          m.role === 'parent' ||
          /partner|spouse|wife|husband|parent|mom|dad|emergency/i.test(rel)
        );
      }),
    [members]
  );

  if (checking) {
    return (
      <ModuleScreen title="Emergency vault" subtitle="Unlocking…">
        <View style={{ paddingVertical: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.forest} />
        </View>
      </ModuleScreen>
    );
  }

  if (!unlocked) {
    return (
      <ModuleScreen title="Emergency vault" subtitle="Locked">
        <Text variant="body" style={{ color: colors.mute }}>
          Biometrics required. Try again from Settings → Security if this keeps failing.
        </Text>
      </ModuleScreen>
    );
  }

  return (
    <ModuleScreen
      title="Emergency vault"
      subtitle="Critical docs and people — on this device."
    >
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>Unlocked on this device</Text>
        <Text variant="caption" style={{ marginTop: 4, color: colors.forestOn }}>
          Vault lock is controlled in Settings → Security.
        </Text>
      </View>

      <ModuleSection label="Identity" count={identityDocs.length}>
        {identityDocs.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute }}>
            No identity documents yet. Capture a passport or ID.
          </Text>
        ) : (
          <ListCard>
            {identityDocs.map((d, i) => (
              <ListRow
                key={d.id}
                icon={d.icon}
                title={d.name}
                subtitle={expiryMeta(d.expiryDate || d.warrantyExpiry)}
                onPress={() => router.push(`/asset/${d.id}` as Href)}
                last={i === identityDocs.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>

      <ModuleSection label="People" count={emergencyPeople.length}>
        {emergencyPeople.length === 0 ? (
          <Text variant="body" style={{ color: colors.mute }}>
            Add household adults in Family.
          </Text>
        ) : (
          <ListCard>
            {emergencyPeople.map((m, i) => (
              <ListRow
                key={m.id}
                icon={m.icon}
                title={m.name}
                subtitle={m.relation}
                onPress={() => router.push(`/family/${m.id}` as Href)}
                last={i === emergencyPeople.length - 1}
              />
            ))}
          </ListCard>
        )}
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  bannerTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forestOn,
  },
});
