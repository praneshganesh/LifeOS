import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import {
  DetailChip,
  DetailChipRow,
  DetailFact,
  DetailFacts,
  DetailField,
  DetailHero,
  DetailPrimaryButton,
  DetailRemoveButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useHousehold } from '@/lib/HouseholdContext';
import { useToast } from '@/lib/ToastContext';
import { useInventory } from '@/lib/InventoryContext';
import { useClasses } from '@/lib/ClassesContext';
import { useHabits } from '@/lib/HabitsContext';
import { remainingCount, usedCount } from '@/lib/classes';
import {
  labelForPermission,
  type HouseholdRole,
  type SharingPermission,
} from '@/lib/household';
import { confirmDelete } from '@/lib/confirmDelete';
import { spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { noFocusRing } from '@/lib/a11y';
import CreateScreen from './create';

const PERMS: SharingPermission[] = ['owner', 'editor', 'viewer'];
const ROLES: { id: HouseholdRole; label: string }[] = [
  { id: 'adult', label: 'Adult' },
  { id: 'child', label: 'Child' },
  { id: 'pet', label: 'Pet' },
];

export default function FamilyMemberScreen() {
  const { colors } = useTheme();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, removeMember, updateMember } = useHousehold();
  const { items, removeItem, updateItem } = useInventory();
  const { packs: classPacks, updatePack } = useClasses();
  const { habits, updateHabit } = useHabits();
  const { showToast, showError } = useToast();

  const memberEarly = id && id !== 'new' ? getById(id) : undefined;
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberEarly) return;
    setName(memberEarly.name);
    setRelation(memberEarly.relation || '');
    setRole(memberEarly.role === 'parent' ? 'adult' : memberEarly.role);
  }, [
    memberEarly?.id,
    memberEarly?.name,
    memberEarly?.relation,
    memberEarly?.role,
  ]);

  if (id === 'new') {
    return <CreateScreen />;
  }

  const member = memberEarly;

  const devices = items.filter(
    (i) =>
      i.personId === id ||
      (member && i.assignedTo?.toLowerCase() === member.name.toLowerCase())
  );
  const docs = devices.filter((i) => i.isDocument);
  const theirHabits = habits.filter(
    (h) =>
      h.personId === id ||
      (member && h.assignedTo?.toLowerCase() === member.name.toLowerCase())
  );
  const theirClasses = classPacks.filter(
    (p) =>
      p.personId === id ||
      (member && p.assignedTo?.toLowerCase() === member.name.toLowerCase())
  );

  async function onDeleteThing(assetId: string, thingName: string) {
    const ok = await confirmDelete(thingName);
    if (!ok) return;
    await removeItem(assetId).catch(() => showError('Couldn’t delete — try again.'));
  }

  async function onRemoveMember() {
    if (!member) return;
    const ok = await confirmDelete(member.name);
    if (!ok) return;
    try {
      await removeMember(member.id);
    } catch {
      showError('Couldn’t delete — try again.');
      return;
    }
    if (router.canGoBack()) router.back();
    else router.replace('/family' as Href);
  }

  async function onSaveProfile() {
    if (!member || !name.trim() || saving) return;
    setSaving(true);
    const newName = name.trim();
    const renamed = newName !== member.name;
    try {
      await updateMember(member.id, {
        name: newName,
        relation: relation.trim(),
        role,
      });
      if (renamed) {
        // assignedTo is denormalized onto their stuff — cascade the new name.
        for (const h of theirHabits) {
          await updateHabit(h.id, { assignedTo: newName, personId: member.id });
        }
        for (const p of theirClasses) {
          await updatePack(p.id, { assignedTo: newName, personId: member.id });
        }
        for (const d of devices) {
          await updateItem(d.id, { assignedTo: newName, personId: member.id });
        }
      }
      showToast('Profile saved');
      if (router.canGoBack()) router.back();
      else router.replace('/family' as Href);
    } catch {
      showError('Couldn’t save the profile — try again.');
    } finally {
      setSaving(false);
    }
  }

  if (!member) {
    return (
      <ModuleScreen
        title="Not found"
        backLabel="Household"
        backFallbackHref="/family"
      >
        <Text variant="body">Member not found.</Text>
      </ModuleScreen>
    );
  }

  const roleLabel = ROLES.find((r) => r.id === role)?.label ?? 'Adult';
  const accent = colors.amber;

  return (
    <ModuleScreen
      title={member.name}
      backLabel="Household"
      backFallbackHref="/family"
      bottomExtra={DETAIL_DOCK_PAD}
      hero={
        <DetailHero
          eyebrow={`${member.avatarLetter} · ${roleLabel}`}
          editableTitle
          titleValue={name}
          onTitleChange={setName}
          titlePlaceholder="Name"
          subtitle={
            relation.trim()
              ? `${relation.trim()} · ${labelForPermission(member.permission)}`
              : labelForPermission(member.permission)
          }
          accent={accent}
          vividFallback="#A8884A"
        />
      }
    >
      <Stack.Screen options={{ headerShown: false }} />

      <DetailSection label="Profile">
        <DetailField
          value={relation}
          onChangeText={setRelation}
          placeholder="Relation · e.g. Partner"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="off"
          textContentType="none"
          autoCapitalize="words"
          style={noFocusRing}
        />
        <DetailChipRow>
          {ROLES.map((r) => (
            <DetailChip
              key={r.id}
              label={r.label}
              selected={role === r.id}
              onPress={() => setRole(r.id)}
              accent={accent}
            />
          ))}
        </DetailChipRow>
      </DetailSection>

      <DetailPrimaryButton
        label={saving ? 'Saving…' : 'Save profile'}
        accent={accent}
        disabled={!name.trim() || saving}
        onPress={() => void onSaveProfile()}
      />

      <DetailFacts>
        <DetailFact label="Documents" value={String(docs.length)} />
        <DetailFact
          label="Things"
          value={String(devices.length - docs.length)}
          last
        />
      </DetailFacts>

      <DetailSection label="Sharing role">
        <Text variant="caption" style={{ color: colors.mute }}>
          Roles aren’t enforced yet — enforcement comes with live sharing.
        </Text>
        <DetailChipRow>
          {PERMS.map((p) => (
            <DetailChip
              key={p}
              label={labelForPermission(p)}
              selected={member.permission === p}
              accent={accent}
              onPress={() =>
                void updateMember(member.id, { permission: p }).catch(() =>
                  showError('Couldn’t save — try again.')
                )
              }
            />
          ))}
        </DetailChipRow>
      </DetailSection>

      {theirHabits.length ? (
        <DetailSection label="Habits">
          {theirHabits.map((h) => (
            <ListCard key={h.id} style={{ marginBottom: spacing.sm }}>
              <ListRow
                title={h.title}
                subtitle={h.why}
                meta="Open"
                onPress={() => router.push(`/habits/${h.id}` as Href)}
                last
              />
            </ListCard>
          ))}
        </DetailSection>
      ) : null}

      {theirClasses.length ? (
        <DetailSection label="Classes">
          {theirClasses.map((p) => (
            <ListCard key={p.id} style={{ marginBottom: spacing.sm }}>
              <ListRow
                icon="today"
                title={p.title}
                subtitle={
                  remainingCount(p) == null
                    ? `${usedCount(p)} logged`
                    : `${remainingCount(p)} of ${p.total} left`
                }
                meta="Open"
                onPress={() => router.push(`/classes/${p.id}` as Href)}
                last
              />
            </ListCard>
          ))}
        </DetailSection>
      ) : null}

      {devices.length ? (
        <DetailSection label="Their things">
          {devices.map((d) => (
            <SwipeableThingRow
              key={d.id}
              name={d.name}
              icon={d.icon}
              subtitle={[d.brand, d.room].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/asset/${d.id}` as Href)}
              onEdit={() => router.push(`/asset/edit/${d.id}` as Href)}
              onDelete={() => void onDeleteThing(d.id, d.name)}
            />
          ))}
        </DetailSection>
      ) : (
        <Text variant="body" style={[styles.empty, { color: colors.mute }]}>
          Nothing tagged to {member.name} yet.
        </Text>
      )}

      <DetailRemoveButton onPress={() => void onRemoveMember()} />
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  empty: { marginTop: spacing.md },
});
