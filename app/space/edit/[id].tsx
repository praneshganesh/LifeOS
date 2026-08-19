import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { useSpaces, type SpaceKind } from '@/lib/SpacesContext';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

const KINDS: { id: SpaceKind; label: string; icon: Icon3DName }[] = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'vehicle', label: 'Vehicles', icon: 'car' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'family', label: 'Family', icon: 'family' },
];

const HOME_ICONS: Icon3DName[] = ['house', 'holiday', 'building'];

export default function EditSpaceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getSpace, updateSpace, removeSpace, roomsForSpace, addRoom, removeRoom } =
    useSpaces();
  const space = id ? getSpace(id) : undefined;
  const spaceRooms = id ? roomsForSpace(id) : [];

  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [kind, setKind] = useState<SpaceKind>('home');
  const [icon, setIcon] = useState<Icon3DName>('house');
  const [newRoom, setNewRoom] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!space) return;
    setName(space.name);
    setMeta(space.meta);
    setKind(space.kind);
    setIcon(space.icon);
  }, [space]);

  if (!space) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit space' }} />
        <View style={styles.missing}>
          <Text variant="body">Space not found.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  async function save() {
    if (!id || !space || !name.trim() || saving) return;
    setSaving(true);
    try {
      await updateSpace(id, {
        name: name.trim(),
        meta: meta.trim() || space.meta,
        kind,
        icon: kind === 'home' ? icon : KINDS.find((k) => k.id === kind)?.icon || icon,
      });
      router.back();
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!space) return;
    const target = space;
    Alert.alert(
      'Delete space?',
      `“${target.name}” and its rooms will be removed from this device. Items stay in inventory.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              await removeSpace(target.id);
              router.replace('/(tabs)/spaces');
            })();
          },
        },
      ]
    );
  }

  async function onAddRoom() {
    const trimmed = newRoom.trim();
    if (!trimmed || !id) return;
    await addRoom({ spaceId: id, name: trimmed, icon: 'package' });
    setNewRoom('');
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Edit space' }} />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 40 },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.label}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            style={styles.input}
            placeholderTextColor={colors.faint}
          />

          <Text style={styles.label}>Location or note</Text>
          <TextInput
            value={meta}
            onChangeText={setMeta}
            style={styles.input}
            placeholderTextColor={colors.faint}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.kindRow}>
            {KINDS.map((k) => (
              <Pressable
                key={k.id}
                onPress={() => {
                  setKind(k.id);
                  if (k.id !== 'home') setIcon(k.icon);
                }}
                style={[styles.chip, kind === k.id && styles.chipOn]}
              >
                <Text style={[styles.chipText, kind === k.id && styles.chipTextOn]}>
                  {k.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {kind === 'home' ? (
            <>
              <Text style={styles.label}>Icon</Text>
              <View style={styles.iconRow}>
                {HOME_ICONS.map((ic) => (
                  <Pressable
                    key={ic}
                    onPress={() => setIcon(ic)}
                    style={[styles.iconPick, icon === ic && styles.iconPickOn]}
                  >
                    <Icon3DBadge name={ic} size={44} />
                  </Pressable>
                ))}
              </View>
            </>
          ) : null}

          <Text style={styles.label}>Rooms</Text>
          {spaceRooms.map((room) => (
            <View key={room.id} style={styles.roomRow}>
              <Text style={styles.roomName}>{room.name}</Text>
              <Pressable
                onPress={() => {
                  Alert.alert('Remove room?', `Remove “${room.name}”?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () => void removeRoom(room.id),
                    },
                  ]);
                }}
                hitSlop={8}
              >
                <Text style={styles.removeText}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.addRoomRow}>
            <TextInput
              value={newRoom}
              onChangeText={setNewRoom}
              placeholder="Add a room…"
              placeholderTextColor={colors.faint}
              style={[styles.input, { flex: 1, marginBottom: 0 }]}
              onSubmitEditing={() => void onAddRoom()}
            />
            <Pressable
              onPress={() => void onAddRoom()}
              disabled={!newRoom.trim()}
              style={[styles.addRoomBtn, !newRoom.trim() && { opacity: 0.4 }]}
            >
              <Text style={styles.addRoomBtnText}>Add</Text>
            </Pressable>
          </View>

          <Pressable
            onPress={() => void save()}
            disabled={!name.trim() || saving}
            style={({ pressed }) => [
              styles.save,
              (!name.trim() || saving) && { opacity: 0.45 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save changes'}</Text>
          </Pressable>

          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete space</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: {
    fontFamily: fonts.sansMedium,
    color: colors.forest,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    marginBottom: 8,
    marginTop: spacing.md,
  },
  input: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
    marginBottom: 0,
  },
  kindRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  chipText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.slate,
  },
  chipTextOn: {
    color: colors.forestOn,
  },
  iconRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconPick: {
    padding: 6,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    backgroundColor: colors.white,
  },
  iconPickOn: {
    borderColor: colors.forest,
    backgroundColor: colors.surfaceSoft,
  },
  roomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  roomName: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  removeText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.amber,
  },
  addRoomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: spacing.md,
  },
  addRoomBtn: {
    backgroundColor: colors.forest,
    borderRadius: radius.full,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  addRoomBtnText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forestOn,
  },
  save: {
    marginTop: spacing.xl,
    backgroundColor: colors.forest,
    borderRadius: radius.full,
    paddingVertical: 16,
    alignItems: 'center',
  },
  saveText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.forestOn,
  },
  deleteBtn: {
    marginTop: spacing.lg,
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  deleteText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.amber,
  },
});
}
