/**
 * Native OCR via Google ML Kit — fully on-device, no network.
 * Metro resolves this file on iOS/Android; web keeps the Tesseract.js
 * implementation in recognize.ts. Both export the same interface.
 *
 * Requires a dev-client / production build (native module) — not Expo Go.
 */
import TextRecognition from '@react-native-ml-kit/text-recognition';
import {
  classifyDocumentFromText,
  parseMrzFromOcr,
  type ParsedIdentity,
} from '@/lib/ocr/mrz';

export type OcrResult = {
  text: string;
  confidence: number;
  identity: ParsedIdentity | null;
  kind: ParsedIdentity['kind'];
  /** True when a local OCR engine ran successfully */
  engine: 'tesseract' | 'mlkit' | 'none';
};

export async function recognizeImage(uri: string): Promise<OcrResult> {
  try {
    const result = await TextRecognition.recognize(uri);
    const text = result?.text ?? '';

    const identity = parseMrzFromOcr(text);
    const kind = identity?.kind ?? classifyDocumentFromText(text);

    return {
      text,
      // ML Kit reports no document-level confidence; it is reliably strong.
      confidence: text.trim() ? 95 : 0,
      identity,
      kind,
      engine: 'mlkit',
    };
  } catch (err) {
    console.warn('ML Kit OCR failed', err);
    return {
      text: '',
      confidence: 0,
      identity: null,
      kind: 'unknown',
      engine: 'none',
    };
  }
}

/** ML Kit holds no long-lived worker — nothing to tear down. */
export async function terminateOcr() {}
