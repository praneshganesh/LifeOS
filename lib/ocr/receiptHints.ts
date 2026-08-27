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
  /** POS slip / VAT trans id — strongest duplicate signal */
  receiptRef?: string;
  looksLikeReceipt: boolean;
};

/** Transaction / slip number from receipt OCR — unique per purchase. */
export function extractReceiptRef(ocrText: string): string | undefined {
  const text = ocrText || '';
  const patterns = [
    /(?:vat\s*trans\.?\s*no\.?)[:\s#]*(\d{10,})/i,
    /(?:slip)[:\s#]*([A-Z0-9]{10,})/i,
    /(?:eft-trans\s*no)[:\s#=]*(\d{4,})/i,
    /\btrans(?:action)?[:\s]+(\d{6,})/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

/** Where Capture should file a receipt-like photo. */
export type ReceiptSaveDestination = 'thing' | 'expense' | 'both' | 'document';

/** Heuristic default for the T3 receipt router. */
export function suggestReceiptDestination(hints: ReceiptHints): ReceiptSaveDestination {
  if (!hints.looksLikeReceipt) return 'thing';
  // A recognizable product on the receipt → capture the thing AND the spend.
  // Brand alone doesn't count: on store receipts (IKEA, Apple Store) the
  // "brand" is usually just the merchant, not a possession worth tracking.
  if (hints.name && hints.price) return 'both';
  // Receipts are spend records first — default to expense, never thing.
  return 'expense';
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

function titleCaseWords(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

const MERCHANT_KEYWORD =
  /\b(hypermarket|supermarket|market|restaurant|cafe|pharmacy|bakery|trading|store|mart)\b/i;

/**
 * OCR headers are often mangled ("LULU HYPERMARKET" → "Clon ot 5M Lo
 * AVERMARKET»"). Only accept a header-derived merchant when the keyword is an
 * intact word and the string doesn't look like OCR noise.
 */
function cleanMerchantCandidate(raw: string): string | undefined {
  const cleaned = raw
    .replace(/\s*\([^)]*\)/g, '')
    .replace(/[^A-Za-z&.'\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!MERCHANT_KEYWORD.test(cleaned)) return undefined;
  const tokens = cleaned.split(' ');
  if (tokens.length > 5) return undefined;
  // Garbled headers decay into runs of short junk tokens ("Clon ot M Lo").
  const shortTokens = tokens.filter((t) => t.replace(/[^A-Za-z]/g, '').length <= 2).length;
  if (shortTokens > 1) return undefined;
  return cleaned;
}

function inferMerchant(text: string, lower: string): string | undefined {
  for (const m of MERCHANTS) {
    if (lower.includes(m)) {
      return titleCaseWords(m);
    }
  }
  const header = text.match(
    /([A-Za-z][A-Za-z0-9&.'\s-]{2,42}(?:hypermarket|supermarket|market|restaurant|cafe|pharmacy|bakery|trading)[^\n]{0,24})/i
  );
  if (header) {
    return cleanMerchantCandidate(header[1]);
  }
  return undefined;
}

/**
 * Expense / capture title from receipt OCR only — never a module preset like
 * "Insurance document".
 */
export function receiptTitleFromOcr(ocrText: string, hints: ReceiptHints): string {
  if (hints.name?.trim()) return hints.name.trim();
  if (hints.merchant?.trim()) return `${hints.merchant.trim()} purchase`;

  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  for (const line of lines.slice(0, 6)) {
    if (/^(tax\s*invoice|tax\s*reg|trn|date|staff|items|slip|vat|phone|www\.)/i.test(line)) {
      continue;
    }
    if (line.length < 4 || /^\d[\d\s.-]{6,}$/.test(line)) continue;
    if (/^[A-Z0-9]{10,}$/.test(line.replace(/\s/g, ''))) continue;
    if (MERCHANT_KEYWORD.test(line)) {
      const candidate = cleanMerchantCandidate(line);
      if (candidate) return candidate.slice(0, 48);
    }
  }

  for (const line of lines) {
    const item = line.match(/^(.+?)\s+[\d,]+\.\d{2}\s*$/);
    if (
      item &&
      item[1].length >= 4 &&
      !/^(total|vat|amount|subtotal|paid|cards?)/i.test(item[1])
    ) {
      return item[1].trim().slice(0, 48);
    }
  }

  if (hints.price?.trim()) return `Receipt ${hints.price.trim()}`;
  return 'Receipt';
}

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

  // Explicit serial markers always count. The loose pattern (letters+digits)
  // is only safe off-receipt — on receipts it matches TRN/tax-reg numbers
  // when OCR drops the colon (e.g. "TRN100228723100003").
  const serialMatch =
    text.match(/\b(?:s\/?n|serial(?:\s*no\.?| number)?|imei)[:\s#]*([A-Z0-9-]{6,})\b/i) ||
    (looksLikeReceipt ? null : text.match(/\b([A-Z]{2,}\d[A-Z0-9]{5,})\b/));
  const serial = serialMatch?.[1];

  // --- Price ---------------------------------------------------------------
  // Receipts rarely put the amount right after the word "total": bilingual
  // receipts interleave Arabic, and column layouts put the number on the next
  // OCR line. Strategy: total line → its neighbor → currency-tagged amount →
  // largest decimal amount on the receipt (which is almost always the total).
  const lines = text.split(/\r?\n/);
  const amountIn = (s: string): string | undefined =>
    s?.match(/(?:AED|USD|EUR|\$|€)?\s*-?\s*([\d,]+\.\d{2})\b/i)?.[1];

  let priceValue: string | undefined;
  const totalIdx = lines.findIndex((l) =>
    /\b(grand\s*total|total|amount\s*due|paid)\b/i.test(l)
  );
  if (totalIdx >= 0) {
    priceValue = amountIn(lines[totalIdx]) ?? amountIn(lines[totalIdx + 1] ?? '');
  }
  if (!priceValue) {
    // Currency-tagged amount must sit on the SAME line as the code — on
    // column-split OCR "AED" can land right before the EFT/receipt number
    // ("AED\n60141"), which is not a price.
    priceValue = text.match(
      /\b(?:AED|USD|EUR)[^\S\r\n]*([\d,]+(?:\.\d{2})?)\b/i
    )?.[1];
  }
  if (!priceValue) {
    // Largest amount ≈ the total — but skip tender lines, where the cash
    // handed over ("CASH 500.00 / CHANGE 485.20") dwarfs the real total,
    // and POS bookkeeping lines (EFT/auth/receipt numbers).
    let best = 0;
    for (const line of lines) {
      if (
        /\b(cash|change|tender|card\s*no|balance|eft|auth|trn|receipt\s*(no|#)|pos)\b/i.test(
          line
        )
      ) {
        continue;
      }
      for (const raw of line.match(/\b[\d,]+\.\d{2}\b/g) ?? []) {
        const v = parseFloat(raw.replace(/,/g, ''));
        if (v > best) {
          best = v;
          priceValue = raw;
        }
      }
    }
  }
  const currency = text.match(/\b(AED|USD|EUR|GBP|SAR|INR)\b/i)?.[1]?.toUpperCase();
  const price = priceValue
    ? currency
      ? `${currency} ${priceValue}`
      : priceValue
    : undefined;

  // --- Date ----------------------------------------------------------------
  // Accept 2-digit years too — POS receipts print "08/08/26", not 2026.
  const dateMatch =
    text.match(/\b(20\d{2}[-/.]\d{1,2}[-/.]\d{1,2})\b/) ||
    text.match(/\b(\d{1,2}[-/.]\d{1,2}[-/.](?:20)?\d{2})\b/);
  let purchaseDate: string | undefined;
  if (dateMatch?.[1]) {
    const raw = dateMatch[1].replace(/[/.]/g, '-');
    if (/^20\d{2}/.test(raw)) {
      purchaseDate = raw;
    } else {
      const [dRaw, mRaw, yRaw] = raw.split('-');
      let d = parseInt(dRaw, 10);
      let m = parseInt(mRaw, 10);
      // Day-first (UAE/EU) by default; swap only when that can't be right.
      if (m > 12 && d <= 12) [d, m] = [m, d];
      const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
      if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
        purchaseDate = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }
  }

  let merchant = inferMerchant(text, lower);

  const receiptRef = extractReceiptRef(text);

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
    receiptRef,
    looksLikeReceipt,
  };
}
