import { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, TextInput } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
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
import { fonts, radius, spacing } from '@/constants/theme';
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
      <ModuleScreen title="Not found">
        <Text variant="body">Member not found.</Text>
      </ModuleScreen>
    );
  }

  return (
    <ModuleScreen title={member.name} subtitle={member.relation}>
      <Stack.Screen options={{ title: '' }} />
      <View style={styles.hero}>
        <View style={[styles.avatar, { backgroundColor: colors.surfaceSoft }]}>
          <Text style={[styles.letter, { color: colors.ink }]}>{member.avatarLetter}</Text>
        </View>
        <Text
          variant="caption"
          style={{ marginTop: spacing.sm, textTransform: 'capitalize' }}
        >
          {member.role} · {labelForPermission(member.permission)}
        </Text>
      </View>

      <Text variant="label" style={[styles.label, { color: colors.mute }]}>
        Profile
      </Text>
      <Text style={[styles.fieldLabel, { color: colors.mute }]}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={[
          styles.input,
          noFocusRing,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            color: colors.ink,
          },
        ]}
        placeholderTextColor={colors.faint}
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        autoCapitalize="words"
      />
      <Text style={[styles.fieldLabel, { color: colors.mute }]}>Relation</Text>
      <TextInput
        value={relation}
        onChangeText={setRelation}
        placeholder="e.g. Partner"
        placeholderTextColor={colors.faint}
        style={[
          styles.input,
          noFocusRing,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            color: colors.ink,
          },
        ]}
        autoCorrect={false}
        spellCheck={false}
        autoComplete="off"
        textContentType="none"
        autoCapitalize="words"
      />
      <Text style={[styles.fieldLabel, { color: colors.mute }]}>Type</Text>
      <View style={styles.permRow}>
        {ROLES.map((r) => {
          const on = role === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => setRole(r.id)}
              style={[
                styles.permChip,
                {
                  backgroundColor: on ? colors.ink : colors.surface,
                  borderColor: on ? colors.ink : colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.permLabel,
                  { color: on ? colors.onInk : colors.slate },
                ]}
              >
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Pressable
        onPress={() => void onSaveProfile()}
        disabled={!name.trim() || saving}
        style={[
          styles.saveBtn,
          { backgroundColor: colors.ink },
          (!name.trim() || saving) && { opacity: 0.45 },
        ]}
      >
        <Text style={[styles.saveBtnText, { color: colors.onInk }]}>
          {saving ? 'Saving…' : 'Save profile'}
        </Text>
      </Pressable>

      <ListCard style={{ marginTop: spacing.lg }}>
        <ListRow title="Documents" meta={String(docs.length)} />
        <ListRow title="Things" meta={String(devices.length - docs.length)} last />
      </ListCard>

      <Text variant="label" style={[styles.label, { color: colors.mute }]}>
        Sharing role
      </Text>
      <Text variant="caption" style={{ marginBottom: spacing.sm, color: colors.mute }}>
        Roles aren’t enforced yet — enforcement comes with live sharing.
      </Text>
      <View style={styles.permRow}>
        {PERMS.map((p) => {
          const on = member.permission === p;
          return (
            <Pressable
              key={p}
              onPress={() =>
                void updateMember(member.id, { permission: p }).catch(() =>
                  showError('Couldn’t save — try again.')
                )
              }
              style={[
                styles.permChip,
                {
                  backgroundColor: on ? colors.ink : colors.surface,
                  borderColor: on ? colors.ink : colors.line,
                },
              ]}
            >
              <Text
                style={[
                  styles.permLabel,
                  { color: on ? colors.onInk : colors.slate },
                ]}
              >
                {labelForPermission(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {theirHabits.length ? (
        <>
          <Text variant="label" style={styles.label}>
            Habits
          </Text>
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
        </>
      ) : null}

      {theirClasses.length ? (
        <>
          <Text variant="label" style={styles.label}>
            Classes
          </Text>
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
        </>
      ) : null}

      {devices.length ? (
        <>
          <Text variant="label" style={styles.label}>
            Their things
          </Text>
          {devices.map((d) => (
            <SwipeableThingRow
              key={d.id}
              name={d.name}
              icon={d.icon}
              subtitle={[d.brand, d.room].filter(Boolean).join(' · ')}
              onPress={() => router.push(`/asset/${d.id}` as Href)}
              onDelete={() => void onDeleteThing(d.id, d.name)}
            />
          ))}
        </>
      ) : (
        <Text variant="body" style={[styles.empty, { color: colors.mute }]}>
          Nothing tagged to {member.name} yet. Try Talk: “I got a laptop for {member.name}.”
        </Text>
      )}

      <Pressable onPress={() => void onRemoveMember()} style={styles.remove}>
        <Text style={[styles.removeText, { color: colors.coral }]}>Remove from household</Text>
      </Pressable>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', marginBottom: spacing.lg },
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
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    marginBottom: 6,
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
  saveBtn: {
    marginTop: spacing.md,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  permLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  empty: { marginTop: spacing.md },
  remove: { marginTop: spacing.xxl, alignItems: 'center', padding: spacing.md },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
});
