import { Alert, Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';

export type ShareableDocument = {
  name: string;
  imageUri?: string;
  documentKind?: string;
  documentNumber?: string;
  fullName?: string;
  nationality?: string;
  expiryDate?: string;
  warrantyExpiry?: string;
  dateOfBirth?: string;
};

export type ShareMode = 'full' | 'redacted';

function isIdentityDoc(kind?: string) {
  return kind === 'passport' || kind === 'emirates_id';
}

/** Confirm before opening the system share sheet (WhatsApp, Messages, etc.). */
export function confirmShareDocument(
  name: string,
  mode: ShareMode = 'full'
): Promise<boolean> {
  const body =
    mode === 'redacted'
      ? `Share redacted details for “${name}”? Document number and date of birth are omitted. The photo is not shared.`
      : `Share “${name}”? The photo or details leave Saavi through your phone’s share sheet (WhatsApp, Messages, Mail…). Nothing is uploaded by Saavi.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(body));
  }
  return new Promise((resolve) => {
    Alert.alert(mode === 'redacted' ? 'Share redacted?' : 'Share document?', body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Share', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * For passports / Emirates ID — pick full photo+details or redacted text only.
 */
export function chooseShareMode(item: ShareableDocument): Promise<ShareMode | null> {
  if (!isIdentityDoc(item.documentKind)) {
    return Promise.resolve('full');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const redacted = window.confirm(
      `Share “${item.name}”?\n\nOK = full (photo + details)\nCancel = choose redacted in the next step is not available on web — use Cancel then try again.\n\nUse the app for redacted share.`
    );
    return Promise.resolve(redacted ? 'full' : null);
  }
  return new Promise((resolve) => {
    Alert.alert('Share document', `How should “${item.name}” be shared?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Redacted details', onPress: () => resolve('redacted') },
      { text: 'Full (photo)', onPress: () => resolve('full') },
    ]);
  });
}

function buildTextSummary(item: ShareableDocument, mode: ShareMode): string {
  const lines = [item.name];
  if (item.fullName) lines.push(`Name: ${item.fullName}`);
  if (mode === 'full' && item.documentNumber) {
    lines.push(`Number: ${item.documentNumber}`);
  } else if (mode === 'redacted') {
    lines.push('Number: •••••••• (redacted)');
  }
  if (item.nationality) lines.push(`Nationality: ${item.nationality}`);
  if (mode === 'full' && item.dateOfBirth) {
    lines.push(`Date of birth: ${item.dateOfBirth}`);
  }
  const expires = item.expiryDate || item.warrantyExpiry;
  if (expires && expires !== '—') lines.push(`Expires: ${expires}`);
  lines.push('');
  lines.push(
    mode === 'redacted' ? 'Shared from Saavi · redacted.' : 'Shared from Saavi.'
  );
  return lines.join('\n');
}

/**
 * Confirm, then open the OS share sheet.
 * Identity docs can share full photo or redacted text (FP4).
 */
export async function shareDocument(
  item: ShareableDocument
): Promise<'shared' | 'cancelled' | 'unavailable'> {
  const mode = await chooseShareMode(item);
  if (!mode) return 'cancelled';

  const ok = await confirmShareDocument(item.name, mode);
  if (!ok) return 'cancelled';

  if (mode === 'redacted') {
    try {
      const result = await Share.share({
        title: `${item.name} (redacted)`,
        message: buildTextSummary(item, 'redacted'),
      });
      if (result.action === Share.dismissedAction) return 'cancelled';
      return 'shared';
    } catch {
      return 'unavailable';
    }
  }

  const uri = item.imageUri?.trim();
  if (uri && Platform.OS !== 'web') {
    try {
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          dialogTitle: `Share ${item.name}`,
          mimeType: guessMime(uri),
          UTI: 'public.image',
        });
        return 'shared';
      }
    } catch {
      /* fall through to text */
    }
  }

  try {
    const result = await Share.share({
      title: item.name,
      message: buildTextSummary(item, 'full'),
      ...(uri && Platform.OS === 'ios' ? { url: uri } : null),
    });
    if (result.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch {
    return 'unavailable';
  }
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}
