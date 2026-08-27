import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
} from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { ChevronRight, User } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { resolveSelfDisplayName, selfAvatarInitial } from '@/lib/people';
import { isDocumentItem, spaceIdByKind } from '@/lib/moduleFilters';
import {
  DEFAULT_PROFILE,
  loadLocalProfile,
  saveLocalProfile,
} from '@/lib/profile';
import {
  loadPlanPrefs,
  planById,
  trialDaysLeft,
  type PlanPrefs,
} from '@/lib/planLimits';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { useToast } from '@/lib/ToastContext';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const { showToast, showError } = useToast();
  const [name, setName] = useState(DEFAULT_PROFILE.displayName);
  const [locale, setLocale] = useState(DEFAULT_PROFILE.locale || '');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [planPrefs, setPlanPrefs] = useState<PlanPrefs>({ planId: 'trial' });

  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const homes = spaces.filter((s) => s.kind === 'home').length;
  const docs = useMemo(
    () => items.filter((i) => isDocumentItem(i, documentsSpaceId)).length,
    [items, documentsSpaceId]
  );

  useEffect(() => {
    void loadLocalProfile().then((p) => {
      setName(resolveSelfDisplayName(p.displayName, members) || p.displayName);
      setLocale(p.locale || '');
      setReady(true);
    });
    void loadPlanPrefs().then(setPlanPrefs);
  }, [members]);

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await saveLocalProfile({ displayName: name, locale });
      showToast('Profile saved');
      setEditing(false);
    } catch {
      showError('Couldn’t save your profile — try again.');
    } finally {
      setSaving(false);
    }
  }

  const letter = selfAvatarInitial(name, members);
  const plan = planById(planPrefs.planId);
  const daysLeft = trialDaysLeft(planPrefs);
  const planLabel =
    plan.id === 'trial'
      ? daysLeft != null && daysLeft > 0
        ? `Trial · ${daysLeft}d left`
        : daysLeft === 0 || (daysLeft != null && daysLeft <= 0)
          ? 'Trial ended'
          : 'Trial · 14 days'
      : plan.name;

  return (
    <ModuleScreen
      title="Profile"
      subtitle={locale || 'Your account'}
    >
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={styles.heroRow}>
          <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
            {letter ? (
              <Text style={[styles.letter, { color: colors.onInk }]}>{letter}</Text>
            ) : (
              <User size={22} color={colors.onInk} strokeWidth={1.8} />
            )}
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="headline" numberOfLines={1}>
              {name.trim() || 'You'}
            </Text>
            <Text variant="caption" style={{ marginTop: 2 }}>
              {planLabel}
            </Text>
          </View>
          <Pressable
            onPress={() => setEditing((v) => !v)}
            hitSlop={8}
            style={[styles.editChip, { backgroundColor: colors.surfaceSoft }]}
            accessibilityLabel={editing ? 'Stop editing profile' : 'Edit profile'}
          >
            <Text style={[styles.editChipText, { color: colors.slate }]}>
              {editing ? 'Cancel' : 'Edit'}
            </Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.editForm}>
            <Text style={[styles.label, { color: colors.mute }]}>Display name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={colors.faint}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.line,
                  color: colors.ink,
                },
              ]}
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              autoCapitalize="words"
              editable={ready}
            />
            <Text style={[styles.label, { color: colors.mute }]}>Locale note</Text>
            <TextInput
              value={locale}
              onChangeText={setLocale}
              placeholder="e.g. Dubai"
              placeholderTextColor={colors.faint}
              style={[
                styles.input,
                {
                  backgroundColor: colors.surfaceSoft,
                  borderColor: colors.line,
                  color: colors.ink,
                },
              ]}
              editable={ready}
            />
            <Pressable
              onPress={() => void save()}
              disabled={saving || !ready}
              style={[
                styles.save,
                { backgroundColor: colors.ink },
                saving && { opacity: 0.5 },
              ]}
            >
              <Text style={[styles.saveText, { color: colors.onInk }]}>
                {saving ? 'Saving…' : 'Save'}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <StatStrip
        items={[
          { label: 'Homes', value: String(homes) },
          { label: 'Things', value: String(items.length) },
          { label: 'Docs', value: String(docs) },
        ]}
      />

      <ModuleSection label="Household" count={members.length}>
        <ListCard>
          <ListRow
            icon="family"
            title="Household"
            subtitle={`${members.length} ${members.length === 1 ? 'person' : 'people'}`}
            onPress={() => router.push('/family' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Saavi">
        <ListCard>
          <ListRow
            icon="bell"
            title="Notifications"
            onPress={() => router.push('/notifications' as Href)}
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
        style={[
          styles.upgrade,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.upgradeTitle, { color: colors.ink }]}>Plan</Text>
          <Text variant="caption">
            {plan.id === 'trial'
              ? 'Full Pro while trial lasts — billing comes later'
              : `${plan.name} — billing comes later`}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.sansSemi,
    fontSize: 20,
  },
  editChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  editChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  editForm: {
    marginTop: spacing.sm,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  input: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  save: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    padding: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.xl,
  },
  upgradeTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    marginBottom: 2,
  },
});
