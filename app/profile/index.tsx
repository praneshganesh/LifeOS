import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
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

export default function ProfileScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const [name, setName] = useState(DEFAULT_PROFILE.displayName);
  const [locale, setLocale] = useState(DEFAULT_PROFILE.locale || '');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
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
      Alert.alert('Saved', 'Profile stays on this device.');
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
      : `${plan.name} · on this device`;

  return (
    <ModuleScreen
      title="Profile"
      subtitle={locale || 'On this device'}
    >
      <View
        style={[
          styles.hero,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={[styles.avatar, { backgroundColor: colors.ink }]}>
          {letter ? (
            <Text style={[styles.letter, { color: colors.onInk }]}>{letter}</Text>
          ) : (
            <User size={28} color={colors.onInk} strokeWidth={1.8} />
          )}
        </View>
        <Text
          variant="title"
          style={{ marginTop: spacing.md, color: colors.ink, textAlign: 'center' }}
        >
          {name.trim() || 'You'}
        </Text>
        <Text variant="caption" style={{ marginTop: 6, color: colors.mute, textAlign: 'center' }}>
          On this device
        </Text>
        <View style={[styles.planPill, { backgroundColor: colors.surfaceSoft }]}>
          <Text style={[styles.planText, { color: colors.slate }]}>{planLabel}</Text>
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
        <View
          style={[
            styles.formCard,
            { backgroundColor: colors.surface, borderColor: colors.line },
          ]}
        >
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
              {saving ? 'Saving…' : 'Save profile'}
            </Text>
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
              : `${plan.name} on this device — billing comes later`}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    borderRadius: radius.lg,
    padding: spacing.xl,
    marginBottom: spacing.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.sansSemi,
    fontSize: 28,
  },
  planPill: {
    marginTop: spacing.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  planText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  formCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
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
