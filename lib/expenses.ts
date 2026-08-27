import { localDayKey } from '@/lib/dates';
import type { Icon3DName } from '@/components/ui/Icon3D';
import { getRuntimeDefaultCurrency } from '@/lib/currency';

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'home'
  | 'shopping'
  | 'health'
  | 'travel'
  | 'bills'
  | 'entertainment'
  | 'other';

export type Expense = {
  id: string;
  /** Merchant or short description */
  title: string;
  /** Amount in minor units avoided — store major units as number */
  amount: number;
  currency: string;
  category: ExpenseCategory;
  /** YYYY-MM-DD */
  date: string;
  merchant?: string;
  note?: string;
  /** Local receipt image URI */
  receiptUri?: string;
  /** POS slip / transaction id from OCR — used to block re-scans */
  receiptRef?: string;
  /** Optional link to a Thing */
  inventoryItemId?: string;
  personId?: string;
  source?: 'manual' | 'talk' | 'capture' | 'apple_pay';
  createdAt: string;
};

export type NewExpenseInput = {
  title: string;
  amount: number;
  currency?: string;
  category?: ExpenseCategory;
  date?: string;
  merchant?: string;
  note?: string;
  receiptUri?: string;
  receiptRef?: string;
  inventoryItemId?: string;
  personId?: string;
  source?: Expense['source'];
  id?: string;
};

export const EXPENSE_CATEGORIES: {
  id: ExpenseCategory;
  label: string;
  icon: Icon3DName;
}[] = [
  { id: 'food', label: 'Food', icon: 'coffee' },
  { id: 'transport', label: 'Transport', icon: 'car' },
  { id: 'home', label: 'Home', icon: 'house' },
  { id: 'shopping', label: 'Shopping', icon: 'package' },
  { id: 'health', label: 'Health', icon: 'medical' },
  { id: 'travel', label: 'Travel', icon: 'passport' },
  { id: 'bills', label: 'Bills', icon: 'credit' },
  { id: 'entertainment', label: 'Fun', icon: 'tv' },
  { id: 'other', label: 'Other', icon: 'ledger' },
];

export function iconForCategory(category: ExpenseCategory): Icon3DName {
  return EXPENSE_CATEGORIES.find((c) => c.id === category)?.icon ?? 'ledger';
}

export function labelForCategory(category: ExpenseCategory): string {
  return EXPENSE_CATEGORIES.find((c) => c.id === category)?.label ?? 'Other';
}

/** Parse "AED 45.50", "45.5", "1,299" → number or NaN */
export function parseAmount(raw: string | number | undefined | null): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
  if (!raw) return NaN;
  const cleaned = String(raw).replace(/[^\d.,-]/g, '').replace(/,/g, '');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

export function formatAmount(
  amount: number,
  currency?: string,
  locale?: string
): string {
  const cur =
    (currency && currency.trim().toUpperCase()) ||
    getRuntimeDefaultCurrency();
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}

export function monthKey(dateIso: string): string {
  return dateIso.slice(0, 7);
}

export function currentMonthKey(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function createExpense(input: NewExpenseInput): Expense {
  const today = localDayKey();
  const title = input.title.trim() || input.merchant?.trim() || 'Expense';
  return {
    id: input.id ?? `exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    amount: input.amount,
    currency: (input.currency || getRuntimeDefaultCurrency()).toUpperCase(),
    category: input.category || 'other',
    date: input.date || today,
    merchant: input.merchant?.trim() || undefined,
    note: input.note?.trim() || undefined,
    receiptUri: input.receiptUri,
    receiptRef: input.receiptRef?.trim() || undefined,
    inventoryItemId: input.inventoryItemId,
    personId: input.personId,
    source: input.source || 'manual',
    createdAt: new Date().toISOString(),
  };
}

/** Lowercase alphanumeric merchant key for fuzzy receipt matching. */
export function normalizeMerchantKey(raw: string | undefined): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\s+purchase$/i, '')
    .replace(/[^a-z0-9]/g, '');
}

/** Same receipt → treat as duplicate (capture re-scans, Talk retries). */
export function findDuplicateExpense(
  list: Expense[],
  input: Pick<
    NewExpenseInput,
    'title' | 'amount' | 'date' | 'currency' | 'merchant' | 'receiptRef'
  >
): Expense | undefined {
  const ref = (input.receiptRef || '').trim();
  if (ref) {
    const byRef = list.find((e) => e.receiptRef === ref);
    if (byRef) return byRef;
  }

  const date = (input.date || localDayKey()).slice(0, 10);
  const currency = input.currency?.trim().toUpperCase();
  const amount = Number(input.amount);
  if (!Number.isFinite(amount)) return undefined;

  const merchantKey = normalizeMerchantKey(input.merchant);
  if (merchantKey) {
    const byMerchant = list.find(
      (e) =>
        normalizeMerchantKey(e.merchant || e.title) === merchantKey &&
        e.date.slice(0, 10) === date &&
        Math.abs(e.amount - amount) < 0.005 &&
        (!currency || e.currency.toUpperCase() === currency)
    );
    if (byMerchant) return byMerchant;
  }

  const title = (input.title || '').trim().toLowerCase();
  if (!title) return undefined;
  return list.find(
    (e) =>
      e.title.trim().toLowerCase() === title &&
      e.date.slice(0, 10) === date &&
      Math.abs(e.amount - amount) < 0.005 &&
      (!currency || e.currency.toUpperCase() === currency)
  );
}

export function sumExpenses(list: Expense[]): number {
  return list.reduce((n, e) => n + (Number.isFinite(e.amount) ? e.amount : 0), 0);
}

/** Heuristic category from title/merchant/OCR blob. */
export function guessExpenseCategory(text: string): ExpenseCategory {
  const t = text.toLowerCase();
  if (/grocery|groceries|carrefour|spinneys|waiter|restaurant|cafe|coffee|starbucks|food|lunch|dinner|breakfast/.test(t))
    return 'food';
  if (/uber|careem|taxi|petrol|fuel|parking|metro|rta|transport/.test(t)) return 'transport';
  if (/pharmacy|hospital|clinic|doctor|medical|health/.test(t)) return 'health';
  if (/hotel|airline|flight|booking|travel|visa/.test(t)) return 'travel';
  if (/dewa|etisalat|du\b|internet|electric|water|bill|rent/.test(t)) return 'bills';
  if (/cinema|movie|netflix|game|entertainment/.test(t)) return 'entertainment';
  if (/ikea|home|furniture|ace hardware/.test(t)) return 'home';
  if (/amazon|noon|mall|shop|retail|zara|nike/.test(t)) return 'shopping';
  return 'other';
}

export function expensesInMonth(list: Expense[], key: string): Expense[] {
  return list.filter((e) => monthKey(e.date) === key);
}

export function totalsByCategory(
  list: Expense[]
): Array<{ category: ExpenseCategory; total: number }> {
  const map = new Map<ExpenseCategory, number>();
  for (const e of list) {
    map.set(e.category, (map.get(e.category) || 0) + e.amount);
  }
  return [...map.entries()]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total);
}

export function normalizeExpense(raw: unknown): Expense | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<Expense>;
  if (!o.id || !o.title || typeof o.amount !== 'number') return null;
  return {
    id: o.id,
    title: String(o.title),
    amount: o.amount,
    currency: (o.currency || getRuntimeDefaultCurrency()).toUpperCase(),
    category: (o.category as ExpenseCategory) || 'other',
    date: o.date || o.createdAt?.slice(0, 10) || localDayKey(),
    merchant: o.merchant,
    note: o.note,
    receiptUri: o.receiptUri,
    receiptRef: o.receiptRef,
    inventoryItemId: o.inventoryItemId,
    personId: o.personId,
    source: o.source || 'manual',
    createdAt: o.createdAt || new Date().toISOString(),
  };
}
