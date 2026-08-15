/**
 * On-device OCR via Tesseract.js — runs in the browser/app runtime.
 * Nothing is uploaded to an AI service.
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
  /** True when we used local OCR engine successfully */
  engine: 'tesseract' | 'none';
};

let workerPromise: Promise<Worker> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = (async () => {
      const worker = await createWorker('eng');
      return worker;
    })();
  }
  return workerPromise;
}

export async function recognizeImage(uri: string): Promise<OcrResult> {
  try {
    const worker = await getWorker();
    const {
      data: { text, confidence },
    } = await worker.recognize(uri);

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
