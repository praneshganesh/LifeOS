import { useState } from 'react';
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
import { Stack, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '@/components/ui/Screen';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { useSpaces, type SpaceKind } from '@/lib/SpacesContext';
import { messageForPlanLimit } from '@/lib/planLimits';
import { colors, fonts, radius, spacing } from '@/constants/theme';

const KINDS: { id: SpaceKind; label: string; icon: Icon3DName; hint: string }[] = [
  { id: 'home', label: 'Home', icon: 'house', hint: 'House or apartment' },
  { id: 'vehicle', label: 'Vehicles', icon: 'car', hint: 'Cars & bikes' },
  { id: 'documents', label: 'Documents', icon: 'folder', hint: 'IDs & legal' },
  { id: 'family', label: 'Family', icon: 'family', hint: 'People & pets' },
];

const HOME_ICONS: Icon3DName[] = ['house', 'holiday', 'building'];

export default function NewSpaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { addSpace } = useSpaces();
  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [kind, setKind] = useState<SpaceKind>('home');
  const [icon, setIcon] = useState<Icon3DName>('house');
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    try {
      const space = await addSpace({
        name: trimmed,
        meta: meta.trim() || undefined,
        kind,
        icon: kind === 'home' ? icon : undefined,
        withDefaultRooms: kind === 'home',
      });
      router.replace(`/space/${space.id}`);
    } catch (err) {
      Alert.alert('Couldn’t add space', messageForPlanLimit(err) || 'Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'New space' }} />
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
            placeholder="e.g. Downtown apartment"
            placeholderTextColor={colors.faint}
            style={styles.input}
            autoFocus
          />

          <Text style={styles.label}>Location or note</Text>
          <TextInput
            value={meta}
            onChangeText={setMeta}
            placeholder="e.g. Marina · Floor 12"
            placeholderTextColor={colors.faint}
            style={styles.input}
          />

          <Text style={styles.label}>Type</Text>
          <View style={styles.kindGrid}>
            {KINDS.map((k) => {
              const selected = kind === k.id;
              return (
                <Pressable
                  key={k.id}
                  onPress={() => {
                    setKind(k.id);
                    setIcon(k.icon);
                  }}
                  style={[styles.kindCard, selected && styles.kindCardOn]}
                >
                  <Icon3DBadge name={k.icon} size={40} />
                  <Text style={styles.kindTitle}>{k.label}</Text>
                  <Text style={styles.kindHint}>{k.hint}</Text>
                </Pressable>
              );
            })}
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
              <Text style={styles.hint}>
                Homes get Living Room, Kitchen, and Bedroom to start — you can add more later.
              </Text>
            </>
          ) : null}

          <Pressable
            onPress={() => void save()}
            disabled={!name.trim() || saving}
            style={({ pressed }) => [
              styles.save,
              (!name.trim() || saving) && { opacity: 0.45 },
              pressed && { opacity: 0.9 },
            ]}
          >
            <Text style={styles.saveText}>{saving ? 'Creating…' : 'Create space'}</Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 13,
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
  },
  kindGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  kindCard: {
    width: '48%',
    backgroundColor: colors.white,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    padding: spacing.md,
  },
  kindCardOn: {
    borderColor: colors.forest,
    backgroundColor: colors.surfaceSoft,
  },
  kindTitle: {
    marginTop: 8,
    fontFamily: fonts.sansSemi,
    fontSize: 15,
    color: colors.ink,
  },
  kindHint: {
    marginTop: 2,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: colors.mute,
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
  hint: {
    marginTop: spacing.md,
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mute,
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
});
