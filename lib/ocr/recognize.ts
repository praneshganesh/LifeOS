/**
 * Web OCR via Tesseract.js. Native builds use ML Kit instead — Metro picks
 * recognize.native.ts on iOS/Android (Tesseract needs workers/wasm/DOM,
 * none of which exist in Hermes). Nothing is uploaded to an AI service.
 */
import { createWorker, type Worker } from 'tesseract.js';
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

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    // Drop the cached promise on failure — otherwise one bad init (e.g. a
    // network hiccup fetching the wasm/langdata) bricks OCR for the session.
    workerPromise = createWorker('eng').catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** Longest edge we hand to Tesseract — plenty for receipt type, and far
 *  below the wasm decoder's memory ceiling on mobile Safari. */
const MAX_OCR_EDGE = 2000;

/**
 * Web only: decode via the browser (Safari reads HEIC natively, which
 * Tesseract's wasm decoder cannot), downscale huge camera photos, and hand
 * Tesseract a canvas. Full-res iPhone captures otherwise fail inside the
 * worker with "Error attempting to read image".
 *
 * Deliberately uses onload instead of img.decode(): Safari rejects decode()
 * for very large images even when they are perfectly decodable, which would
 * silently skip normalization for exactly the photos that need it most.
 */
async function normalizeForOcr(uri: string): Promise<string | HTMLCanvasElement> {
  if (typeof document === 'undefined') return uri;
  try {
    const img = new Image();
    const loaded = new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('browser could not decode image'));
    });
    img.src = uri;
    await loaded;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error('image decoded to 0x0');
    const scale = Math.min(1, MAX_OCR_EDGE / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d canvas context');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } catch (err) {
    console.warn('OCR: normalization failed, passing original to Tesseract', err);
    return uri;
  }
}

export async function recognizeImage(uri: string): Promise<OcrResult> {
  try {
    const [worker, normalized] = await Promise.all([
      getWorker(),
      normalizeForOcr(uri),
    ]);
    const {
      data: { text, confidence },
    } = await worker.recognize(normalized);

    const identity = parseMrzFromOcr(text);
    const kind = identity?.kind ?? classifyDocumentFromText(text);

    return {
      text,
      confidence: confidence ?? 0,
      identity,
      kind,
      engine: 'tesseract',
    };
  } catch (err) {
    console.warn('Local OCR failed', err);
    return {
      text: '',
      confidence: 0,
      identity: null,
      kind: 'unknown',
      engine: 'none',
    };
  }
}

export async function terminateOcr() {
  if (workerPromise) {
    const w = await workerPromise;
    await w.terminate();
    workerPromise = null;
  }
}
