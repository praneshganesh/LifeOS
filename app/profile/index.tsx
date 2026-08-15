import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { isDocumentItem, spaceIdByKind } from '@/lib/moduleFilters';
import {
  DEFAULT_PROFILE,
  loadLocalProfile,
  saveLocalProfile,
} from '@/lib/profile';
import { colors, fonts, radius, spacing } from '@/constants/theme';

export default function ProfileScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const [name, setName] = useState(DEFAULT_PROFILE.displayName);
  const [locale, setLocale] = useState(DEFAULT_PROFILE.locale || '');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);

  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const homes = spaces.filter((s) => s.kind === 'home').length;
  const docs = useMemo(
    () => items.filter((i) => isDocumentItem(i, documentsSpaceId)).length,
    [items, documentsSpaceId]
  );

  useEffect(() => {
    void loadLocalProfile().then((p) => {
      setName(p.displayName);
      setLocale(p.locale || '');
      setReady(true);
    });
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await saveLocalProfile({ displayName: name, locale });
      Alert.alert('Saved', 'Profile stays on this device.');
    } finally {
      setSaving(false);
    }
  }

  const letter = (name.trim() || 'Y').slice(0, 1).toUpperCase();

  return (
    <ModuleScreen
      title="Profile"
      subtitle={locale || 'On this device'}
    >
      <View style={styles.hero}>
        <View style={styles.avatar}>
          <Text style={styles.letter}>{letter}</Text>
        </View>
        <Text variant="headline" style={{ marginTop: spacing.md }}>
          {name.trim() || 'You'}
        </Text>
        <Text variant="caption" style={{ marginTop: 4 }}>
          Local profile — no account yet
        </Text>
        <View style={styles.planPill}>
          <Text style={styles.planText}>Free · on this device</Text>
        </View>
      </View>

      <StatStrip
        items={[
          { label: 'Homes', value: String(homes) },
          { label: 'Things', value: String(items.length) },
          { label: 'Docs', value: String(docs) },
        ]}
      />

      <ModuleSection label="Your details">
        <View style={styles.formCard}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.faint}
            style={styles.input}
            editable={ready}
          />
          <Text style={styles.label}>Locale note</Text>
          <TextInput
            value={locale}
            onChangeText={setLocale}
            placeholder="e.g. Dubai"
            placeholderTextColor={colors.faint}
            style={styles.input}
            editable={ready}
          />
          <Pressable
            onPress={() => void save()}
            disabled={saving || !ready}
            style={[styles.save, saving && { opacity: 0.5 }]}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save profile'}</Text>
          </Pressable>
        </View>
      </ModuleSection>

      <ModuleSection label="Household" count={members.length}>
        <ListCard>
          <ListRow
            icon="family"
            title="Family"
            subtitle={`${members.length} people on this device`}
            onPress={() => router.push('/family' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="LifeOS">
        <ListCard>
          <ListRow
            icon="bell"
            title="Notifications"
            onPress={() => router.push('/notifications' as Href)}
          />
          <ListRow
            icon="shield"
            title="Emergency vault"
            onPress={() => router.push('/vault' as Href)}
          />
          <ListRow
            icon="package"
            title="Things"
            onPress={() => router.push('/(tabs)/spaces' as Href)}
          />
          <ListRow
            icon="tools"
            title="Settings"
            onPress={() => router.push('/settings' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <Pressable
        onPress={() => router.push('/settings/plan' as Href)}
        style={styles.upgrade}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.upgradeTitle}>Plan</Text>
          <Text variant="caption">Local Free for now — billing comes later</Text>
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.sansSemi,
    fontSize: 28,
    color: colors.forestOn,
  },
  planPill: {
    marginTop: spacing.md,
    backgroundColor: colors.forestSoft,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  planText: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.forest,
  },
  formCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.mute,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  save: {
    marginTop: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.pure,
  },
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginBottom: spacing.xl,
  },
  upgradeTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.ink,
    marginBottom: 2,
  },
});
