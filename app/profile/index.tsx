import { useCallback, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
} from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow, StatStrip } from '@/components/ui/ListKit';
import {
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
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
import { moduleHref } from '@/lib/moduleNav';
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
  const accent = colors.amber;

  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const homes = spaces.filter((s) => s.kind === 'home').length;
  const docs = useMemo(
    () => items.filter((i) => isDocumentItem(i, documentsSpaceId)).length,
    [items, documentsSpaceId]
  );

  // Reload on focus so changes made elsewhere show when navigating back.
  // Skipped while the inline name editor is open to not clobber typing.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      if (!editing) {
        void loadLocalProfile().then((p) => {
          if (!live) return;
          setName(resolveSelfDisplayName(p.displayName, members) || p.displayName);
          setLocale(p.locale || '');
          setReady(true);
        });
      }
      void loadPlanPrefs().then((prefs) => {
        if (live) setPlanPrefs(prefs);
      });
      return () => {
        live = false;
      };
    }, [members, editing])
  );

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
      defaultOrigin="today"
      bottomExtra={DETAIL_DOCK_PAD}
      hero={
        <DetailHero
          eyebrow={letter ? `${letter} · You` : 'You'}
          title={name.trim() || 'You'}
          meta={planLabel}
          subtitle={locale || undefined}
          accent={accent}
          vividFallback="#A8884A"
        >
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
        </DetailHero>
      }
    >
      {editing ? (
        <>
          <DetailSection label="Display name">
            <DetailField
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              textContentType="none"
              autoCapitalize="words"
              editable={ready}
            />
          </DetailSection>
          <DetailSection label="Locale note">
            <DetailField
              value={locale}
              onChangeText={setLocale}
              placeholder="e.g. Dubai"
              editable={ready}
            />
          </DetailSection>
          <DetailPrimaryButton
            label={saving ? 'Saving…' : 'Save'}
            accent={accent}
            disabled={saving || !ready}
            onPress={() => void save()}
          />
        </>
      ) : null}

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
            onPress={() => router.push(moduleHref('/family', 'profile'))}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Saavi">
        <ListCard>
          <ListRow
            icon="bell"
            title="Notifications"
            onPress={() => router.push(moduleHref('/notifications', 'profile'))}
          />
          <ListRow
            icon="package"
            title="Things"
            onPress={() => router.push('/(tabs)/spaces' as Href)}
          />
          <ListRow
            icon="tools"
            title="Settings"
            onPress={() => router.push(moduleHref('/settings', 'profile'))}
            last
          />
        </ListCard>
      </ModuleSection>

      <Pressable
        onPress={() => router.push('/settings/plan' as Href)}
        style={[
          styles.upgrade,
          { backgroundColor: colors.surfaceSoft, borderColor: colors.line },
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
  editChip: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
  },
  editChipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 14,
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
