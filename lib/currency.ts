/** Household default currency — set in onboarding / Settings. Not hardcoded to AED. */

export type CurrencyOption = {
  code: string;
  label: string;
  /** Short hint under the chip, e.g. "Dirham" */
  hint: string;
};

/** Common household currencies — enough for onboarding without a search box. */
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

/**
 * Keep amount fields typed as money: digits + optional one decimal, max 2
 * fraction digits. Strips letters/symbols (including currency codes pasted in).
 */
export function sanitizeAmountInput(raw: string): string {
  let s = String(raw).replace(/[^\d.]/g, '');
  const dot = s.indexOf('.');
  if (dot !== -1) {
    s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '');
    const [whole, frac = ''] = s.split('.');
    s = `${whole}.${frac.slice(0, 2)}`;
  }
  // Avoid a lonely "." while typing
  if (s === '.') return '0.';
  return s;
}

/** Digits-only for pack totals, counts, etc. */
export function sanitizeIntegerInput(raw: string): string {
  return String(raw).replace(/[^\d]/g, '');
}

/**
 * Infer currency from spoken/OCR text when the user named one.
 * Returns undefined when nothing was said — caller should use household default.
 */
export function currencyFromSpokenText(
  raw: string | number | undefined | null
): string | undefined {
  if (raw == null || typeof raw === 'number') return undefined;
  const s = String(raw);
  if (/\$/.test(s) || /\b(usd|dollars?)\b/i.test(s)) return 'USD';
  if (/€/.test(s) || /\b(eur|euros?)\b/i.test(s)) return 'EUR';
  if (/£/.test(s) || /\b(gbp|pounds?)\b/i.test(s)) return 'GBP';
  if (/\b(aed|dirhams?|dhs|dh)\b/i.test(s)) return 'AED';
  if (/\b(sar|riyals?)\b/i.test(s)) return 'SAR';
  if (/\b(inr|rupees?)\b/i.test(s)) return 'INR';
  const iso = s.match(/\b([A-Z]{3})\b/);
  if (iso && KNOWN.has(iso[1])) return iso[1];
  return undefined;
}
