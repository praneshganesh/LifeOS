/**
 * Local MRZ + ID heuristics — no network, no AI.
 * ICAO 9303 TD3 (passport) and TD1 (Emirates ID / residence cards).
 * Front-side Emirates ID / driving licence use keyword + number patterns.
 */

export type MrzDocumentKind =
  | 'passport'
  | 'emirates_id'
  | 'driving_licence'
  | 'unknown';

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

/** Field hints when MRZ is missing but the photo still looks like an ID. */
export type DocumentFieldHints = {
  kind: MrzDocumentKind;
  documentNumber?: string;
  fullName?: string;
  expiryDate?: string;
  dateOfBirth?: string;
  nationality?: string;
};

function cleanLine(s: string) {
  return s
    .toUpperCase()
    // OCR often mangles MRZ filler `<` into lookalikes
    .replace(/[«»‹›〈〉＜﹝]/g, '<')
    .replace(/[^A-Z0-9<]/g, '')
    .replace(/\s+/g, '');
}

/** YYMMDD → YYYY-MM-DD (years 00–30 → 2000s, else 1900s for DOB; expiry always 2000s if <50). */
function parseYyMmDd(raw: string, preferFuture = false): string {
  if (!/^\d{6}$/.test(raw)) return '';
  const yy = Number(raw.slice(0, 2));
  const mm = raw.slice(2, 4);
  const dd = raw.slice(4, 6);
  // Reject impossible calendar dates — random digit runs from receipts and
  // addresses otherwise "parse" into things like 2002-28-72.
  if (Number(mm) < 1 || Number(mm) > 12 || Number(dd) < 1 || Number(dd) > 31) return '';
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
      score:
        (l.match(/</g) ?? []).length * 2 +
        (l.length >= 30 ? 5 : 0) +
        (/^I[L<]?ARE/.test(l) ? 20 : 0) +
        (/^\d{6}[0-9<][MFX]/.test(l) ? 15 : 0) +
        (l.includes('<<') ? 12 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.l);

  return scored.slice(0, 6);
}

/** Pick TD1 lines by role — OCR order is unreliable and `<` is often dropped/misread. */
function pickTd1Lines(lines: string[]): [string, string, string] | null {
  const cleaned = lines.map((l) => cleanLine(l));
  const line1 =
    cleaned.find((l) => /^I[L<]?ARE/.test(l)) ??
    cleaned.find((l) => /^I[<A-Z]/.test(l) && l.length >= 28) ??
    cleaned.find((l) => /^[IAC][L<A-Z0-9]{27,}/.test(l));
  const line2 =
    cleaned.find((l) => /^\d{6}[0-9<][MFX\d]/.test(l) && l !== line1) ??
    cleaned.find((l) => /^\d{6}/.test(l) && /[MF]/.test(l.slice(6, 10)) && l !== line1);
  const line3 =
    cleaned.find((l) => l.includes('<<') && l !== line1 && l !== line2) ??
    cleaned.find(
      (l) =>
        l !== line1 &&
        l !== line2 &&
        /[A-Z]{3,}/.test(l) &&
        !/^\d/.test(l) &&
        !/^I[L<]?ARE/.test(l)
    );
  if (line1 && line2 && line3) return [line1, line2, line3];
  return null;
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

  // Real MRZ always carries valid YYMMDD dates. Without them this is almost
  // certainly a dense text line (address, phone numbers) that merely starts
  // with P — cleanLine strips spaces, so receipts can produce such lines.
  if (!dateOfBirth && !expiryDate) return null;

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
  // OCR often turns `I<ARE` into `ILARE` ( < → L ) or `IARE` ( < dropped ).
  let raw1 = cleanLine(line1);
  if (/^ILARE/.test(raw1)) raw1 = `I<ARE${raw1.slice(5)}`;
  else if (/^IARE/.test(raw1)) raw1 = `I<ARE${raw1.slice(4)}`;

  const l1 = raw1.padEnd(30, '<').slice(0, 30);
  const l2 = cleanLine(line2).padEnd(30, '<').slice(0, 30);
  const l3 = cleanLine(line3).padEnd(30, '<').slice(0, 30);
  if (!(l1.startsWith('I') || l1.startsWith('A') || l1.startsWith('C'))) return null;

  const issuingCountry = l1.slice(2, 5).replace(/</g, '');
  const cardNumber = l1.slice(5, 14).replace(/</g, '');
  const dateOfBirth = parseYyMmDd(l2.slice(0, 6));
  const sex = l2[7] === 'M' || l2[7] === 'F' ? l2[7] : 'X';
  const expiryDate = parseYyMmDd(l2.slice(8, 14), true);
  const nationality = l2.slice(15, 18).replace(/</g, '');
  const { surname, givenNames, fullName } = namesFromField(l3);

  // Same guard as TD3: no valid dates → not an MRZ.
  if (!dateOfBirth && !expiryDate) return null;

  const joined = raw1 + l2 + l3;
  const emiratesId = extractEmiratesIdNumber(joined) ?? extractEmiratesIdNumber(line1 + line2 + line3);
  const isUae =
    issuingCountry === 'ARE' ||
    Boolean(emiratesId) ||
    /UAE|EMIRATES|IDENTITY|784/.test(joined);

  return {
    kind: isUae ? 'emirates_id' : 'unknown',
    fullName,
    givenNames,
    surname,
    // Prefer the 784-… identity number people recognize; keep card # as optional.
    documentNumber: emiratesId || cardNumber,
    nationality,
    dateOfBirth,
    sex,
    expiryDate,
    issuingCountry,
    optionalData: cardNumber && emiratesId ? `Card ${cardNumber}` : l1.slice(15).replace(/</g, ' ').trim(),
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

  const td1Pick = pickTd1Lines(lines);
  if (td1Pick) {
    const parsed = parseTd1Id(td1Pick[0], td1Pick[1], td1Pick[2]);
    if (parsed) return parsed;
  }

  if (lines.length >= 3) {
    const td1 = lines.filter((l) => l.length >= 28 && l.length <= 40).slice(0, 3);
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

function looksLikeReceiptNotId(t: string, original: string): boolean {
  return (
    /\b(TAX\s*INVOICE|INVOICE|RECEIPT|SUBTOTAL|GRAND\s*TOTAL)\b/.test(t) ||
    (/\bTOTAL\b/.test(t) && /\bVAT\b/.test(t)) ||
    /\b(AED|USD|EUR)\s*[\d,]+\.\d{2}\b/.test(original)
  );
}

/** UAE Emirates ID number: 784-YYYY-XXXXXXX-C (hyphens optional / OCR-noisy). */
export function extractEmiratesIdNumber(text: string): string | undefined {
  // Front of card has separators; MRZ embeds 15 digits with no hyphens and
  // often no word boundary (…0019784…), so allow a bare 784############ run.
  const m =
    text.match(/\b784[\s\-–—]?\d{4}[\s\-–—]?\d{7}[\s\-–—]?\d\b/) ||
    text.match(/784\d{12}/);
  if (!m) return undefined;
  const digits = m[0].replace(/\D/g, '');
  if (digits.length !== 15 || !digits.startsWith('784')) return undefined;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
}

function extractLicenceNumber(text: string): string | undefined {
  const labeled = text.match(
    /(?:licen[cs]e|permit|رخصة)\s*(?:no\.?|number|#)?[\s#:.\-]*([A-Z0-9]*\d[A-Z0-9\-\/]{3,18})/i
  );
  if (labeled?.[1] && !/^(NO|NUMBER|LICEN[CS]E|DRIVING)$/i.test(labeled[1])) {
    return labeled[1].toUpperCase();
  }
  const dl = text.match(/\bDL[\s#:.\-]*([A-Z0-9]*\d[A-Z0-9]{3,15})\b/i);
  if (dl?.[1]) return dl[1].toUpperCase();
  return undefined;
}

/** Keyword / pattern fallback when MRZ is unreadable — still on-device, no AI. */
export function classifyDocumentFromText(text: string): MrzDocumentKind {
  const t = text.toUpperCase();
  // Receipts beat weak doc heuristics — "PB No" on UAE invoices used to
  // match the old `\nP[A-Z]` passport sniff and mis-file groceries as Passport.
  if (looksLikeReceiptNotId(t, text)) {
    return 'unknown';
  }

  // Emirates ID: number pattern is strongest (works on front of card).
  if (extractEmiratesIdNumber(text)) return 'emirates_id';

  if (
    /EMIRATES\s*ID|هوية|RESIDENT\s+IDENTITY\s+CARD|RESIDENC(?:Y|E)\s*CARD|IDENTITY\s*CARD|ID\s*CARD|FEDERAL\s+AUTHORITY\s+FOR\s+IDENTITY/.test(
      t
    ) ||
    (/UNITED\s*ARAB\s*EMIRATES|U\.?A\.?E\.?|الإمارات/.test(t) &&
      /\b(ID|IDENTITY|هوية|RESIDENC|RESIDENT)/.test(t))
  ) {
    return 'emirates_id';
  }

  // UAE driving licence uses American "License" spelling on the card.
  if (
    /DRIVING\s*LICEN[CS]E|DRIVER'?S?\s*LICEN[CS]E|رخصة\s*قيادة|LICEN[CS]E\s*TO\s*DRIVE|LICENSING\s*AUTHORITY|TRAFFIC\s*CODE\s*NO/.test(
      t
    ) ||
    (/\bLICEN[CS]E\b/.test(t) &&
      /(DRIV|MOTOR|VEHICLE|TRANSPORT|ROA?D|TRAFFIC|رخصة|AUTHORITY)/.test(t))
  ) {
    return 'driving_licence';
  }

  if (/PASSPORT|PASSEPORT|جواز/.test(t)) return 'passport';
  if (/\bVISA\b|تأشيرة/.test(t) && !/\bCREDIT\b/.test(t)) return 'unknown'; // keep as generic doc via capture heuristics later
  return 'unknown';
}

/**
 * Pull whatever fields we can from front-side OCR when MRZ failed.
 * Tuned for UAE Resident Identity Card + UAE Driving License layouts.
 */
export function extractDocumentFieldHints(text: string): DocumentFieldHints | null {
  const kind = classifyDocumentFromText(text);
  if (kind === 'unknown') return null;

  const hints: DocumentFieldHints = { kind };

  if (kind === 'emirates_id') {
    const id = extractEmiratesIdNumber(text);
    if (id) hints.documentNumber = id;
  }
  if (kind === 'driving_licence') {
    const lic = extractLicenceNumber(text);
    if (lic) hints.documentNumber = lic;
  }

  // ID Number: / License No.: / Name: — labels as printed on UAE cards
  const nameLine = text.match(
    /(?:^|\n)\s*(?:name|الاسم|full\s*name|holder)\s*[:：]?\s*([A-Za-z][A-Za-z '. -]{2,60})/im
  );
  if (nameLine?.[1]) {
    const cleaned = nameLine[1].replace(/[ \t]+/g, ' ').trim();
    if (
      cleaned.length >= 3 &&
      !/^(CARD|ID|LICEN[CS]E|DRIVING|NATIONALITY|DATE)$/i.test(cleaned)
    ) {
      hints.fullName = cleaned;
    }
  }

  const expiry = text.match(
    /(?:expir(?:y|es|ation)\s*date|expir(?:y|es|ation)|valid\s*(?:until|thru|to)|تاريخ\s*الانتهاء)\s*[:：]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i
  );
  if (expiry?.[1]) {
    hints.expiryDate = normalizeLooseDate(expiry[1]);
  }

  const dob = text.match(
    /(?:date\s*of\s*birth|d\.?o\.?b\.?|birth|تاريخ\s*الميلاد)\s*[:：]?\s*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4})/i
  );
  if (dob?.[1]) {
    hints.dateOfBirth = normalizeLooseDate(dob[1]);
  }

  const nat = text.match(
    /(?:nationality|الجنسية)\s*[:：]?\s*([A-Za-z][A-Za-z ]{1,40})/i
  );
  if (nat?.[1]) {
    const cleaned = nat[1].replace(/[ \t]+/g, ' ').trim();
    // Stop before the next English field label if OCR joined lines.
    const cut = cleaned.replace(
      /\s+(Date|Expiry|Sex|Issuing|Place|License|Licence|ID)\b.*$/i,
      ''
    );
    if (cut.length >= 2 && !/^(DATE|SEX|NAME)$/i.test(cut)) {
      hints.nationality = cut;
    }
  }

  return hints;
}

function normalizeLooseDate(raw: string): string {
  const parts = raw.split(/[\/.\-]/).map((p) => p.trim());
  if (parts.length !== 3) return '';
  let [a, b, c] = parts;
  if (c.length === 2) c = (Number(c) <= 30 ? '20' : '19') + c;
  // Prefer DD/MM/YYYY (UAE / most ID cards) when day-like first part
  const d = Number(a);
  const m = Number(b);
  if (d >= 1 && d <= 31 && m >= 1 && m <= 12 && c.length === 4) {
    return `${c}-${b.padStart(2, '0')}-${a.padStart(2, '0')}`;
  }
  // Fallback MM/DD/YYYY
  if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && c.length === 4) {
    return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
  }
  return '';
}

export function labelDocumentKind(kind: MrzDocumentKind): string {
  if (kind === 'passport') return 'Passport';
  if (kind === 'emirates_id') return 'Emirates ID';
  if (kind === 'driving_licence') return 'Driving licence';
  return 'Document';
}

export function isIdentityDocumentKind(kind?: string): boolean {
  return kind === 'passport' || kind === 'emirates_id' || kind === 'driving_licence';
}
