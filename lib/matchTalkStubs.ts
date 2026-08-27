import type { InventoryItem } from '@/lib/InventoryContext';

export type CaptureFields = {
  name: string;
  brand: string;
  serial: string;
  price: string;
  purchasedFrom?: string;
  purchaseDate: string;
  warrantyExpiry?: string;
  imageUri?: string;
  ocrText?: string;
  category?: string;
  room?: string;
  spaceId?: string;
};

export type TalkMatch = {
  item: InventoryItem;
  score: number;
  reasons: string[];
};

function normalize(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(s: string) {
  const stop = new Set([
    'a',
    'an',
    'the',
    'to',
    'in',
    'for',
    'my',
    'from',
    'and',
    'of',
    'with',
    'store',
    'new',
    'item',
  ]);
  return normalize(s)
    .split(' ')
    .filter((t) => t.length > 1 && !stop.has(t));
}

function overlap(a: string[], b: string[]) {
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  let hit = 0;
  for (const t of a) if (setB.has(t)) hit += 1;
  return hit / Math.max(a.length, b.length);
}

/** Talk-added stubs waiting for receipt / serial / photo enrichment. */
export function isTalkStub(item: InventoryItem): boolean {
  if (item.source === 'talk') return true;
  return item.timeline?.some((t) => /added via talk/i.test(t.event)) ?? false;
}

export function isIncompleteStub(item: InventoryItem): boolean {
  if (!isTalkStub(item)) return false;
  const thinSerial = !item.serial || item.serial === '—';
  const thinPrice = !item.price || item.price === '—';
  const noPhoto = !item.imageUri;
  const thinPurchase = !item.purchaseDate || item.purchaseDate === '—';
  const thinMerchant = !item.purchasedFrom;
  return thinSerial || thinPrice || noPhoto || thinPurchase || thinMerchant;
}

/**
 * Score Talk stubs against capture name/brand/OCR text.
 * Pure local string rules — no cloud AI.
 */
export function findTalkMatches(
  inventory: InventoryItem[],
  capture: {
    name: string;
    brand: string;
    ocrText?: string;
    category?: string;
  },
  limit = 3
): TalkMatch[] {
  const stubs = inventory.filter(isIncompleteStub);
  if (!stubs.length) return [];

  const hay = normalize(
    [capture.name, capture.brand, capture.ocrText || '', capture.category || ''].join(' ')
  );
  const hayTokens = tokens(hay);
  const nameTokens = tokens(capture.name);
  const brandTokens = tokens(capture.brand);

  const scored: TalkMatch[] = stubs.map((item) => {
    const reasons: string[] = [];
    let score = 0;
    const itemTokens = tokens(`${item.name} ${item.brand} ${item.category}`);

    const nameOverlap = overlap(tokens(item.name), nameTokens.length ? nameTokens : hayTokens);
    if (nameOverlap >= 0.34) {
      score += nameOverlap * 0.55;
      reasons.push('name');
    }

    // Stub name tokens appear in OCR blob (e.g. "macbook" on Apple receipt)
    const stubInOcr = overlap(tokens(item.name), hayTokens);
    if (stubInOcr >= 0.4) {
      score += stubInOcr * 0.35;
      reasons.push('receipt text');
    }

    if (brandTokens.length) {
      const brandHit = overlap(tokens(item.name + ' ' + item.brand), brandTokens);
      if (brandHit > 0) {
        score += 0.15;
        reasons.push('brand');
      }
    } else if (item.brand && item.brand !== 'Unknown' && hay.includes(normalize(item.brand))) {
      score += 0.12;
      reasons.push('brand');
    }

    if (
      capture.category &&
      item.category &&
      normalize(capture.category) === normalize(item.category)
    ) {
      score += 0.08;
      reasons.push('category');
    }

    // Prefer recent Talk stubs (on the go → home same day/week)
    const ageMs = Date.now() - new Date(item.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays <= 2) {
      score += 0.12;
      reasons.push('recent');
    } else if (ageDays <= 14) {
      score += 0.06;
      reasons.push('this week');
    }

    // Soft boost for product-word aliases
    const aliases: [RegExp, RegExp][] = [
      [/macbook|mac book/i, /macbook|mac book|apple/i],
      [/iphone|phone/i, /iphone|apple/i],
      [/ipad/i, /ipad|apple/i],
      [/airpods|earbuds/i, /airpods|earbud|headphone|apple/i],
      [/headphone|sony|bose|wh-?1000/i, /headphone|airpods|sony|bose|wh-?1000/i],
      [/prado|land\s*cruiser/i, /toyota|prado|vehicle|car/i],
      [/dyson|vacuum/i, /dyson|vacuum/i],
      [/ps5|playstation|xbox|switch/i, /ps5|playstation|xbox|nintendo|console/i],
      [/tv|television|oled|qled/i, /tv|samsung|lg|sony|oled/i],
      [/coffee|breville|nespresso/i, /coffee|breville|nespresso|machine/i],
    ];
    for (const [stubRe, ocrRe] of aliases) {
      if (stubRe.test(item.name) && ocrRe.test(hay)) {
        score += 0.2;
        reasons.push('product alias');
        break;
      }
    }

    // Exact serial in OCR wins hard
    if (
      item.serial &&
      item.serial !== '—' &&
      item.serial.length >= 5 &&
      hay.includes(normalize(item.serial))
    ) {
      score += 0.35;
      reasons.push('serial');
    }

    return { item, score: Math.min(score, 1), reasons };
  });

  return scored
    .filter((m) => m.score >= 0.32)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

/** All incomplete Talk stubs for manual browse when OCR match is weak. */
export function listIncompleteTalkStubs(inventory: InventoryItem[]): InventoryItem[] {
  return inventory
    .filter(isIncompleteStub)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
}

/** Merge capture enrichment into an existing Talk stub. */
export function mergeCaptureIntoStub(
  stub: InventoryItem,
  fields: CaptureFields
): Partial<InventoryItem> {
  const label = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const nextName = (() => {
    if (!fields.name || fields.name === 'New item') return stub.name;
    // Prefer OCR/product name when stub is a vague Talk label
    const stubVague = /^(new item|item|thing|purchase)$/i.test(stub.name.trim());
    if (stubVague) return fields.name;
    if (fields.name.length >= stub.name.length) return fields.name;
    return stub.name;
  })();

  return {
    name: nextName,
    brand:
      fields.brand && fields.brand !== 'Unknown' && fields.brand !== 'Document'
        ? fields.brand
        : stub.brand,
    serial: fields.serial && fields.serial !== '—' ? fields.serial : stub.serial,
    price: fields.price && fields.price !== '—' ? fields.price : stub.price,
    purchasedFrom: fields.purchasedFrom || stub.purchasedFrom,
    purchaseDate:
      fields.purchaseDate && fields.purchaseDate !== '—'
        ? fields.purchaseDate
        : stub.purchaseDate,
    warrantyExpiry: fields.warrantyExpiry || stub.warrantyExpiry,
    warrantyActive: Boolean(fields.warrantyExpiry) || stub.warrantyActive,
    imageUri: fields.imageUri || stub.imageUri,
    ocrText: fields.ocrText || stub.ocrText,
    ocrOnDevice: true,
    category: fields.category || stub.category,
    room: fields.room || stub.room,
    spaceId: fields.spaceId || stub.spaceId,
    source: 'capture',
    insight: 'Receipt linked to a Talk stub automatically.',
    timeline: [
      { date: label, event: 'Receipt / photo linked from Capture' },
      ...stub.timeline,
    ],
  };
}
