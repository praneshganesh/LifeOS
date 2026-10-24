/** Household default currency, set in onboarding / Settings. Not hardcoded to AED. */

export type CurrencyOption = {
  code: string;
  label: string;
  /** Short hint under the chip, e.g. "Dirham" */
  hint: string;
};

/** Common household currencies, enough for onboarding without a search box. */
export const CURRENCY_OPTIONS: CurrencyOption[] = [
  { code: 'USD', label: 'USD', hint: 'US dollar' },
  { code: 'EUR', label: 'EUR', hint: 'Euro' },
  { code: 'GBP', label: 'GBP', hint: 'Pound' },
  { code: 'AED', label: 'AED', hint: 'Dirham' },
  { code: 'SAR', label: 'SAR', hint: 'Riyal' },
  { code: 'INR', label: 'INR', hint: 'Rupee' },
  { code: 'CAD', label: 'CAD', hint: 'Canadian dollar' },
  { code: 'AUD', label: 'AUD', hint: 'Australian dollar' },
  { code: 'SGD', label: 'SGD', hint: 'Singapore dollar' },
  { code: 'MYR', label: 'MYR', hint: 'Ringgit' },
  { code: 'PKR', label: 'PKR', hint: 'Pakistani rupee' },
  { code: 'EGP', label: 'EGP', hint: 'Egyptian pound' },
  { code: 'JPY', label: 'JPY', hint: 'Yen' },
  { code: 'CHF', label: 'CHF', hint: 'Franc' },
  { code: 'HKD', label: 'HKD', hint: 'Hong Kong dollar' },
  { code: 'NZD', label: 'NZD', hint: 'NZ dollar' },
  { code: 'KWD', label: 'KWD', hint: 'Kuwaiti dinar' },
  { code: 'QAR', label: 'QAR', hint: 'Qatari riyal' },
  { code: 'BHD', label: 'BHD', hint: 'Bahraini dinar' },
  { code: 'OMR', label: 'OMR', hint: 'Omani rial' },
];

const REGION_CURRENCY: Record<string, string> = {
  AE: 'AED',
  SA: 'SAR',
  US: 'USD',
  GB: 'GBP',
  IN: 'INR',
  CA: 'CAD',
  AU: 'AUD',
  SG: 'SGD',
  MY: 'MYR',
  PK: 'PKR',
  EG: 'EGP',
  JP: 'JPY',
  CH: 'CHF',
  HK: 'HKD',
  NZ: 'NZD',
  KW: 'KWD',
  QA: 'QAR',
  BH: 'BHD',
  OM: 'OMR',
  DE: 'EUR',
  FR: 'EUR',
  IT: 'EUR',
  ES: 'EUR',
  NL: 'EUR',
  IE: 'EUR',
  AT: 'EUR',
  BE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
};

const KNOWN = new Set(CURRENCY_OPTIONS.map((c) => c.code));

/** Soft cache so sync create helpers can read the household default. */
let runtimeDefault = '';

export function setRuntimeDefaultCurrency(code: string) {
  const n = normalizeCurrencyCode(code);
  if (n) runtimeDefault = n;
}

export function getRuntimeDefaultCurrency(): string {
  return runtimeDefault || guessCurrencyFromDevice();
}

export function normalizeCurrencyCode(raw?: string | null): string {
  const code = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  return code.length === 3 ? code : '';
}

/** Prefer an explicit profile value; else a device-locale guess (never force AED). */
export function resolveDefaultCurrency(stored?: string | null): string {
  const fromProfile = normalizeCurrencyCode(stored);
  if (fromProfile) return fromProfile;
  return guessCurrencyFromDevice();
}

export function guessCurrencyFromDevice(): string {
  try {
    const locale =
      typeof Intl !== 'undefined'
        ? Intl.DateTimeFormat().resolvedOptions().locale
        : '';
    const region = locale.split(/[-_]/)[1]?.toUpperCase();
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  } catch {
    /* ignore */
  }
  return 'USD';
}

export function labelForCurrency(code: string): string {
  const hit = CURRENCY_OPTIONS.find((c) => c.code === code);
  return hit ? `${hit.code} · ${hit.hint}` : code;
}

export function isKnownCurrency(code: string): boolean {
  return KNOWN.has(normalizeCurrencyCode(code));
}

/** Hard cap for prices / expenses / subscriptions (household-scale money). */
export const MAX_MONEY_AMOUNT = 99_999_999.99;
const MAX_MONEY_WHOLE_DIGITS = 8;

/**
 * Keep amount fields typed as money: digits + optional one decimal, max 2
 * fraction digits. Strips letters/symbols (including currency codes pasted in).
 * Caps magnitude so absurd values cannot be typed in.
 */
export function sanitizeAmountInput(raw: string): string {
  const src = String(raw);
  // Never flip a typed/pasted negative into a positive amount.
  if (/-/.test(src)) return '';
  let s = src.replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    const [wholeRaw, frac = ''] = s.split('.');
    const whole = wholeRaw.slice(0, MAX_MONEY_WHOLE_DIGITS);
    s = `${whole}.${frac.slice(0, 2)}`;
  } else {
    s = s.slice(0, MAX_MONEY_WHOLE_DIGITS);
  }
  // Avoid a lonely "." while typing
  if (s === '.') return '0.';
  return s;
}

/**
 * Reject negatives / NaN; clamp absurd magnitudes. Returns NaN when invalid.
 */
export function normalizeMoneyAmount(raw: string | number | undefined | null): number {
  if (typeof raw === 'string' && /-\s*\d/.test(raw)) return NaN;
  if (typeof raw === 'number' && raw < 0) return NaN;
  const n =
    typeof raw === 'number'
      ? raw
      : Number.parseFloat(String(raw ?? '').replace(/[^\d.,]/g, '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n < 0) return NaN;
  if (n > MAX_MONEY_AMOUNT) return MAX_MONEY_AMOUNT;
  return Math.round(n * 100) / 100;
}

/**
 * Cap a Thing/OCR price string for storage.
 * Empty/cleared → '' (UI shows "—"). Never persist the literal em dash.
 */
export function clampPriceString(
  raw: string | undefined | null,
  fallbackCurrency?: string | null
): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || trimmed === '—' || trimmed === '-') return '';
  // Currency code alone (user cleared the amount) → empty.
  if (/^[A-Za-z]{3}$/.test(trimmed) && !/\d/.test(trimmed)) return '';
  const n = normalizeMoneyAmount(trimmed);
  if (!Number.isFinite(n) || n <= 0) return '';
  const cur =
    currencyFromSpokenText(trimmed) ||
    normalizeCurrencyCode(fallbackCurrency) ||
    '';
  return cur ? `${cur} ${n}` : String(n);
}

/**
 * Keep a currency code while editing a Thing price amount field.
 * Fully clearing the field yields '' so save does not store "—".
 * Typing a different ISO/symbol switches the currency.
 */
export function sanitizeThingPriceInput(
  next: string,
  previous?: string | null
): string {
  const trimmed = String(next ?? '');
  if (!trimmed.trim()) return '';
  const amount = sanitizeAmountInput(trimmed);
  if (!amount) {
    // Allow mid-edit of a bare currency code ("U", "US", "USD") without
    // forcing the previous amount back; empty amount = cleared price.
    return '';
  }
  const cur =
    currencyFromSpokenText(trimmed) || currencyFromSpokenText(previous) || '';
  return cur ? `${cur} ${amount}` : amount;
}

/** Digits-only for pack totals, counts, etc. */
export function sanitizeIntegerInput(raw: string): string {
  return String(raw).replace(/[^\d]/g, '');
}

/**
 * Slice of utterance near a numeric amount so "10 pounds of rice for $30"
 * resolves USD for 30 and does not force GBP onto 30.
 */
export function textNearAmount(
  utterance: string | null | undefined,
  amountToken: string
): string {
  const u = String(utterance || '');
  if (!u || !amountToken) return u;
  const needle = amountToken.replace(/[^\d.]/g, '');
  if (!needle) return u;
  const lower = u.toLowerCase();
  const idx = lower.indexOf(needle);
  if (idx < 0) return u;
  return u.slice(Math.max(0, idx - 28), Math.min(u.length, idx + needle.length + 28));
}

/**
 * Infer currency from spoken/OCR text when the user named one.
 * Symbols ($, €, £, ₹, د.إ) match without word boundaries.
 * "pounds of …" is weight, not GBP.
 */
export function currencyFromSpokenText(
  raw: string | number | undefined | null
): string | undefined {
  if (raw == null || typeof raw === 'number') return undefined;
  const s = String(raw);
  if (/\$/.test(s) || /\b(usd|dollars?)\b/i.test(s)) return 'USD';
  if (/€/.test(s) || /\b(eur|euros?)\b/i.test(s)) return 'EUR';
  if (/£/.test(s) || /\b(gbp)\b/i.test(s)) return 'GBP';
  // Sterling "pounds" — not "10 pounds of rice".
  if (/\bpounds?\b/i.test(s) && !/\bpounds?\s+of\b/i.test(s)) return 'GBP';
  if (/₹/.test(s) || /\b(inr|rupees?)\b/i.test(s)) return 'INR';
  if (/د\.?إ/.test(s) || /\b(aed|dirhams?|dhs|dh)\b/i.test(s)) return 'AED';
  if (/\b(sar|riyals?)\b/i.test(s)) return 'SAR';
  const iso = s.match(/\b([A-Z]{3})\b/);
  if (iso && KNOWN.has(iso[1])) return iso[1];
  return undefined;
}

/** Prefer currency attached to the amount; then a window around it in the utterance. */
export function currencyForAmount(
  amountRaw: string | number | undefined | null,
  utterance?: string | null
): string | undefined {
  const fromAmount = currencyFromSpokenText(amountRaw);
  if (fromAmount) return fromAmount;
  const token =
    typeof amountRaw === 'number'
      ? String(amountRaw)
      : String(amountRaw ?? '').match(/(\d+(?:[.,]\d+)?)/)?.[1] || '';
  return currencyFromSpokenText(textNearAmount(utterance, token));
}
