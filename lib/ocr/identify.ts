import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { localDayKey } from '@/lib/dates';
import {
  assertAiAllowance,
  getSupabaseAccessToken,
  recordAiTurn,
  type AiAllowance,
} from '@/lib/aiUsage';
import type { PlanId } from '@/lib/planLimits';

const DEFAULT_URL = 'http://localhost:8787/chat';

export type IdentifyResult = {
  name: string;
  brand: string;
  category: string;
  serial: string;
  note: string;
  confidence: number;
  aiAllowance?: AiAllowance;
};

export class IdentifyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'IdentifyError';
  }
}

function identifyApiUrl() {
  const fromEnv = process.env.EXPO_PUBLIC_CHAT_API_URL?.trim();
  let chatUrl = fromEnv || DEFAULT_URL;
  if (Platform.OS === 'web') {
    try {
      const parsed = new URL(chatUrl);
      const h = parsed.hostname.toLowerCase();
      if (
        h.endsWith('.local') ||
        /^10\./.test(h) ||
        /^192\.168\./.test(h) ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(h)
      ) {
        parsed.hostname = '127.0.0.1';
        chatUrl = parsed.toString();
      }
    } catch {
      /* keep */
    }
  }
  try {
    const u = new URL(chatUrl);
    u.pathname = u.pathname.replace(/\/chat\/?$/, '/identify');
    if (!u.pathname.endsWith('/identify')) {
      u.pathname = '/identify';
    }
    return u.toString();
  } catch {
    return chatUrl.replace(/\/chat\/?$/, '/identify');
  }
}

async function imageToJpegBase64(uri: string): Promise<{ base64: string; mime: string }> {
  try {
    const ImageManipulator = await import('expo-image-manipulator');
    const manipulated = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1280 } }],
      {
        compress: 0.72,
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    if (manipulated.base64) {
      return { base64: manipulated.base64, mime: 'image/jpeg' };
    }
  } catch {
    /* fall through */
  }

  const FileSystem = await import('expo-file-system/legacy');
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { base64, mime: 'image/jpeg' };
}

/**
 * Opt-in cloud vision: send a compressed photo to chat-api `/identify`.
 * Counts as one AI turn (same daily pool as Talk).
 */
export async function identifyCaptureImage(
  uri: string,
  planId: PlanId
): Promise<IdentifyResult> {
  await assertAiAllowance(planId);
  const { base64, mime } = await imageToJpegBase64(uri);
  if (!base64 || base64.length < 32) {
    throw new IdentifyError('Could not read that photo for Identify.');
  }
  // ~3MB base64 ceiling after compress
  if (base64.length > 4_000_000) {
    throw new IdentifyError('Photo is too large to send. Retake a bit closer or try again.');
  }

  const url = identifyApiUrl();
  const token = await getSupabaseAccessToken();
  const proxyToken =
    process.env.EXPO_PUBLIC_CHAT_API_TOKEN?.trim() ||
    (Constants.expoConfig?.extra as { chatApiToken?: string } | undefined)
      ?.chatApiToken ||
    '';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (proxyToken) headers['X-Saavi-Proxy-Token'] = proxyToken;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64: base64,
        mimeType: mime,
        localDate: localDayKey(),
      }),
    });
  } catch (err) {
    const aborted =
      (err instanceof Error && err.name === 'AbortError') ||
      (typeof DOMException !== 'undefined' &&
        err instanceof DOMException &&
        err.name === 'AbortError');
    throw new IdentifyError(
      aborted
        ? 'Identify timed out. Try again in a moment.'
        : 'Can’t reach Identify right now. Check connection / chat-api.'
    );
  } finally {
    clearTimeout(timer);
  }

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    name?: string;
    brand?: string;
    category?: string;
    serial?: string;
    note?: string;
    confidence?: number;
    aiAllowance?: AiAllowance;
  };

  if (!res.ok) {
    throw new IdentifyError(data.error || 'Identify failed.');
  }

  const used = data.aiAllowance?.used;
  await recordAiTurn(
    localDayKey(),
    typeof used === 'number' ? used : undefined
  );

  return {
    name: String(data.name || '').trim(),
    brand: String(data.brand || '').trim(),
    category: String(data.category || '').trim(),
    serial: String(data.serial || '').trim(),
    note: String(data.note || '').trim(),
    confidence:
      typeof data.confidence === 'number' && Number.isFinite(data.confidence)
        ? data.confidence
        : 0,
    aiAllowance: data.aiAllowance,
  };
}
