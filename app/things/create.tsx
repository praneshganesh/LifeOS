import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Camera } from 'lucide-react-native';
import { Screen } from '@/components/ui/Screen';
import { KeyboardFormScroll } from '@/components/ui/KeyboardFormScroll';
import {
  DetailChip,
  DetailChipRow,
  DetailField,
  DetailPrimaryButton,
  DetailSection,
  DetailStickyActions,
  DETAIL_STICKY_PAD,
} from '@/components/ui/DetailKit';
import { OptionalDateField } from '@/components/ui/DateField';
import { Text } from '@/components/ui/Text';
import { PersonChips } from '@/components/PersonChips';
import type { Icon3DName } from '@/components/ui/Icon3D';
import { useInventory } from '@/lib/InventoryContext';
import { useHousehold } from '@/lib/HouseholdContext';
import { useCurrency } from '@/lib/CurrencyContext';
import { useToast } from '@/lib/ToastContext';
import { sanitizeAmountInput } from '@/lib/currency';
import { inferMeta } from '@/lib/chat/applyActions';
import { captureHref, type CaptureContextKind } from '@/lib/captureContext';
import { messageForPlanLimit } from '@/lib/planLimits';
import { localDayKey } from '@/lib/dates';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';

const CATEGORIES = [
  'Electronics',
  'Appliances',
  'Furniture',
  'Kitchen',
  'Vehicle',
  'Home',
  'Other',
] as const;

type CreateKind = 'thing' | 'vehicle' | 'document' | 'insurance';

type KindCopy = {
  title: string;
  namePlaceholder: string;
  saveLabel: string;
  capture: CaptureContextKind;
  category?: string;
  icon?: Icon3DName;
};

const KIND_COPY: Record<CreateKind, KindCopy> = {
  thing: {
    title: 'New thing',
    namePlaceholder: 'e.g. Living room TV',
    saveLabel: 'Add to Things',
    capture: 'general',
  },
  vehicle: {
    title: 'New vehicle',
    namePlaceholder: 'e.g. Family car',
    saveLabel: 'Add vehicle',
    capture: 'vehicle',
    category: 'Vehicle',
    icon: 'car',
  },
  document: {
    title: 'New document',
    namePlaceholder: 'e.g. Passport',
    saveLabel: 'Add document',
    capture: 'documents',
    category: 'Documents',
    icon: 'document',
  },
  insurance: {
    title: 'New policy',
    namePlaceholder: 'e.g. Car insurance',
    saveLabel: 'Add policy',
    capture: 'insurance',
    category: 'Insurance',
    icon: 'shield',
  },
};

function parseKind(raw: unknown): CreateKind {
  return raw === 'vehicle' || raw === 'document' || raw === 'insurance' ? raw : 'thing';
}

export default function CreateThingScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const params = useLocalSearchParams<{ kind?: string; room?: string; spaceId?: string }>();
  const kind = parseKind(params.kind);
  const copy = KIND_COPY[kind];
  const isPaper = kind === 'document' || kind === 'insurance';
  const { addItem } = useInventory();
  const { members } = useHousehold();
  const { currency } = useCurrency();
  const { showToast, showError } = useToast();

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [number, setNumber] = useState('');
  const [category, setCategory] = useState<string | null>(copy.category ?? null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [price, setPrice] = useState('');
  const [purchasedFrom, setPurchasedFrom] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);

  const guessed = useMemo(
    () => inferMeta(`${name} ${brand}`),
    [name, brand]
  );
  const shownCategory = category ?? (name.trim() ? guessed.category : null);

  async function save() {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    const meta = inferMeta(`${trimmed} ${brand} ${category ?? ''}`);
    const person = personId ? members.find((m) => m.id === personId) : undefined;
    const until = expiry.trim();
    const docNumber = number.trim();
    try {
      const item = await addItem({
        name: trimmed,
        brand: brand.trim() || (isPaper ? 'Document' : 'Unknown'),
        category: (isPaper ? copy.category : shownCategory) || meta.category,
        room: params.room?.trim() || '—',
        spaceId: params.spaceId || meta.spaceId,
        icon: copy.icon ?? meta.icon,
        purchaseDate: purchaseDate.trim() || localDayKey(),
        price: price.trim() || '—',
        purchasedFrom: purchasedFrom.trim() || undefined,
        personId: person?.id,
        assignedTo: person?.name,
        warrantyExpiry: until || '—',
        warrantyActive: Boolean(until),
        expiryDate: isPaper ? until || undefined : undefined,
        documentNumber: isPaper ? docNumber || undefined : undefined,
        condition: '—',
        serial: docNumber || '—',
        estimatedValue: price.trim() || '—',
        isDocument: kind === 'document' || (kind === 'thing' && meta.isDocument),
        source: 'manual',
        timeline: [
          {
            date: new Date().toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            }),
            event: 'Added by hand',
          },
        ],
      });
      showToast(kind === 'thing' ? 'Added to Things' : 'Added');
      router.replace(`/asset/${item.id}` as Href);
    } catch (err) {
      showError(messageForPlanLimit(err) || 'Couldn’t save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: copy.title }} />
      <KeyboardFormScroll contentContainerStyle={styles.content} bottomExtra={DETAIL_STICKY_PAD}>
        <DetailSection label="What is it?">
          <DetailField
            value={name}
            onChangeText={setName}
            placeholder={copy.namePlaceholder}
            autoFocus
            returnKeyType="next"
          />
        </DetailSection>

        {kind === 'document' ? null : (
          <DetailSection label={kind === 'insurance' ? 'Provider' : 'Brand'}>
            <DetailField
              value={brand}
              onChangeText={setBrand}
              placeholder={kind === 'insurance' ? 'e.g. AXA' : 'e.g. Samsung'}
            />
          </DetailSection>
        )}

        {isPaper ? (
          <DetailSection label={kind === 'insurance' ? 'Policy number' : 'Number'}>
            <DetailField
              value={number}
              onChangeText={setNumber}
              placeholder="Optional"
              autoCapitalize="characters"
            />
          </DetailSection>
        ) : (
          <DetailSection label="Kind">
            <DetailChipRow>
              {CATEGORIES.map((c) => (
                <DetailChip
                  key={c}
                  label={c}
                  accent={colors.accent}
                  selected={shownCategory === c}
                  onPress={() => setCategory(category === c ? null : c)}
                />
              ))}
            </DetailChipRow>
          </DetailSection>
        )}

        {members.length > 0 ? (
          <View style={styles.block}>
            <PersonChips
              members={members}
              personId={personId}
              onChange={setPersonId}
              label="Belongs to"
              noneLabel="Household"
            />
          </View>
        ) : null}

        {kind === 'document' ? null : (
          <DetailSection label={kind === 'insurance' ? 'Premium' : 'Price'}>
            <DetailField
              value={price}
              onChangeText={(t) => setPrice(sanitizeAmountInput(t))}
              placeholder={`${currency} 0`}
              keyboardType="decimal-pad"
            />
          </DetailSection>
        )}

        {isPaper ? null : (
          <>
            <DetailSection label="Bought from">
              <DetailField
                value={purchasedFrom}
                onChangeText={setPurchasedFrom}
                placeholder="Amazon, Sharaf DG…"
              />
            </DetailSection>

            <DetailSection label="Bought on">
              <OptionalDateField
                value={purchaseDate}
                onChange={setPurchaseDate}
                maximumDate={new Date()}
              />
            </DetailSection>
          </>
        )}

        <DetailSection
          label={
            kind === 'document' ? 'Expires on' : kind === 'insurance' ? 'Renews on' : 'Warranty until'
          }
        >
          <OptionalDateField value={expiry} onChange={setExpiry} />
        </DetailSection>

        <Pressable
          onPress={() =>
            router.replace(
              captureHref({
                kind: params.room ? 'room' : copy.capture,
                spaceId: params.spaceId,
                room: params.room,
              })
            )
          }
          style={({ pressed }) => [styles.photoRow, pressed && { opacity: 0.7 }]}
          accessibilityRole="button"
        >
          <Camera size={18} color={colors.accent} strokeWidth={2} />
          <Text style={[styles.photoText, { color: colors.accent }]}>
            Use the camera instead
          </Text>
        </Pressable>
      </KeyboardFormScroll>
      <DetailStickyActions>
        <DetailPrimaryButton
          label={saving ? 'Saving…' : copy.saveLabel}
          disabled={!name.trim() || saving}
          onPress={() => void save()}
        />
      </DetailStickyActions>
    </Screen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
    content: {
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.xs,
    },
    block: {
      marginBottom: spacing.lg,
    },
    photoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: spacing.md,
      marginBottom: spacing.lg,
    },
    photoText: {
      fontFamily: fonts.sansMedium,
      fontSize: 16,
      color: colors.accent,
    },
  });
}
