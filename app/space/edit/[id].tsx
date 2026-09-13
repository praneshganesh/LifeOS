import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailRemoveButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces, type SpaceKind } from '@/lib/SpacesContext';
import { useToast } from '@/lib/ToastContext';
import { type ThemeColors, fonts, radius, spacing } from '@/constants/theme';

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
  const router = useRouter();
  const {
    getSpace,
    updateSpace,
    removeSpace,
    roomsForSpace,
    addRoom,
    updateRoom,
    removeRoom,
  } = useSpaces();
  const { items: inventoryItems, updateItem } = useInventory();
  const { showToast, showError } = useToast();
  const space = id ? getSpace(id) : undefined;
  const spaceRooms = id ? roomsForSpace(id) : [];
  const accent = colors.forest;

  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [kind, setKind] = useState<SpaceKind>('home');
  const [icon, setIcon] = useState<Icon3DName>('house');
  const [newRoom, setNewRoom] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingRoomId, setEditingRoomId] = useState<string | null>(null);
  const [roomDraft, setRoomDraft] = useState('');

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
            <Text style={[styles.link, { color: accent }]}>Go back</Text>
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
      showToast('Space saved');
      router.back();
    } catch {
      showError('Couldn’t save the space — try again.');
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
              try {
                await removeSpace(target.id);
              } catch {
                showError('Couldn’t delete — try again.');
                return;
              }
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
    try {
      await addRoom({ spaceId: id, name: trimmed, icon: 'package' });
      setNewRoom('');
    } catch {
      showError('Couldn’t add the room — try again.');
    }
  }

  async function commitRoomRename(roomId: string, oldName: string) {
    const next = roomDraft.trim();
    setEditingRoomId(null);
    if (!next || next === oldName || !id) return;
    try {
      await updateRoom(roomId, { name: next });
      // Things reference rooms by name — carry them over to the new name.
      const affected = inventoryItems.filter(
        (i) => i.spaceId === id && i.room === oldName
      );
      for (const it of affected) {
        await updateItem(it.id, { room: next });
      }
      showToast('Room renamed');
    } catch {
      showError('Couldn’t rename the room — try again.');
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Edit space' }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_DOCK_PAD}>
        <DetailSection label="Name">
          <DetailField value={name} onChangeText={setName} />
        </DetailSection>

        <DetailSection label="Location or note">
          <DetailField value={meta} onChangeText={setMeta} />
        </DetailSection>

        <DetailSection label="Type">
          <DetailChipRow>
            {KINDS.map((k) => (
              <DetailChip
                key={k.id}
                label={k.label}
                selected={kind === k.id}
                onPress={() => {
                  setKind(k.id);
                  if (k.id !== 'home') setIcon(k.icon);
                }}
                accent={accent}
              />
            ))}
          </DetailChipRow>
        </DetailSection>

        {kind === 'home' ? (
          <DetailSection label="Icon">
            <View style={styles.iconRow}>
              {HOME_ICONS.map((ic) => (
                <Pressable
                  key={ic}
                  onPress={() => setIcon(ic)}
                  style={[
                    styles.iconPick,
                    {
                      backgroundColor: colors.surfaceSoft,
                      borderColor: icon === ic ? accent : 'transparent',
                    },
                  ]}
                >
                  <Icon3DBadge name={ic} size={44} />
                </Pressable>
              ))}
            </View>
          </DetailSection>
        ) : null}

        <DetailSection label="Rooms">
          {spaceRooms.map((room) => (
            <View
              key={room.id}
              style={[styles.roomRow, { borderBottomColor: colors.line }]}
            >
              {editingRoomId === room.id ? (
                <DetailField
                  value={roomDraft}
                  onChangeText={setRoomDraft}
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={() => void commitRoomRename(room.id, room.name)}
                  onBlur={() => void commitRoomRename(room.id, room.name)}
                  style={styles.roomEditInput}
                />
              ) : (
                <Pressable
                  onPress={() => {
                    setEditingRoomId(room.id);
                    setRoomDraft(room.name);
                  }}
                  style={{ flex: 1 }}
                  hitSlop={4}
                >
                  <Text style={[styles.roomName, { color: colors.ink }]}>{room.name}</Text>
                </Pressable>
              )}
              <Pressable
                onPress={() => {
                  Alert.alert('Remove room?', `Remove “${room.name}”?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Remove',
                      style: 'destructive',
                      onPress: () =>
                        void removeRoom(room.id).catch(() =>
                          showError('Couldn’t remove — try again.')
                        ),
                    },
                  ]);
                }}
                hitSlop={8}
              >
                <Text style={[styles.removeText, { color: colors.mute }]}>Remove</Text>
              </Pressable>
            </View>
          ))}
          <View style={styles.addRoomRow}>
            <DetailField
              value={newRoom}
              onChangeText={setNewRoom}
              placeholder="Add a room…"
              style={{ flex: 1 }}
              onSubmitEditing={() => void onAddRoom()}
            />
            <Pressable
              onPress={() => void onAddRoom()}
              disabled={!newRoom.trim()}
              style={[
                styles.addRoomBtn,
                { backgroundColor: accent },
                !newRoom.trim() && { opacity: 0.4 },
              ]}
            >
              <Text style={[styles.addRoomBtnText, { color: colors.forestOn }]}>Add</Text>
            </Pressable>
          </View>
        </DetailSection>

        <DetailPrimaryButton
          label={saving ? 'Saving…' : 'Save changes'}
          accent={accent}
          disabled={!name.trim() || saving}
          onPress={() => void save()}
        />

        <DetailRemoveButton onPress={confirmDelete} />
      </KeyboardFormScroll>
    </Screen>
  );
}

function makeStyles(_colors: ThemeColors) {
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
    },
    iconRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    iconPick: {
      padding: 6,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
    roomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      gap: spacing.sm,
    },
    roomName: {
      fontFamily: fonts.sans,
      fontSize: 16,
    },
    roomEditInput: {
      flex: 1,
      marginRight: spacing.sm,
      paddingVertical: 8,
    },
    removeText: {
      fontFamily: fonts.sansMedium,
      fontSize: 14,
    },
    addRoomRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: spacing.sm,
    },
    addRoomBtn: {
      borderRadius: radius.full,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    addRoomBtnText: {
      fontFamily: fonts.sansSemi,
      fontSize: 16,
    },
  });
}
