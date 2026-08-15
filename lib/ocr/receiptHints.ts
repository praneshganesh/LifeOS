/**
 * Lightweight receipt field hints from on-device OCR text.
 * Keyword / regex only — no cloud AI.
 */

export type ReceiptHints = {
  name?: string;
  brand?: string;
  serial?: string;
  price?: string;
  purchaseDate?: string;
  merchant?: string;
  looksLikeReceipt: boolean;
};

/** Where Capture should file a receipt-like photo. */
export type ReceiptSaveDestination = 'thing' | 'expense' | 'both' | 'document';

/** Heuristic default for the T3 receipt router. */
export function suggestReceiptDestination(hints: ReceiptHints): ReceiptSaveDestination {
  if (!hints.looksLikeReceipt) return 'thing';
  const hasProduct = Boolean(hints.brand || hints.name);
  const hasPrice = Boolean(hints.price);
  if (hasProduct && hasPrice) return 'both';
  if (hasPrice && !hasProduct) return 'expense';
  return 'thing';
}

const BRANDS = [
  'apple',
  'sony',
  'samsung',
  'lg',
  'dyson',
  'breville',
  'ikea',
  'toyota',
  'dell',
  'hp',
  'lenovo',
  'microsoft',
  'bose',
  'nike',
  'adidas',
];

const PRODUCTS: { re: RegExp; name: string }[] = [
  { re: /\bmacbook\s*(pro|air)?\b/i, name: 'MacBook' },
  { re: /\biphone\s*\d*/i, name: 'iPhone' },
  { re: /\bipad\b/i, name: 'iPad' },
  { re: /\bairpods\b/i, name: 'AirPods' },
  { re: /\bwh-?1000xm\d\b/i, name: 'WH-1000XM Headphones' },
  { re: /\bheadphones?\b/i, name: 'Headphones' },
  { re: /\blaptop\b/i, name: 'Laptop' },
  { re: /\bvacuum\b/i, name: 'Vacuum' },
  { re: /\bcoffee\b/i, name: 'Coffee machine' },
];

export function extractReceiptHints(ocrText: string): ReceiptHints {
  const text = ocrText || '';
  const lower = text.toLowerCase();
  const looksLikeReceipt =
    /\b(invoice|receipt|total|subtotal|vat|tax|amount|paid|apple store|sharaf|amazon)\b/i.test(
      text
    ) || /\b(aed|usd|eur)\s*[\d,]+/i.test(text);

  let brand: string | undefined;
  for (const b of BRANDS) {
    if (new RegExp(`\\b${b}\\b`, 'i').test(lower)) {
      brand = b.charAt(0).toUpperCase() + b.slice(1);
      break;
    }
  }

  let name: string | undefined;
  for (const p of PRODUCTS) {
    const m = text.match(p.re);
    if (m) {
      name = p.name;
      if (/macbook/i.test(p.name) && /pro/i.test(m[0])) name = 'MacBook Pro';
      if (/macbook/i.test(p.name) && /air/i.test(m[0])) name = 'MacBook Air';
      break;
    }
  }

  const serialMatch =
    text.match(/\b(?:s\/?n|serial(?:\s*no\.?| number)?|imei)[:\s#]*([A-Z0-9-]{6,})\b/i) ||
    text.match(/\b([A-Z]{2,}\d[A-Z0-9]{5,})\b/);
  const serial = serialMatch?.[1];

  const priceMatch =
    text.match(/\b(?:total|amount|grand\s*total|paid)[:\s]*(AED|USD|EUR)?\s*([\d,]+\.?\d*)/i) ||
    text.match(/\b(AED|USD|EUR)\s*([\d,]+\.?\d*)/i);
  const price = priceMatch
    ? `${(priceMatch[1] || 'AED').toUpperCase()} ${priceMatch[2]}`
    : undefined;

  const dateMatch =
    text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/) ||
    text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.]20\d{2})\b/);
  let purchaseDate: string | undefined;
  if (dateMatch?.[1]) {
    const raw = dateMatch[1].replace(/[/.]/g, '-');
    if (/^20\d{2}/.test(raw)) purchaseDate = raw;
    else {
      const [d, m, y] = raw.split('-');
      if (d && m && y) purchaseDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
  }

  const MERCHANTS = [
    'carrefour',
    'spinneys',
    'waitrose',
    'lulu',
    'amazon',
    'noon',
    'sharaf dg',
    'ikea',
    'starbucks',
    'costa',
    'apple store',
    'virgin megastore',
  ];
  let merchant: string | undefined;
  for (const m of MERCHANTS) {
    if (lower.includes(m)) {
      merchant = m
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      break;
    }
  }

  if (brand === 'Apple' && name?.startsWith('MacBook')) {
    // keep
  } else if (brand === 'Apple' && !name) {
    name = 'Apple product';
  }

  return {
    name,
    brand,
    serial,
    price,
    purchaseDate,
    merchant,
    looksLikeReceipt,
  };
}
