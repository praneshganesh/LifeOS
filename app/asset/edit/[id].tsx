import { useTheme } from '@/lib/ThemeContext';
import { useEffect, useMemo, useState } from 'react';
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
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { blurActiveElement } from '@/lib/a11y';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';

export default function EditAssetScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { getById, updateItem, removeItem } = useInventory();
  const { spaces, roomsForSpace } = useSpaces();
  const item = id ? getById(id) : undefined;

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [room, setRoom] = useState('');
  const [spaceId, setSpaceId] = useState('');
  const [category, setCategory] = useState('');
  const [serial, setSerial] = useState('');
  const [price, setPrice] = useState('');
  const [purchasedFrom, setPurchasedFrom] = useState('');
  const [warrantyExpiry, setWarrantyExpiry] = useState('');
  const [condition, setCondition] = useState('');
  const [insight, setInsight] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [expiryDate, setExpiryDate] = useState('');

  useEffect(() => {
    if (!item) return;
    setName(item.name);
    setBrand(item.brand);
    setRoom(item.room);
    setSpaceId(item.spaceId);
    setCategory(item.category);
    setSerial(item.serial);
    setPrice(item.price);
    setPurchasedFrom(item.purchasedFrom || '');
    setWarrantyExpiry(item.warrantyExpiry);
    setCondition(item.condition);
    setInsight(item.insight || '');
    setDocumentNumber(item.documentNumber || '');
    setFullName(item.fullName || '');
    setExpiryDate(item.expiryDate || '');
  }, [item]);

  const spaceRooms = useMemo(
    () => (spaceId ? roomsForSpace(spaceId) : []),
    [spaceId, roomsForSpace]
  );

  if (!item) {
    return (
      <Screen>
        <Stack.Screen options={{ title: 'Edit' }} />
        <View style={styles.missing}>
          <Text variant="body">Only captured items can be edited here.</Text>
          <Pressable onPress={() => router.back()} style={{ marginTop: spacing.md }}>
            <Text style={styles.link}>Go back</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  async function save() {
    if (!id) return;
    await updateItem(id, {
      name: name.trim() || item!.name,
      brand: brand.trim(),
      room: room.trim(),
      spaceId: spaceId || item!.spaceId,
      category: category.trim() || item!.category,
      serial: serial.trim(),
      price: price.trim(),
      purchasedFrom: purchasedFrom.trim() || undefined,
      warrantyExpiry: warrantyExpiry.trim(),
      warrantyActive: Boolean(warrantyExpiry.trim()),
      condition: condition.trim() || '—',
      insight: insight.trim() || undefined,
      documentNumber: documentNumber.trim() || undefined,
      fullName: fullName.trim() || undefined,
      expiryDate: expiryDate.trim() || undefined,
      timeline: [
        {
          date: new Date().toLocaleDateString('en-GB', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          }),
          event: 'Details updated',
        },
        ...item!.timeline,
      ],
    });
    Alert.alert('Saved', 'Changes stay on this device.');
    router.back();
  }

  function confirmDelete() {
    const target = item;
    if (!target) return;
    blurActiveElement();
    const run = async () => {
      await removeItem(target.id);
      router.replace('/(tabs)/spaces');
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (window.confirm(`Remove “${target.name}” from this device?`)) {
        void run();
      }
      return;
    }
    Alert.alert('Delete item?', `Remove “${target.name}” from this device?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void run();
        },
      },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Edit item' }} />
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
          <Field label="Name" value={name} onChangeText={setName} />
          <Field label="Brand" value={brand} onChangeText={setBrand} />
          <Field label="Category" value={category} onChangeText={setCategory} />

          <Text variant="caption" style={styles.fieldLabel}>
            Space
          </Text>
          <View style={styles.chipRow}>
            {spaces.map((s) => {
              const on = s.id === spaceId;
              return (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    setSpaceId(s.id);
                    const rooms = roomsForSpace(s.id);
                    if (rooms.length && !rooms.some((r) => r.name === room)) {
                      setRoom(rooms[0].name);
                    }
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.name}</Text>
                </Pressable>
              );
            })}
          </View>

          <Text variant="caption" style={styles.fieldLabel}>
            Room / location
          </Text>
          {spaceRooms.length ? (
            <View style={styles.chipRow}>
              {spaceRooms.map((r) => {
                const on = r.name === room;
                return (
                  <Pressable
                    key={r.id}
                    onPress={() => setRoom(r.name)}
                    style={[styles.chip, on && styles.chipOn]}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{r.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}
          <TextInput
            value={room}
            onChangeText={setRoom}
            placeholder="Or type a room…"
            placeholderTextColor={colors.faint}
            style={[styles.input, { marginBottom: spacing.md }]}
          />

          {item.isDocument ? (
            <>
              <Field label="Document number" value={documentNumber} onChangeText={setDocumentNumber} />
              <Field label="Full name" value={fullName} onChangeText={setFullName} />
              <Field
                label="Expiry"
                value={expiryDate}
                onChangeText={setExpiryDate}
                placeholder="YYYY-MM-DD"
              />
            </>
          ) : (
            <>
              <Field label="Serial" value={serial} onChangeText={setSerial} />
              <Field label="Price" value={price} onChangeText={setPrice} placeholder="AED 800" />
              <Field
                label="Bought from"
                value={purchasedFrom}
                onChangeText={setPurchasedFrom}
                placeholder="Amazon, Sharaf DG…"
              />
              <Field
                label="Warranty until"
                value={warrantyExpiry}
                onChangeText={setWarrantyExpiry}
              />
              <Field label="Condition" value={condition} onChangeText={setCondition} />
            </>
          )}
          <Field label="Notes" value={insight} onChangeText={setInsight} multiline />

          <Pressable
            onPress={save}
            style={({ pressed }) => [styles.save, pressed && { opacity: 0.9 }]}
          >
            <Text style={styles.saveText}>Save changes</Text>
          </Pressable>

          <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
            <Text style={styles.deleteText}>Delete item</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text variant="caption" style={styles.fieldLabel}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        style={[styles.input, multiline && styles.inputMulti]}
        multiline={multiline}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  missing: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  field: {
    marginBottom: spacing.md,
  },
  fieldLabel: {
    marginBottom: 6,
    color: colors.mute,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.ink,
  },
  inputMulti: {
    minHeight: 88,
    textAlignVertical: 'top',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
  },
  chip: {
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  save: {
    marginTop: spacing.lg,
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.coral,
  },
});
}
