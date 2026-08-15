import { useEffect, useState } from 'react';
import { StyleSheet, View, Pressable, TextInput } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { SwipeableThingRow } from '@/components/SwipeableThingRow';
import { useHousehold } from '@/lib/HouseholdContext';
import { useInventory } from '@/lib/InventoryContext';
import { useClasses } from '@/lib/ClassesContext';
import { remainingCount, usedCount } from '@/lib/classes';
import {
  labelForPermission,
  type HouseholdRole,
  type SharingPermission,
} from '@/lib/household';
import { confirmDelete } from '@/lib/confirmDelete';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import CreateScreen from './create';

const PERMS: SharingPermission[] = ['owner', 'editor', 'viewer'];
const ROLES: { id: HouseholdRole; label: string }[] = [
  { id: 'adult', label: 'Adult' },
  { id: 'child', label: 'Child' },
  { id: 'pet', label: 'Pet' },
];

export default function FamilyMemberScreen() {
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const router = useRouter();
  const { getById, removeMember, updateMember } = useHousehold();
  const { items, removeItem } = useInventory();
  const { packs: classPacks } = useClasses();

  const memberEarly = id && id !== 'new' ? getById(id) : undefined;
  const [name, setName] = useState('');
  const [relation, setRelation] = useState('');
  const [role, setRole] = useState<HouseholdRole>('adult');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!memberEarly) return;
    setName(memberEarly.name);
    setRelation(memberEarly.relation || '');
    setRole(memberEarly.role === 'parent' ? 'adult' : memberEarly.role);
    setNotes(memberEarly.medicalNotes || '');
  }, [
    memberEarly?.id,
    memberEarly?.name,
    memberEarly?.relation,
    memberEarly?.role,
    memberEarly?.medicalNotes,
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
  const theirClasses = classPacks.filter(
    (p) =>
      p.personId === id ||
      (member && p.assignedTo?.toLowerCase() === member.name.toLowerCase())
  );

  async function onDeleteThing(assetId: string, thingName: string) {
    const ok = await confirmDelete(thingName);
    if (!ok) return;
    await removeItem(assetId);
  }

  async function onRemoveMember() {
    if (!member) return;
    const ok = await confirmDelete(member.name);
    if (!ok) return;
    await removeMember(member.id);
    if (router.canGoBack()) router.back();
    else router.replace('/family' as Href);
  }

  async function onSaveProfile() {
    if (!member || !name.trim() || saving) return;
    setSaving(true);
    try {
      await updateMember(member.id, {
        name: name.trim(),
        relation: relation.trim(),
        role,
        medicalNotes: notes.trim() || undefined,
      });
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
        <View style={styles.avatar}>
          <Text style={styles.letter}>{member.avatarLetter}</Text>
        </View>
        <Text
          variant="caption"
          style={{ marginTop: spacing.sm, textTransform: 'capitalize' }}
        >
          {member.role} · {labelForPermission(member.permission)}
        </Text>
      </View>

      <Text variant="label" style={styles.label}>
        Profile
      </Text>
      <Text style={styles.fieldLabel}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        style={styles.input}
        placeholderTextColor={colors.faint}
      />
      <Text style={styles.fieldLabel}>Relation</Text>
      <TextInput
        value={relation}
        onChangeText={setRelation}
        placeholder="e.g. Partner"
        placeholderTextColor={colors.faint}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Type</Text>
      <View style={styles.permRow}>
        {ROLES.map((r) => {
          const on = role === r.id;
          return (
            <Pressable
              key={r.id}
              onPress={() => setRole(r.id)}
              style={[styles.permChip, on && styles.permChipOn]}
            >
              <Text style={[styles.permLabel, on && styles.permLabelOn]}>
                {r.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.fieldLabel}>Notes</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Optional"
        placeholderTextColor={colors.faint}
        style={[styles.input, { minHeight: 72 }]}
        multiline
      />
      <Pressable
        onPress={() => void onSaveProfile()}
        disabled={!name.trim() || saving}
        style={[styles.saveBtn, (!name.trim() || saving) && { opacity: 0.45 }]}
      >
        <Text style={styles.saveBtnText}>
          {saving ? 'Saving…' : 'Save profile'}
        </Text>
      </Pressable>

      <ListCard style={{ marginTop: spacing.lg }}>
        <ListRow title="Documents" meta={String(docs.length)} />
        <ListRow title="Things" meta={String(devices.length - docs.length)} last />
      </ListCard>

      <Text variant="label" style={styles.label}>
        Sharing role
      </Text>
      <Text variant="caption" style={{ marginBottom: spacing.sm, color: colors.mute }}>
        Local stub until sync — not enforced yet.
      </Text>
      <View style={styles.permRow}>
        {PERMS.map((p) => {
          const on = member.permission === p;
          return (
            <Pressable
              key={p}
              onPress={() => void updateMember(member.id, { permission: p })}
              style={[styles.permChip, on && styles.permChipOn]}
            >
              <Text style={[styles.permLabel, on && styles.permLabelOn]}>
                {labelForPermission(p)}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
        <Text variant="body" style={styles.empty}>
          Nothing tagged to {member.name} yet. Try Talk: “I got a laptop for {member.name}.”
        </Text>
      )}

      <Pressable onPress={() => void onRemoveMember()} style={styles.remove}>
        <Text style={styles.removeText}>Remove from household</Text>
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
    backgroundColor: colors.forestSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  letter: {
    fontFamily: fonts.sansSemi,
    fontSize: 28,
    color: colors.forest,
  },
  label: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    color: colors.mute,
  },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    color: colors.mute,
    marginBottom: 6,
    marginTop: spacing.sm,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  saveBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.forest,
    borderRadius: radius.md,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.pure,
  },
  permRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  permChipOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  permLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
    color: colors.slate,
  },
  permLabelOn: { color: colors.forestOn },
  empty: { color: colors.mute, marginTop: spacing.md },
  remove: { marginTop: spacing.xxl, alignItems: 'center', padding: spacing.md },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
    color: colors.coral,
  },
});
