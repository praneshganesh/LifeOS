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
  DetailHero,
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
  type LocalProfile,
} from '@/lib/profile';
import {
  loadPlanPrefs,
  planById,
  trialDaysLeft,
  TRIAL_DAYS,
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
  const { showError } = useToast();
  const [name, setName] = useState(DEFAULT_PROFILE.displayName);
  const [profile, setProfile] = useState<LocalProfile>(DEFAULT_PROFILE);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [planPrefs, setPlanPrefs] = useState<PlanPrefs>({ planId: 'trial' });

  const documentsSpaceId = spaceIdByKind(spaces, 'documents');
  const homes = spaces.filter((s) => s.kind === 'home').length;
  const docs = useMemo(
    () => items.filter((i) => isDocumentItem(i, documentsSpaceId)).length,
    [items, documentsSpaceId]
  );

  // Reload on focus so changes made elsewhere show when navigating back.
  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadLocalProfile().then((p) => {
        if (!live) return;
        setProfile(p);
        setName(resolveSelfDisplayName(p.displayName, members) || p.displayName);
        setReady(true);
      });
      void loadPlanPrefs().then((prefs) => {
        if (live) setPlanPrefs(prefs);
      });
      return () => {
        live = false;
      };
    }, [members])
  );

  async function save() {
    if (saving || !ready) return;
    setSaving(true);
    try {
      const next = { ...profile, displayName: name };
      await saveLocalProfile(next);
      setProfile(next);
    } catch {
      showError('Couldn’t save your profile. Try again.');
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
          : `Trial · ${TRIAL_DAYS} days`
      : plan.name;

  return (
    <ModuleScreen
      title="Profile"
      subtitle="Your account"
      defaultOrigin="today"
      bottomExtra={DETAIL_DOCK_PAD}
      hero={
        <DetailHero
          eyebrow={letter ? `${letter} · You` : 'You'}
          accent={colors.ink}
          vividFallback="#3A342E"
          editableTitle
          titleValue={name}
          onTitleChange={setName}
          titleMaxLength={40}
          onTitleCommit={() => void save()}
          titlePlaceholder="Your name"
          compact
        >
          <Pressable
            onPress={() => router.push('/settings/plan' as Href)}
            style={[styles.billingRow, { backgroundColor: 'rgba(0,0,0,0.28)' }]}
            accessibilityRole="button"
            accessibilityLabel="Plan and billing"
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.billingTitle, { color: colors.ink }]}>
                Plan
              </Text>
              <Text style={[styles.billingSub, { color: colors.slate }]}>
                {planLabel}
              </Text>
            </View>
            <ChevronRight size={18} color={colors.ink} />
          </Pressable>
        </DetailHero>
      }
    >
      <StatStrip
        style={{ marginBottom: spacing.sm }}
        items={[
          { label: 'Homes', value: String(homes) },
          { label: 'Things', value: String(items.length) },
          { label: 'Docs', value: String(docs) },
        ]}
      />

      <ModuleSection label="Household" count={members.length} style={styles.section}>
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

      <ModuleSection label="Saavi" style={styles.section}>
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
          { backgroundColor: colors.surface },
        ]}
        accessibilityLabel="Plan and billing"
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.upgradeTitle, { color: colors.ink }]}>Plan & billing</Text>
          <Text variant="caption">
            {plan.id === 'trial'
              ? `Trial · manage subscription`
              : `${plan.name} · manage subscription`}
          </Text>
        </View>
        <ChevronRight size={16} color={colors.faint} />
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  billingRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  billingTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  billingSub: {
    fontFamily: fonts.sans,
    fontSize: 14,
    marginTop: 2,
  },
  section: {
    marginBottom: spacing.sm,
  },
  upgrade: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  upgradeTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    marginBottom: 2,
  },
});
