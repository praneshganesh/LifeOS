/**
 * Local MRZ parsers — no network, no AI.
 * ICAO 9303 TD3 (passport) and TD1 (Emirates ID / residence cards).
 */

export type MrzDocumentKind = 'passport' | 'emirates_id' | 'unknown';

export type ParsedIdentity = {
  kind: MrzDocumentKind;
  fullName: string;
  givenNames: string;
  surname: string;
  documentNumber: string;
  nationality: string;
  dateOfBirth: string; // YYYY-MM-DD
  sex: string;
  expiryDate: string; // YYYY-MM-DD
  issuingCountry: string;
  optionalData?: string;
  rawMrz: string[];
};

function cleanLine(s: string) {
  return s
    .toUpperCase()
    .replace(/[^A-Z0-9<]/g, '')
    .replace(/\s+/g, '');
}

/** YYMMDD → YYYY-MM-DD (years 00–30 → 2000s, else 1900s for DOB; expiry always 2000s if <50). */
function parseYyMmDd(raw: string, preferFuture = false): string {
  if (!/^\d{6}$/.test(raw)) return '';
  const yy = Number(raw.slice(0, 2));
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  let century = 2000;
  if (!preferFuture) {
    century = yy <= 30 ? 2000 : 1900;
  } else {
    century = yy < 50 ? 2000 : 1900;
  }
  return `${century + yy}-${mm}-${dd}`;
}

function namesFromField(field: string) {
  const parts = field.split('<<').filter(Boolean);
  const surname = (parts[0] ?? '').replace(/</g, ' ').trim();
  const givenNames = (parts[1] ?? '').replace(/</g, ' ').replace(/\s+/g, ' ').trim();
  const fullName = [givenNames, surname].filter(Boolean).join(' ').trim();
  return { surname, givenNames, fullName };
}

/** Extract likely MRZ lines from noisy OCR text. */
export function extractMrzLines(ocrText: string): string[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => cleanLine(l))
    .filter((l) => l.length >= 28 && (l.includes('<') || /[A-Z]{2}/.test(l)));

  // Prefer lines that look like MRZ (lots of < or long alnum)
  const scored = lines
    .map((l) => ({
      l,
      score: (l.match(/</g) ?? []).length * 2 + (l.length >= 30 ? 5 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.l);

  return scored.slice(0, 4);
}

export function parseTd3Passport(line1: string, line2: string): ParsedIdentity | null {
  const l1 = cleanLine(line1).padEnd(44, '<').slice(0, 44);
  const l2 = cleanLine(line2).padEnd(44, '<').slice(0, 44);
  if (!l1.startsWith('P')) return null;

  const issuingCountry = l1.slice(2, 5).replace(/</g, '');
  const { surname, givenNames, fullName } = namesFromField(l1.slice(5));
  const documentNumber = l2.slice(0, 9).replace(/</g, '');
  const nationality = l2.slice(10, 13).replace(/</g, '');
  const dateOfBirth = parseYyMmDd(l2.slice(13, 19));
  const sex = l2[20] === 'M' || l2[20] === 'F' ? l2[20] : 'X';
  const expiryDate = parseYyMmDd(l2.slice(21, 27), true);

  return {
    kind: 'passport',
    fullName,
    givenNames,
    surname,
    documentNumber,
    nationality,
    dateOfBirth,
    sex,
    expiryDate,
    issuingCountry,
    rawMrz: [l1, l2],
  };
}

/** TD1 — 3×30 (Emirates ID / many national ID cards). */
export function parseTd1Id(line1: string, line2: string, line3: string): ParsedIdentity | null {
  const l1 = cleanLine(line1).padEnd(30, '<').slice(0, 30);
  const l2 = cleanLine(line2).padEnd(30, '<').slice(0, 30);
  const l3 = cleanLine(line3).padEnd(30, '<').slice(0, 30);
  if (!(l1.startsWith('I') || l1.startsWith('A') || l1.startsWith('C'))) return null;

  const issuingCountry = l1.slice(2, 5).replace(/</g, '');
  const documentNumber = l1.slice(5, 14).replace(/</g, '');
  const dateOfBirth = parseYyMmDd(l2.slice(0, 6));
  const sex = l2[7] === 'M' || l2[7] === 'F' ? l2[7] : 'X';
  const expiryDate = parseYyMmDd(l2.slice(8, 14), true);
  const nationality = l2.slice(15, 18).replace(/</g, '');
  const { surname, givenNames, fullName } = namesFromField(l3);

  const isUae =
    issuingCountry === 'ARE' ||
    nationality === 'ARE' ||
    /UAE|EMIRATES|IDENTITY/.test(l1 + l2 + l3);

  return {
    kind: isUae ? 'emirates_id' : 'unknown',
    fullName,
    givenNames,
    surname,
    documentNumber,
    nationality,
    dateOfBirth,
    sex,
    expiryDate,
    issuingCountry,
    optionalData: l1.slice(15).replace(/</g, ' ').trim(),
    rawMrz: [l1, l2, l3],
  };
}

export function parseMrzFromOcr(ocrText: string): ParsedIdentity | null {
  const lines = extractMrzLines(ocrText);
  if (lines.length >= 2) {
    // Try TD3 (passport) — longest lines
    const long = [...lines].sort((a, b) => b.length - a.length);
    const td3 = long.filter((l) => l.length >= 40);
    if (td3.length >= 2) {
      const parsed = parseTd3Passport(td3[0], td3[1]);
      if (parsed) return parsed;
    }
  }
  if (lines.length >= 3) {
    const td1 = lines.filter((l) => l.length >= 28 && l.length <= 36).slice(0, 3);
    if (td1.length === 3) {
      const parsed = parseTd1Id(td1[0], td1[1], td1[2]);
      if (parsed) return parsed;
    }
  }
  // Heuristic: 2 long lines starting with P
  const pLines = lines.filter((l) => l.startsWith('P') && l.length >= 40);
  if (pLines.length >= 1 && lines.length >= 2) {
    return parseTd3Passport(pLines[0], lines.find((l) => l !== pLines[0]) ?? lines[1]);
  }
  return null;
}

/** Keyword fallback when MRZ is unreadable — still on-device, no AI. */
export function classifyDocumentFromText(text: string): MrzDocumentKind {
  const t = text.toUpperCase();
  if (/EMIRATES\s*ID|هوية|RESIDENCY|IDENTITY CARD|UAE/.test(t) && /ID|IDENTITY/.test(t)) {
    return 'emirates_id';
  }
  if (/PASSPORT|PASSEPORT|جواز/.test(t)) return 'passport';
  if (/P</.test(t) || /\nP[A-Z</]/.test(t)) return 'passport';
  return 'unknown';
}
