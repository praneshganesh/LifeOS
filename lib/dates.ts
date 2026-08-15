/** Local calendar day YYYY-MM-DD (not UTC — avoids off-by-one near midnight). */
export function localDayKey(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Warranty expiry from model or speech.
 * "2028" / "until 2028" → end of that year; otherwise YYYY-MM-DD.
 */
export function normalizeWarrantyExpiry(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  if (!s || s === '—' || s === '-') return undefined;
  const yearOnly =
    s.match(/^(?:until|till|through|to)\s+(\d{4})$/i) || s.match(/^(\d{4})$/);
  if (yearOnly) return `${yearOnly[1]}-12-31`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return localDayKey(d);
  return undefined;
}

/** Pull "warranty until 2028" from the user's sentence when the model omits the field. */
export function warrantyExpiryFromUtterance(text?: string): string | undefined {
  if (!text?.trim()) return undefined;
  const m =
    text.match(
      /\b(?:warranty|guarantee)\b[\s\S]{0,48}?\b(?:until|till|through|to)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i
    ) ||
    text.match(/\b(?:until|till|through)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i);
  if (!m) return undefined;
  return normalizeWarrantyExpiry(m[1]);
}

/** Year-only warranties are stored as YYYY-12-31 — show the year in speech. */
export function displayWarrantyExpiry(iso?: string | null): string | undefined {
  const s = iso?.trim();
  if (!s || s === '—' || s === '-') return undefined;
  if (/^\d{4}-12-31$/.test(s)) return s.slice(0, 4);
  return s;
}
