import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DETAIL_DOCK_PAD,
} from '@/components/ui/DetailKit';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { useSpaces, type SpaceKind } from '@/lib/SpacesContext';
import { messageForPlanLimit } from '@/lib/planLimits';
import { useToast } from '@/lib/ToastContext';
import { type ThemeColors, radius, spacing } from '@/constants/theme';

const KINDS: { id: SpaceKind; label: string; icon: Icon3DName }[] = [
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'vehicle', label: 'Vehicles', icon: 'car' },
  { id: 'documents', label: 'Documents', icon: 'folder' },
  { id: 'family', label: 'Family', icon: 'family' },
];

const HOME_ICONS: Icon3DName[] = ['house', 'holiday', 'building'];

export default function NewSpaceScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { addSpace } = useSpaces();
  const { showToast } = useToast();
  const [name, setName] = useState('');
  const [meta, setMeta] = useState('');
  const [kind, setKind] = useState<SpaceKind>('home');
  const [icon, setIcon] = useState<Icon3DName>('house');
  const [saving, setSaving] = useState(false);
  const accent = colors.forest;

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
      showToast('Space added');
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
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_DOCK_PAD}>
        <DetailSection label="Name">
          <DetailField
            value={name}
            onChangeText={setName}
            placeholder="e.g. Downtown apartment"
            autoFocus
          />
        </DetailSection>

        <DetailSection label="Location or note">
          <DetailField
            value={meta}
            onChangeText={setMeta}
            placeholder="e.g. Marina · Floor 12"
          />
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
                  setIcon(k.icon);
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

        <DetailPrimaryButton
          label={saving ? 'Creating…' : 'Create space'}
          accent={accent}
          disabled={!name.trim() || saving}
          onPress={() => void save()}
        />
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
    iconRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    iconPick: {
      padding: 6,
      borderRadius: radius.md,
      borderWidth: 1.5,
    },
  });
}
