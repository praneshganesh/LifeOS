/** Common manufacturers heard in Talk/Ask. Keep short; spelling is canonical. */
const KNOWN_BRANDS = [
  'Philips',
  'Samsung',
  'Sony',
  'LG',
  'Apple',
  'Google',
  'Microsoft',
  'Dell',
  'HP',
  'Lenovo',
  'Asus',
  'Acer',
  'Xiaomi',
  'Huawei',
  'OnePlus',
  'Nokia',
  'Bose',
  'JBL',
  'Nikon',
  'Canon',
  'Dyson',
  'Nespresso',
  'KitchenAid',
  'Bosch',
  'Siemens',
  'Whirlpool',
  'GE',
  'Panasonic',
  'Toshiba',
  'Sharp',
  'Hisense',
  'TCL',
  'IKEA',
  'Nike',
  'Adidas',
] as const;

/**
 * Pull a known brand from the start of an item name ("Philips lamp" → Philips).
 * Deterministic fallback when the model omits brand.
 */
export function brandFromName(name?: string | null): string | undefined {
  const raw = String(name || '').trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  for (const brand of KNOWN_BRANDS) {
    const b = brand.toLowerCase();
    if (lower === b || lower.startsWith(`${b} `) || lower.startsWith(`${b}-`)) {
      return brand;
    }
  }
  return undefined;
}
