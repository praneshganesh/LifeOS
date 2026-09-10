import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CameraView,
  useCameraPermissions,
  type CameraType,
} from 'expo-camera';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { FileText, Image as ImageIcon, RefreshCw, X } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { OptionalDateField } from '@/components/ui/DateField';
import { blurActiveElement } from '@/lib/a11y';
import { localDayKey } from '@/lib/dates';
import { parseDateInput } from '@/lib/lastDone';
import { recognizeImage } from '@/lib/ocr/recognize';
import {
  extractDocumentFieldHints,
  isIdentityDocumentKind,
  labelDocumentKind,
  type MrzDocumentKind,
} from '@/lib/ocr/mrz';
import {
  extractReceiptHints,
  extractReceiptRef,
  receiptTitleFromOcr,
  suggestReceiptDestination,
  type ReceiptSaveDestination,
} from '@/lib/ocr/receiptHints';
import { useInventory } from '@/lib/InventoryContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { defaultDocumentReminder } from '@/lib/documentReminders';
import { messageForPlanLimit } from '@/lib/planLimits';
import { persistLocalMediaUri } from '@/lib/mediaPersist';
import { pickFileWeb } from '@/lib/pickFileWeb';
import { guessExpenseCategory, parseAmount, findDuplicateExpense, formatAmount, type Expense, type NewExpenseInput } from '@/lib/expenses';
import { currencyFromSpokenText, sanitizeAmountInput } from '@/lib/currency';
import { useCurrency } from '@/lib/CurrencyContext';
import { resolveCapturePreset } from '@/lib/captureContext';
import {
  findTalkMatches,
  listIncompleteTalkStubs,
  mergeCaptureIntoStub,
  type TalkMatch,
} from '@/lib/matchTalkStubs';
import { type ThemeColors,  colors, fonts, radius, spacing  } from '@/constants/theme';
import type { Icon3DName } from '@/components/ui/Icon3D';

type Phase = 'camera' | 'reading' | 'review';

const SAVE_DESTINATIONS: {
  id: ReceiptSaveDestination;
  title: string;
  hint: string;
}[] = [
  { id: 'thing', title: 'Thing', hint: 'Add to inventory' },
  { id: 'expense', title: 'Expense', hint: 'Log spend only' },
  { id: 'both', title: 'Both', hint: 'Thing + expense' },
  { id: 'document', title: 'Document', hint: 'File in Documents' },
];

/**
 * Capture opens the camera immediately.
 * After OCR, incomplete Talk stubs can be linked on-device (no cloud AI).
 */
export default function CaptureModal() {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    context?: string;
    spaceId?: string;
    room?: string;
    linkItemId?: string;
    attach?: string;
  }>();
  const preset = resolveCapturePreset(params);
  const linkItemId = Array.isArray(params.linkItemId)
    ? params.linkItemId[0]
    : params.linkItemId;
  const attachKind =
    (Array.isArray(params.attach) ? params.attach[0] : params.attach) === 'receipt'
      ? 'receipt'
      : 'photo';
  const forcedLink = Boolean(linkItemId);
  const { addItem, updateItem, items, getById } = useInventory();
  const { addExpense, expenses } = useExpenses();
  const { setReminder } = useLastDone();
  const { currency: defaultCurrency } = useCurrency();
  const linkedItem = linkItemId ? getById(linkItemId) : undefined;
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>('back');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<Phase>('camera');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [status, setStatus] = useState('Reading text on your device…');

  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [serial, setSerial] = useState('');
  const [price, setPrice] = useState('');
  const [purchasedFrom, setPurchasedFrom] = useState('');
  const [purchaseDate, setPurchaseDate] = useState('');
  const [expiry, setExpiry] = useState('');
  const [docNumber, setDocNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [nationality, setNationality] = useState('');
  const [dob, setDob] = useState('');
  const [isDocument, setIsDocument] = useState(preset.preferDocument);
  const [docKind, setDocKind] = useState<MrzDocumentKind>('unknown');
  const [ocrNote, setOcrNote] = useState('');
  const [saveDestination, setSaveDestination] =
    useState<ReceiptSaveDestination>('thing');
  const [receiptLooksLike, setReceiptLooksLike] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [duplicateExpense, setDuplicateExpense] = useState<Expense | null>(null);
  const [matchCandidates, setMatchCandidates] = useState<TalkMatch[]>([]);
  const [linkedStubId, setLinkedStubId] = useState<string | null>(null);
  const [browseStubs, setBrowseStubs] = useState(false);

  useEffect(() => {
    blurActiveElement();
  }, []);

  // Opened from an item screen — lock attach target and prefill fields
  useEffect(() => {
    if (!linkItemId) return;
    const item = items.find((i) => i.id === linkItemId);
    if (!item) return;
    setLinkedStubId(item.id);
    setName(item.name);
    setBrand(item.brand === 'Unknown' ? '' : item.brand);
    setSerial(item.serial === '—' ? '' : item.serial);
    setPrice(item.price === '—' ? '' : item.price);
    setPurchasedFrom(item.purchasedFrom || '');
    setPurchaseDate(item.purchaseDate || '');
    if (item.warrantyExpiry && item.warrantyExpiry !== '—') {
      setExpiry(item.warrantyExpiry);
    }
  }, [linkItemId, items]);

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  function close() {
    blurActiveElement();
    if (router.canGoBack()) router.back();
  }

  function resetToCamera() {
    setPhase('camera');
    setPhotoUri(null);
    setBusy(false);
    setMatchCandidates([]);
    setLinkedStubId(linkItemId ?? null);
    setOcrText('');
    setPrice('');
    setPurchasedFrom('');
    setPurchaseDate('');
    setSaveDestination('thing');
    setReceiptLooksLike(false);
    setBrowseStubs(false);
    setSaveError('');
    setDuplicateExpense(null);
  }

  function expenseDraftFromForm(): Pick<
    NewExpenseInput,
    'title' | 'amount' | 'date' | 'currency' | 'merchant' | 'receiptRef'
  > | null {
    const amountNum = parseAmount(price);
    if (!Number.isFinite(amountNum) || amountNum <= 0) return null;
    const merchant = purchasedFrom.trim() || brand.trim();
    return {
      title: name.trim() || `${merchant || 'Expense'} purchase`,
      amount: amountNum,
      date: purchaseDate.trim() || localDayKey(),
      currency:
        currencyFromSpokenText(price) ||
        currencyFromSpokenText(ocrText) ||
        defaultCurrency,
      merchant,
      receiptRef: extractReceiptRef(ocrText),
    };
  }

  function refreshDuplicateCheck() {
    const draft = expenseDraftFromForm();
    if (!draft) {
      setDuplicateExpense(null);
      return;
    }
    setDuplicateExpense(findDuplicateExpense(expenses, draft) ?? null);
  }

  useEffect(() => {
    if (phase !== 'review') return;
    refreshDuplicateCheck();
  }, [
    phase,
    expenses,
    price,
    purchasedFrom,
    brand,
    name,
    purchaseDate,
    ocrText,
  ]);

  function applyReceiptFromOcr(
    text: string,
    hints: ReturnType<typeof extractReceiptHints>
  ) {
    const nextName = receiptTitleFromOcr(text, hints);
    setName(nextName);
    setIsDocument(false);
    setDocKind('unknown');
    if (hints.brand) setBrand(hints.brand);
    if (hints.serial) setSerial(hints.serial);
    if (hints.price) setPrice(hints.price);
    if (hints.purchaseDate) setPurchaseDate(hints.purchaseDate);
    if (hints.merchant) setPurchasedFrom(hints.merchant);
    setReceiptLooksLike(true);
    const dest =
      attachKind === 'receipt' && hints.price
        ? suggestReceiptDestination({ ...hints, looksLikeReceipt: true })
        : attachKind === 'receipt'
          ? 'both'
          : suggestReceiptDestination(hints);
    setSaveDestination(dest);
    if (dest === 'document') setIsDocument(true);
    setStatus('Receipt read on device — confirm amount and log as expense.');
    setOcrNote('On-device OCR. Pick Expense (or both) — then save.');
    proposeTalkLinks(nextName, hints.brand || '', text);
    return nextName;
  }

  function applyContextDefaults(asDocument: boolean) {
    setIsDocument(asDocument);
    if (!asDocument && !forcedLink && !receiptLooksLike) {
      setName(preset.defaultName);
      setBrand('');
    }
  }

  function proposeTalkLinks(nextName: string, nextBrand: string, text: string) {
    if (forcedLink && linkItemId) {
      setLinkedStubId(linkItemId);
      setMatchCandidates([]);
      return;
    }
    const matches = findTalkMatches(items, {
      name: nextName,
      brand: nextBrand,
      ocrText: text,
      category: preset.category,
    });
    setMatchCandidates(matches);
    // High confidence only — avoid wrong-merging mid-score stubs
    if (matches[0] && matches[0].score >= 0.82) {
      setLinkedStubId(matches[0].item.id);
    } else {
      setLinkedStubId(null);
    }
  }

  async function processUri(uri: string) {
    const durable = await persistLocalMediaUri(uri, 'photo');
    setPhotoUri(durable);
    setPhase('reading');
    setStatus('Reading text on your device…');
    setOcrNote('On-device text recognition — nothing is sent to AI or the cloud.');
    setMatchCandidates([]);
    setLinkedStubId(forcedLink && linkItemId ? linkItemId : null);

    // Prefer the durable copy — camera temp URIs can disappear mid-read on some devices.
    let result = await recognizeImage(durable);
    if (!result.text?.trim() && durable !== uri) {
      result = await recognizeImage(uri);
    }
    setOcrText(result.text || '');
    // Surface OCR failure — otherwise blank fields read as "found nothing"
    // when the engine never ran at all.
    if (result.engine === 'none') {
      setOcrNote(
        'Couldn’t read the photo automatically — fill in the details below and save.'
      );
    }
    const receiptHints = extractReceiptHints(result.text);
    // Policy schedules and IDs also contain "total/amount" + prices — don't
    // let those route to Expense just because they mention money.
    const looksLikeDocInstead =
      /\b(policy|premium|passport|emirates\s*id|identity\s*card|driving\s*licen[cs]e|certificate)\b/i.test(
        result.text
      ) || Boolean(extractDocumentFieldHints(result.text));
    const receiptFirst =
      receiptHints.looksLikeReceipt &&
      !looksLikeDocInstead &&
      (receiptHints.price ||
        receiptHints.merchant ||
        /\b(invoice|receipt|tax\s*invoice)\b/i.test(result.text));

    if (forcedLink && linkedItem) {
      // Attach to existing item — keep identity, enrich from OCR when useful
      setIsDocument(Boolean(linkedItem.isDocument));
      setName(linkedItem.name);
      setBrand(linkedItem.brand === 'Unknown' ? '' : linkedItem.brand);
      setSerial(linkedItem.serial === '—' ? '' : linkedItem.serial);
      setPrice(linkedItem.price === '—' ? '' : linkedItem.price);
      setPurchasedFrom(linkedItem.purchasedFrom || '');
      if (result.text?.trim()) {
        const hints = extractReceiptHints(result.text);
        if (hints.price && (!linkedItem.price || linkedItem.price === '—')) {
          setPrice(hints.price);
        }
        if (hints.serial && (!linkedItem.serial || linkedItem.serial === '—')) {
          setSerial(hints.serial);
        }
        if (hints.purchaseDate) setPurchaseDate(hints.purchaseDate);
        if (hints.brand && (!linkedItem.brand || linkedItem.brand === 'Unknown')) {
          setBrand(hints.brand);
        }
      }
      setOcrNote(
        `Attaching ${attachKind === 'receipt' ? 'receipt' : 'photo'} to ${linkedItem.name}.`
      );
      setStatus(`Ready to attach to ${linkedItem.name}`);
      setPhase('review');
      return;
    }

    if (receiptFirst) {
      applyReceiptFromOcr(result.text, receiptHints);
      setPhase('review');
      return;
    }

    if (result.identity) {
      setIsDocument(true);
      setDocKind(result.identity.kind);
      setFullName(result.identity.fullName);
      setDocNumber(result.identity.documentNumber);
      setNationality(result.identity.nationality);
      setDob(result.identity.dateOfBirth);
      setExpiry(result.identity.expiryDate);
      setSerial(result.identity.documentNumber);
      setBrand(result.identity.issuingCountry || '');
      const kindLabel = labelDocumentKind(result.identity.kind);
      const nextName = result.identity.fullName
        ? `${result.identity.fullName} · ${kindLabel}`
        : kindLabel;
      setName(nextName);
      setStatus('Document fields filled from the MRZ on your device.');
      setOcrNote('Read on your device — nothing sent to AI or the cloud.');
      proposeTalkLinks(nextName, result.identity.issuingCountry || '', result.text);
    } else {
      const fieldHints = extractDocumentFieldHints(result.text);
      const kind =
        result.kind !== 'unknown'
          ? result.kind
          : fieldHints?.kind ?? 'unknown';

      if (isIdentityDocumentKind(kind)) {
        setIsDocument(true);
        setDocKind(kind);
        const kindLabel = labelDocumentKind(kind);
        if (fieldHints?.documentNumber) {
          setDocNumber(fieldHints.documentNumber);
          setSerial(fieldHints.documentNumber);
        }
        if (fieldHints?.fullName) setFullName(fieldHints.fullName);
        if (fieldHints?.expiryDate) setExpiry(fieldHints.expiryDate);
        if (fieldHints?.dateOfBirth) setDob(fieldHints.dateOfBirth);
        if (fieldHints?.nationality) setNationality(fieldHints.nationality);
        const nextName = fieldHints?.fullName
          ? `${fieldHints.fullName} · ${kindLabel}`
          : kindLabel;
        setName(nextName);
        setBrand(kind === 'emirates_id' || kind === 'driving_licence' ? 'UAE' : '');
        setStatus(
          fieldHints?.documentNumber
            ? `${kindLabel} detected — check the fields and save.`
            : `${kindLabel} detected. Tip: scan the back (MRZ) for auto-fill, or enter details below.`
        );
        setOcrNote(
          kind === 'emirates_id' && !fieldHints?.documentNumber
            ? 'Front of Emirates ID often needs the ID number typed in — or retake the back for MRZ.'
            : 'Read on your device — nothing sent to AI or the cloud.'
        );
        proposeTalkLinks(nextName, '', result.text);
      } else if (preset.preferDocument) {
        applyContextDefaults(true);
        setDocKind('unknown');
        setName(preset.defaultName);
        setStatus(`No MRZ found — save as a ${preset.label.toLowerCase()} document.`);
        proposeTalkLinks(preset.defaultName, '', result.text);
      } else {
        applyContextDefaults(false);
        setDocKind('unknown');
        // attachKind === 'receipt' is explicit user intent and overrides the
        // policy/ID keyword guard; bare hints do not.
        if ((receiptHints.looksLikeReceipt && !looksLikeDocInstead) || attachKind === 'receipt') {
          applyReceiptFromOcr(result.text, receiptHints);
        } else {
          setName(preset.defaultName);
          setReceiptLooksLike(false);
          setSaveDestination('thing');
          setStatus(
            result.text?.trim()
              ? `Couldn’t classify this photo — saving to ${preset.label}. Rename if it’s an ID or licence.`
              : `No text found — try better light, or the back of an ID. Saving to ${preset.label}.`
          );
          if (result.engine !== 'none' && !result.text?.trim()) {
            setOcrNote(
              'No readable text in this photo. For Emirates ID, use the back (MRZ strip). For licences, fill in the name and number below.'
            );
          }
          proposeTalkLinks(preset.defaultName, '', result.text);
        }
      }
    }

    setPhase('review');
  }

  async function snap() {
    if (!cameraRef.current || busy || !ready) return;
    setBusy(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        skipProcessing: Platform.OS === 'android',
      });
      if (photo?.uri) await processUri(photo.uri);
      else Alert.alert('Capture failed', 'No photo was returned. Try again.');
    } catch (err) {
      console.error('Capture failed', err);
      Alert.alert('Capture failed', 'Couldn’t take a photo. Try again or pick from library.');
    } finally {
      setBusy(false);
    }
  }

  async function pickImage() {
    try {
      if (Platform.OS === 'web') {
        // Own input with a no-HEIC accept list — iOS then converts library
        // photos to JPEG on pick. expo-image-picker's image/* hands us raw
        // HEIC that neither the browser nor Tesseract can decode.
        const picked = await pickFileWeb();
        if (picked?.uri) await processUri(picked.uri);
        return;
      }
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          'Photos access needed',
          'Allow photo library access in Settings to attach images.'
        );
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (!res.canceled && res.assets[0]?.uri) {
        await processUri(res.assets[0].uri);
      }
    } catch (err) {
      console.error('Library pick failed', err);
      Alert.alert('Couldn’t open library', 'Try again in a moment.');
    }
  }

  async function pickDocument() {
    try {
      if (Platform.OS === 'web') {
        // Same no-HEIC accept list as pickImage, plus PDFs.
        const picked = await pickFileWeb({ acceptPdf: true });
        if (!picked?.uri) return;
        if (picked.mimeType.includes('pdf')) {
          setPhotoUri(picked.uri);
          setIsDocument(true);
          setDocKind('unknown');
          setName(
            picked.fileName?.replace(/\.pdf$/i, '') || preset.defaultName
          );
          setOcrNote('PDF stored. Open a photo of the ID page for MRZ reading.');
          setPhase('review');
          return;
        }
        await processUri(picked.uri);
        return;
      }
      const res = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];
      if (asset.mimeType?.includes('pdf')) {
        const durable = await persistLocalMediaUri(asset.uri, 'doc');
        setPhotoUri(durable);
        setIsDocument(true);
        setDocKind('unknown');
        setName(asset.name?.replace(/\.pdf$/i, '') || preset.defaultName);
        setOcrNote('PDF stored on device. Open a photo of the ID page for MRZ reading.');
        setPhase('review');
        return;
      }
      await processUri(asset.uri);
    } catch (err) {
      console.error('Document pick failed', err);
      Alert.alert('Couldn’t open file', 'Try another file or take a photo.');
    }
  }

  function dismissCaptureAfterSave() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)' as Href);
  }

  async function save(opts?: { scanAnother?: boolean }) {
    if (saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const asDocument =
        isDocument || (!forcedLink && saveDestination === 'document');
      const expenseOnly =
        !forcedLink && !asDocument && saveDestination === 'expense';
      const wantsExpense =
        !asDocument &&
        (saveDestination === 'expense' || saveDestination === 'both');

      // Forced attach always updates the linked Thing; destination only controls expense.
      const saveThing = forcedLink || !expenseOnly;

      const identityDoc = asDocument && isIdentityDocumentKind(docKind);
      const icon: Icon3DName = identityDoc
        ? docKind === 'passport'
          ? 'passport'
          : 'id'
        : asDocument
          ? preset.preferDocument
            ? preset.icon
            : 'document'
          : preset.icon;

      const spaceId = identityDoc || asDocument ? 's5' : preset.spaceId;
      const room =
        identityDoc || asDocument ? 'Personal Documents' : preset.room;
      const category = identityDoc
        ? 'Documents'
        : asDocument && preset.preferDocument
          ? preset.category
          : asDocument
            ? 'Documents'
            : preset.category;

      const fields = {
        name:
          name.trim() ||
          (receiptLooksLike
            ? receiptTitleFromOcr(ocrText, extractReceiptHints(ocrText))
            : preset.defaultName),
        brand: brand.trim() || (asDocument ? 'Document' : 'Unknown'),
        serial: serial.trim() || docNumber.trim() || '—',
        price: price.trim() || '—',
        purchasedFrom: purchasedFrom.trim() || undefined,
        purchaseDate: purchaseDate.trim() || localDayKey(),
        warrantyExpiry: expiry || '—',
        imageUri: photoUri ?? undefined,
        ocrText: ocrText || undefined,
        category,
        room,
        spaceId,
      };

      let savedId: string | null = null;
      let expenseId: string | null = null;

      if (saveThing) {
        if (linkedStubId) {
          const stub = items.find((i) => i.id === linkedStubId);
          if (stub) {
            await updateItem(stub.id, mergeCaptureIntoStub(stub, fields));
            savedId = stub.id;
          } else {
            throw new Error('Linked item missing');
          }
        } else {
          const item = await addItem({
            ...fields,
            icon,
            warrantyActive: Boolean(expiry),
            condition: '—',
            estimatedValue: '—',
            timeline: [
              {
                date: new Date().toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                }),
                event: asDocument
                  ? preset.preferDocument
                    ? preset.saveEvent
                    : 'Document captured · text read on device'
                  : preset.saveEvent,
              },
            ],
            isDocument: asDocument,
            documentKind: asDocument ? docKind : undefined,
            documentNumber: docNumber || undefined,
            fullName: fullName || undefined,
            nationality: nationality || undefined,
            dateOfBirth: dob || undefined,
            expiryDate: expiry || undefined,
            ocrOnDevice: true,
            source: 'capture',
            insight: asDocument
              ? 'Text was read on your device. Nothing was sent to AI.'
              : `Captured for ${preset.label}.`,
          });
          savedId = item.id;
        }
      }

      // Passports: default reminder 6 months before expiry (travel validity).
      if (
        saveThing &&
        savedId &&
        asDocument &&
        docKind === 'passport' &&
        (expiry || '').trim() &&
        (expiry || '').trim() !== '—'
      ) {
        const draft = defaultDocumentReminder({
          kind: 'passport',
          name: fields.name,
          expiry,
        });
        if (draft) {
          try {
            await setReminder({
              label: draft.label,
              remindAt: draft.remindAt,
              notes: draft.notes,
              inventoryItemId: savedId,
            });
          } catch (err) {
            console.warn('Passport expiry reminder failed', err);
          }
        }
      }

      const amountNum = parseAmount(fields.price);
      const shouldExpense =
        wantsExpense &&
        !identityDoc &&
        Number.isFinite(amountNum) &&
        amountNum > 0;

      const expenseDraft = expenseDraftFromForm();
      if (shouldExpense && expenseDraft) {
        const dup = findDuplicateExpense(expenses, expenseDraft);
        if (dup) {
          setDuplicateExpense(dup);
          setSaveError('This receipt is already logged.');
          return;
        }
      }

      if (shouldExpense) {
        const expense = await addExpense({
          title: fields.name,
          amount: amountNum,
          currency:
            currencyFromSpokenText(fields.price) ||
            currencyFromSpokenText(ocrText) ||
            defaultCurrency,
          category: guessExpenseCategory(
            `${fields.name} ${fields.purchasedFrom || ''} ${fields.category}`
          ),
          date: fields.purchaseDate,
          merchant: fields.purchasedFrom,
          receiptUri: fields.imageUri,
          receiptRef: expenseDraft?.receiptRef,
          inventoryItemId: savedId ?? undefined,
          source: 'capture',
        });
        expenseId = expense.id;
      } else if (expenseOnly) {
        setSaveError('Add an amount in Price — expense needs a number greater than zero.');
        return;
      }

      blurActiveElement();

      if (opts?.scanAnother) {
        resetToCamera();
        setStatus('Ready for the next receipt.');
        setOcrNote('Previous entry saved.');
        return;
      }

      // Capture is a full-screen modal — dismiss back to Today/Ask instead of
      // pushing detail screens the user has to claw back from.
      dismissCaptureAfterSave();
    } catch (err) {
      console.error('Save failed', err);
      Alert.alert('Couldn’t save', messageForPlanLimit(err) || 'Try again in a moment.');
    } finally {
      setSaving(false);
    }
  }

  if (!permission) {
    return <View style={styles.black} />;
  }

  if (!permission.granted && phase === 'camera') {
    return (
      <View style={[styles.black, styles.centered, { paddingTop: insets.top }]}>
        <Text style={styles.permTitle}>Camera access needed</Text>
        <Text style={styles.permBody}>
          Capture for {preset.label}. You can also upload a photo or PDF — text is
          read automatically.
        </Text>
        <Pressable
          onPress={() => void requestPermission()}
          style={({ pressed }) => [styles.permBtn, pressed && { opacity: 0.9 }]}
        >
          <Text style={styles.permBtnText}>Allow camera</Text>
        </Pressable>
        <Pressable onPress={() => void pickImage()} style={{ marginTop: 14 }}>
          <Text style={styles.link}>Choose from library</Text>
        </Pressable>
        <Pressable onPress={() => void pickDocument()} style={{ marginTop: 10 }}>
          <Text style={styles.link}>Upload a file</Text>
        </Pressable>
        <Pressable onPress={close} style={{ marginTop: 20 }}>
          <Text style={styles.linkMuted}>Not now</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === 'reading') {
    return (
      <View style={[styles.black, styles.centered]}>
        <ActivityIndicator size="large" color={colors.forestBright} />
        <Text style={[styles.permTitle, { marginTop: 20 }]}>{status}</Text>
        <Text style={styles.permBody}>{ocrNote}</Text>
      </View>
    );
  }

  if (phase === 'review' && photoUri) {
    return (
      // KAV so the absolute-positioned save bar lifts above the keyboard —
      // otherwise editing a lower field leaves Save unreachable.
      <KeyboardAvoidingView
        style={[styles.reviewRoot, { paddingTop: insets.top + 8 }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.reviewTop}>
          <Pressable onPress={resetToCamera} hitSlop={8}>
            <Text style={styles.reviewLink}>Retake</Text>
          </Pressable>
          <Text style={styles.reviewTitle}>Looks good?</Text>
          <Pressable onPress={close} hitSlop={8}>
            <X size={20} color={colors.ink} strokeWidth={2} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Image source={{ uri: photoUri }} style={styles.preview} />

          <View style={styles.contextChip}>
            <Text style={styles.contextChipText}>
              {forcedLink && linkedItem
                ? `Attach to ${linkedItem.name}`
                : receiptLooksLike &&
                    (saveDestination === 'expense' || saveDestination === 'both')
                  ? 'Logging expense'
                  : receiptLooksLike
                    ? 'From receipt'
                    : isDocument || saveDestination === 'document'
                      ? 'Saving to Documents'
                      : `Saving to ${preset.label}`}
            </Text>
            <Text style={styles.contextChipMeta}>
              {forcedLink
                ? attachKind === 'receipt'
                  ? 'Receipt'
                  : 'Photo'
                : receiptLooksLike
                  ? purchasedFrom || name || 'Receipt scan'
                  : isDocument || saveDestination === 'document'
                    ? `Personal Documents${
                        isIdentityDocumentKind(docKind)
                          ? ` · ${labelDocumentKind(docKind)}`
                          : ''
                      }`
                    : `${preset.room}${preset.category ? ` · ${preset.category}` : ''}`}
            </Text>
          </View>

          <View style={styles.privacyBanner}>
            <Text style={styles.privacyText}>
              {ocrNote ||
                'Check the fields, then save.'}
            </Text>
          </View>

          {matchCandidates.length > 0 && !forcedLink ? (
            <View style={styles.matchCard}>
              <Text style={styles.matchTitle}>Link to a Talk item?</Text>
              <Text style={styles.matchLead}>
                Added on the go earlier — confirm to attach this receipt. Matched automatically.
              </Text>
              {matchCandidates.map((m) => {
                const on = linkedStubId === m.item.id;
                return (
                  <Pressable
                    key={m.item.id}
                    onPress={() => setLinkedStubId(on ? null : m.item.id)}
                    style={[styles.matchRow, on && styles.matchRowOn]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.matchName}>{m.item.name}</Text>
                      <Text style={styles.matchMeta}>
                        {m.item.room} · {m.item.category}
                        {m.reasons.length ? ` · ${m.reasons.slice(0, 2).join(', ')}` : ''}
                      </Text>
                    </View>
                    <Text style={[styles.matchAction, on && { color: colors.forest }]}>
                      {on ? 'Linked' : 'Link'}
                    </Text>
                  </Pressable>
                );
              })}
              {linkedStubId ? (
                <Pressable onPress={() => setLinkedStubId(null)} style={{ marginTop: 8 }}>
                  <Text style={styles.matchSkip}>Save as a new item instead</Text>
                </Pressable>
              ) : null}
            </View>
          ) : !forcedLink && listIncompleteTalkStubs(items).length > 0 ? (
            <View style={styles.matchCard}>
              <Text style={styles.matchTitle}>Link to a Talk item?</Text>
              <Text style={styles.matchLead}>
                No strong OCR match. Browse incomplete Talk stubs if this is one of them.
              </Text>
              {!browseStubs ? (
                <Pressable onPress={() => setBrowseStubs(true)} style={{ marginTop: 4 }}>
                  <Text style={[styles.matchAction, { color: colors.forest }]}>
                    Browse Talk stubs
                  </Text>
                </Pressable>
              ) : (
                <>
                  {listIncompleteTalkStubs(items)
                    .slice(0, 8)
                    .map((stub) => {
                      const on = linkedStubId === stub.id;
                      return (
                        <Pressable
                          key={stub.id}
                          onPress={() => setLinkedStubId(on ? null : stub.id)}
                          style={[styles.matchRow, on && styles.matchRowOn]}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.matchName}>{stub.name}</Text>
                            <Text style={styles.matchMeta}>
                              {stub.room} · {stub.category}
                            </Text>
                          </View>
                          <Text style={[styles.matchAction, on && { color: colors.forest }]}>
                            {on ? 'Linked' : 'Link'}
                          </Text>
                        </Pressable>
                      );
                    })}
                  {linkedStubId ? (
                    <Pressable onPress={() => setLinkedStubId(null)} style={{ marginTop: 8 }}>
                      <Text style={styles.matchSkip}>Save as a new item instead</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          ) : null}

          {forcedLink ? (
            // Keep attach flow light — no enterprise form dump
            <>
              {(!price || price === '—') && attachKind === 'receipt' ? (
                <Field label="Price (optional)" value={price} onChange={(t) => setPrice(sanitizeAmountInput(t))} placeholder={`${defaultCurrency} 0`} />
              ) : null}
              {attachKind === 'receipt' && (!purchasedFrom || purchasedFrom === '') ? (
                <Field
                  label="Bought from (optional)"
                  value={purchasedFrom}
                  onChange={setPurchasedFrom}
                  placeholder="Amazon, Sharaf DG…"
                />
              ) : null}
            </>
          ) : (
            <>
              {isDocument ? (
                <>
                  <Field
                    label="Name"
                    value={name}
                    onChange={setName}
                    placeholder="e.g. Passport · Jane Doe"
                  />
                  <DateRow label="Expiry" value={expiry} onChange={setExpiry} />
                  {docKind === 'passport' ? (
                    <Text style={styles.remindHint}>
                      {expiry.trim()
                        ? 'Reminder set for 6 months before expiry by default.'
                        : 'Add an expiry date to get a reminder 6 months before.'}
                    </Text>
                  ) : null}
                </>
              ) : (
                <>
                  <Field label="Name" value={name} onChange={setName} />
                  <Field label="Brand" value={brand} onChange={setBrand} />
                  <Field
                    label="Serial"
                    value={serial}
                    onChange={setSerial}
                    autoCorrect={false}
                    autoCapitalize="characters"
                  />
                  <Field label="Price" value={price} onChange={(t) => setPrice(sanitizeAmountInput(t))} placeholder={`${defaultCurrency} 0`} />
                  <Field
                    label="Bought from"
                    value={purchasedFrom}
                    onChange={setPurchasedFrom}
                    placeholder="Amazon, Sharaf DG…"
                  />
                  <DateRow
                    label="Purchase date"
                    value={purchaseDate}
                    onChange={setPurchaseDate}
                  />
                </>
              )}
            </>
          )}

          {(receiptLooksLike || attachKind === 'receipt') && !forcedLink ? (
            <View style={styles.routerCard}>
              <Text style={styles.routerTitle}>Save as</Text>
              <Text style={styles.routerLead}>
                Choose where this receipt goes. You can change it before saving.
              </Text>
              <View style={styles.routerGrid}>
                {SAVE_DESTINATIONS.map((opt) => {
                  const on = saveDestination === opt.id;
                  return (
                    <Pressable
                      key={opt.id}
                      onPress={() => {
                        setSaveDestination(opt.id);
                        if (opt.id === 'document') setIsDocument(true);
                        else if (!preset.preferDocument) setIsDocument(false);
                      }}
                      style={[styles.routerChip, on && styles.routerChipOn]}
                    >
                      <Text style={[styles.routerChipTitle, on && styles.routerChipTitleOn]}>
                        {opt.title}
                      </Text>
                      <Text style={styles.routerChipHint}>{opt.hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : (receiptLooksLike || attachKind === 'receipt') && forcedLink ? (
            <Pressable
              onPress={() =>
                setSaveDestination((d) => (d === 'both' || d === 'expense' ? 'thing' : 'both'))
              }
              style={styles.expenseToggle}
            >
              <View
                style={[
                  styles.expenseCheck,
                  (saveDestination === 'both' || saveDestination === 'expense') &&
                    styles.expenseCheckOn,
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.expenseTitle}>Also log as expense</Text>
                <Text style={styles.expenseHint}>
                  Keeps spend in Expenses when there’s a price.
                </Text>
              </View>
            </Pressable>
          ) : null}

          {duplicateExpense &&
          (saveDestination === 'expense' || saveDestination === 'both') ? (
            <View style={styles.duplicateCard}>
              <Text style={styles.duplicateTitle}>Already logged</Text>
              <Text style={styles.duplicateBody}>
                {formatAmount(duplicateExpense.amount, duplicateExpense.currency)} at{' '}
                {duplicateExpense.merchant || duplicateExpense.title} on{' '}
                {duplicateExpense.date.slice(0, 10)}. Scan a different receipt.
              </Text>
              <Pressable
                onPress={() =>
                  router.replace(`/expenses/${duplicateExpense.id}` as Href)
                }
                hitSlop={8}
              >
                <Text style={styles.duplicateLink}>View existing entry</Text>
              </Pressable>
            </View>
          ) : null}

        </ScrollView>

        <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {saveError ? (
            <Text style={styles.saveError}>{saveError}</Text>
          ) : null}
          <Pressable
            onPress={() => void save()}
            disabled={
              saving ||
              Boolean(
                duplicateExpense &&
                  (saveDestination === 'expense' || saveDestination === 'both')
              )
            }
            style={({ pressed }) => [
              styles.saveBtn,
              pressed && { opacity: 0.92 },
              saving && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.saveBtnText}>
              {saving
                ? 'Saving…'
                : forcedLink
                  ? attachKind === 'receipt'
                    ? 'Attach receipt'
                    : 'Attach photo'
                  : linkedStubId
                    ? 'Link & save'
                    : saveDestination === 'expense'
                      ? duplicateExpense
                        ? 'Already logged'
                        : 'Log expense'
                      : saveDestination === 'both'
                        ? 'Save Thing & expense'
                        : saveDestination === 'document'
                          ? 'Save document'
                          : 'Save'}
            </Text>
          </Pressable>
          {(receiptLooksLike || attachKind === 'receipt') &&
          !forcedLink &&
          (saveDestination === 'expense' || saveDestination === 'both') &&
          !duplicateExpense ? (
            <Pressable
              onPress={() => void save({ scanAnother: true })}
              disabled={saving}
              style={({ pressed }) => [styles.saveSecondary, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.saveSecondaryText}>Log & scan another</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.black}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={facing}
        onCameraReady={() => setReady(true)}
      />

      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={close} style={styles.roundBtn} hitSlop={8}>
          <X size={20} color={colors.pure} strokeWidth={2.2} />
        </Pressable>
        <View style={styles.hintWrap}>
          {forcedLink && linkedItem ? (
            <Text style={styles.contextBadge}>
              {attachKind === 'receipt' ? 'Receipt' : 'Photo'}
            </Text>
          ) : preset.kind !== 'general' ? (
            <Text style={styles.contextBadge}>{preset.label}</Text>
          ) : null}
          <Text style={styles.hint}>
            {forcedLink && linkedItem
              ? attachKind === 'receipt'
                ? `Snap the receipt for ${linkedItem.name}`
                : `Snap a photo of ${linkedItem.name}`
              : preset.hint}
          </Text>
        </View>
        <Pressable
          onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
          style={styles.roundBtn}
          hitSlop={8}
        >
          <RefreshCw size={18} color={colors.pure} strokeWidth={2.2} />
        </Pressable>
      </View>

      <View style={[styles.shutterWrap, { paddingBottom: insets.bottom + 20 }]}>
        <View style={styles.altRow}>
          <Pressable onPress={() => void pickImage()} style={styles.altBtn}>
            <ImageIcon size={18} color={colors.pure} strokeWidth={2} />
            <Text style={styles.altLabel}>Library</Text>
          </Pressable>
          <Pressable
            onPress={() => void snap()}
            disabled={busy || !ready}
            style={({ pressed }) => [
              styles.shutterOuter,
              pressed && { opacity: 0.9, transform: [{ scale: 0.96 }] },
              (busy || !ready) && { opacity: 0.5 },
            ]}
            accessibilityLabel="Take photo"
          >
            {busy ? (
              <ActivityIndicator color={colors.forest} />
            ) : (
              <View style={styles.shutterInner} />
            )}
          </Pressable>
          <Pressable onPress={() => void pickDocument()} style={styles.altBtn}>
            <FileText size={18} color={colors.pure} strokeWidth={2} />
            <Text style={styles.altLabel}>File</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  autoCorrect,
  autoCapitalize,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoCorrect?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.faint}
        autoCorrect={autoCorrect}
        autoCapitalize={autoCapitalize}
        style={styles.input}
      />
    </View>
  );
}

function DateRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <OptionalDateField
        // OCR can leave non-ISO junk here — show it as "not set" so the
        // picker always round-trips a clean YYYY-MM-DD.
        value={parseDateInput(value) ? value : ''}
        onChange={onChange}
      />
    </View>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
  black: { flex: 1, backgroundColor: '#000' },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  permTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 22,
    color: colors.pure,
    textAlign: 'center',
  },
  permBody: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 22,
    color: 'rgba(255,255,255,0.7)',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 28,
  },
  permBtn: {
    backgroundColor: colors.forest,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: radius.sm,
  },
  permBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
  link: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestBright,
  },
  linkMuted: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.55)',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    zIndex: 2,
  },
  hintWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  contextBadge: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: colors.forestBright,
    marginBottom: 2,
  },
  hint: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
  },
  roundBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  altRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 28,
  },
  altBtn: {
    width: 64,
    alignItems: 'center',
    gap: 4,
  },
  altLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: 'rgba(255,255,255,0.8)',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 4,
    borderColor: colors.pure,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.pure,
  },
  reviewRoot: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  reviewTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  reviewTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 17,
    color: colors.ink,
  },
  reviewLink: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
  preview: {
    height: 200,
    marginHorizontal: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceSoft,
  },
  contextChip: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  contextChipText: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  contextChipMeta: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
    marginTop: 2,
  },
  privacyBanner: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.forestWash,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.forestSoft,
  },
  privacyText: {
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 18,
    color: colors.forest,
  },
  remindHint: {
    fontFamily: fonts.sans,
    fontSize: 13,
    lineHeight: 18,
    color: colors.mute,
    marginTop: spacing.xs,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  matchCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  matchTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  matchLead: {
    marginTop: 4,
    marginBottom: spacing.sm,
    fontFamily: fonts.sans,
    fontSize: 16,
    lineHeight: 18,
    color: colors.mute,
  },
  matchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    marginTop: 6,
  },
  matchRowOn: {
    borderColor: colors.forest,
    backgroundColor: colors.forestWash,
  },
  matchName: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
  },
  matchMeta: {
    marginTop: 2,
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
  },
  matchAction: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.slate,
  },
  matchSkip: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
  },
  routerCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  routerTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  routerLead: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
    marginTop: 4,
    marginBottom: spacing.md,
  },
  routerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  routerChip: {
    width: '48%',
    flexGrow: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  routerChipOn: {
    backgroundColor: colors.forestWash,
    borderColor: colors.forest,
  },
  routerChipTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  routerChipTitleOn: {
    color: colors.forest,
  },
  routerChipHint: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
    marginTop: 2,
  },
  expenseToggle: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  expenseCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    marginTop: 2,
  },
  expenseCheckOn: {
    backgroundColor: colors.forest,
    borderColor: colors.forest,
  },
  expenseTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  expenseHint: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.mute,
    marginTop: 2,
  },
  field: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  fieldLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.mute,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  input: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  duplicateCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.amberSoft,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.amber,
  },
  duplicateTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
    color: colors.ink,
  },
  duplicateBody: {
    fontFamily: fonts.sans,
    fontSize: 16,
    color: colors.slate,
    marginTop: 4,
  },
  duplicateLink: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
    marginTop: 10,
  },
  saveBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgElevated,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  saveError: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.coral,
    marginBottom: 8,
  },
  saveBtn: {
    marginHorizontal: 0,
    marginTop: 0,
    height: 50,
    borderRadius: radius.sm,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forestOn,
  },
  saveSecondary: {
    alignItems: 'center',
    paddingVertical: 10,
    marginTop: 4,
  },
  saveSecondaryText: {
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    color: colors.forest,
  },
});
}
