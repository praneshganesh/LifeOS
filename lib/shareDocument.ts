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

export type ShareMode = 'full' | 'details';

function isIdentityDoc(kind?: string) {
  return kind === 'passport' || kind === 'emirates_id' || kind === 'driving_licence';
}

/** Confirm before opening the system share sheet (WhatsApp, Messages, etc.). */
export function confirmShareDocument(
  name: string,
  mode: ShareMode = 'full'
): Promise<boolean> {
  const body =
    mode === 'details'
      ? `Share number and expiry for “${name}”? The photo and date of birth are not included.`
      : `Share “${name}”? The photo and details leave Saavi through your phone’s share sheet (WhatsApp, Messages, Mail…). Nothing is uploaded by Saavi.`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(body));
  }
  return new Promise((resolve) => {
    Alert.alert(mode === 'details' ? 'Share details?' : 'Share document?', body, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Share', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * For passports / Emirates ID — photo+details, or number+expiry text only.
 */
export function chooseShareMode(item: ShareableDocument): Promise<ShareMode | null> {
  if (!isIdentityDoc(item.documentKind)) {
    return Promise.resolve('full');
  }
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const full = window.confirm(
      `Share “${item.name}”?\n\nOK = photo + details\nCancel = number & expiry text only`
    );
    return Promise.resolve(full ? 'full' : 'details');
  }
  return new Promise((resolve) => {
    Alert.alert('Share document', `How should “${item.name}” be shared?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
      { text: 'Number & expiry', onPress: () => resolve('details') },
      { text: 'Photo + details', onPress: () => resolve('full') },
    ]);
  });
}

/** Number + expiry first — what people usually need when sharing an ID. */
export function buildTextSummary(item: ShareableDocument, mode: ShareMode): string {
  const kind =
    item.documentKind === 'passport'
      ? 'Passport'
      : item.documentKind === 'emirates_id'
        ? 'Emirates ID'
        : item.documentKind === 'driving_licence'
          ? 'Driving licence'
          : 'Document';
  const lines = [item.name || kind];
  if (item.documentNumber) {
    lines.push(`Number: ${item.documentNumber}`);
  }
  const expires = item.expiryDate || item.warrantyExpiry;
  if (expires && expires !== '—') {
    lines.push(`Expires: ${expires}`);
  }
  if (mode === 'full') {
    if (item.fullName) lines.push(`Name: ${item.fullName}`);
    if (item.nationality) lines.push(`Nationality: ${item.nationality}`);
  }
  lines.push('');
  lines.push(
    mode === 'details'
      ? 'Shared from Saavi · number & expiry only.'
      : 'Shared from Saavi.'
  );
  return lines.join('\n');
}

/**
 * Confirm, then open the OS share sheet.
 * Identity docs can share photo+details or number+expiry text.
 */
export async function shareDocument(
  item: ShareableDocument
): Promise<'shared' | 'cancelled' | 'unavailable'> {
  const mode = await chooseShareMode(item);
  if (!mode) return 'cancelled';

  const ok = await confirmShareDocument(item.name, mode);
  if (!ok) return 'cancelled';

  const summary = buildTextSummary(item, mode);

  if (mode === 'details') {
    try {
      const result = await Share.share({
        title: `${item.name} (details)`,
        message: summary,
      });
      if (result.action === Share.dismissedAction) return 'cancelled';
      return 'shared';
    } catch {
      return 'unavailable';
    }
  }

  const uri = item.imageUri?.trim();
  // Prefer a message that includes number + expiry (photo-only shares hide those).
  try {
    const result = await Share.share({
      title: item.name,
      message: summary,
      ...(uri && Platform.OS === 'ios' ? { url: uri } : null),
    });
    if (result.action === Share.dismissedAction) return 'cancelled';
    return 'shared';
  } catch {
    /* fall through to image-only */
  }

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
      /* fall through */
    }
  }

  return 'unavailable';
}

function guessMime(uri: string): string {
  const lower = uri.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) return 'image/heic';
  if (lower.endsWith('.pdf')) return 'application/pdf';
  return 'image/jpeg';
}
