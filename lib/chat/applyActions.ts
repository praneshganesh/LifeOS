import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import { formatMoney, formatPurchasedFrom, merchantFromUtterance } from '@/lib/chat/prompt';
import { sanitizeManualUrl } from '@/lib/manualLink';
import { timelineAfterMaintenance } from '@/lib/maintenanceLink';
import {
  avatarLetterFromName,
  type HouseholdMember,
  type NewHouseholdMemberInput,
} from '@/lib/household';
import {
  parseAmount,
  type ExpenseCategory,
  type NewExpenseInput,
} from '@/lib/expenses';
import type { Habit, NewHabitInput } from '@/lib/habits';
import { currentStreak, dayKey, loggedOn, shouldSyncLastDone } from '@/lib/habits';
import {
  adjustCompletedCount,
  classCompletedCountFromUtterance,
  classDeadlineFromUtterance,
  classPackFromUtterance,
  classScheduleDaysFromUtterance,
  classScheduleTimeFromUtterance,
  classTitleFromUtterance,
  looksLikeClassAttendance,
  looksLikeClassEnrollment,
  normalizeScheduleDays,
  pickAttendancePack,
  remainingCount,
  usedCount,
  type ClassPack,
  type NewClassPackInput,
} from '@/lib/classes';
import {
  normalizeSubscriptionCategory,
  normalizeSubscriptionCycle,
  type NewSubscriptionInput,
  type Subscription,
} from '@/lib/subscriptions';
import { fuzzyMatchMember, resolveAssignment } from '@/lib/people';
import {
  currencyFromSpokenText,
  getRuntimeDefaultCurrency,
} from '@/lib/currency';
import type { ChatAction, ChatAddAction, ChatAgentResponse, ChatUpdateAction } from '@/lib/chat/types';
import {
  looksLikeVagueDelete,
  talkFocusKindFromUtterance,
  type TalkFocus,
} from '@/lib/chat/focus';
import {
  looksLikeReminder,
  normalizeWarrantyExpiry,
  remindAtFromUtterance,
  parseReminderFromUtterance,
  parseRecurringWeekdayReminder,
  finalizeReminderLabel,
  reminderLabelFromUtterance,
  warrantyExpiryFromUtterance,
} from '@/lib/dates';

type InventoryApi = {
  addItem: (
    item: Omit<InventoryItem, 'id' | 'createdAt'> & { id?: string }
  ) => Promise<InventoryItem>;
  updateItem: (id: string, patch: Partial<InventoryItem>) => Promise<void>;
  removeItem: (id: string) => Promise<void>;
};

type LastDoneApi = {
  logDone: (input: {
    label?: string;
    id?: string;
    doneAt?: string;
    inventoryItemId?: string | null;
    personId?: string | null;
    assignedTo?: string | null;
  }) => Promise<{
    id: string;
    label: string;
    inventoryItemId?: string;
    logs?: { doneAt: string }[];
  }>;
  setReminder?: (input: {
    label: string;
    remindAt: string;
    notes?: string;
    remindInterval?: {
      value: number;
      unit: 'days' | 'months' | 'weekdays';
      weekdays?: number[];
      hour?: number;
      minute?: number;
      endsAt?: string;
    };
    inventoryItemId?: string | null;
    personId?: string | null;
    assignedTo?: string | null;
  }) => Promise<{
    id: string;
    label: string;
    remindAt?: string;
    inventoryItemId?: string;
  }>;
  remove?: (id: string) => Promise<void>;
};

type ExpensesApi = {
  addExpense: (input: NewExpenseInput) => Promise<{
    id: string;
    title: string;
    amount: number;
    merchant?: string;
  }>;
  updateExpense: (
    id: string,
    patch: Partial<{
      title: string;
      amount: number;
      currency: string;
      category: ExpenseCategory;
      date: string;
      merchant: string;
      note: string;
    }>
  ) => Promise<void>;
  removeExpense?: (id: string) => Promise<void>;
  getById?: (id: string) =>
    | { id: string; title: string; amount: number; merchant?: string }
    | undefined;
};

type SubscriptionsApi = {
  addSubscription: (
    input: NewSubscriptionInput
  ) => Promise<{ id: string; title: string; amount: number; currency: string; cycle: string }>;
  updateSubscription?: (id: string, patch: Partial<Subscription>) => Promise<void>;
  removeSubscription?: (id: string) => Promise<void>;
  getById?: (id: string) => { id: string; title: string; amount: number } | undefined;
};

type HabitsApi = {
  addHabit: (input: NewHabitInput) => Promise<Habit>;
  updateHabit?: (id: string, patch: Partial<Habit>) => Promise<void>;
  removeHabit?: (id: string) => Promise<void>;
  checkIn: (id: string, date?: string) => Promise<Habit | null>;
  findByTitle: (title: string, personId?: string) => Habit | undefined;
  getById: (id: string) => Habit | undefined;
};

type ClassesApi = {
  addPack: (input: NewClassPackInput) => Promise<ClassPack>;
  logClass: (id: string, date?: string) => Promise<ClassPack | null>;
  findPack: (title: string, personId?: string) => ClassPack | undefined;
  getById: (id: string) => ClassPack | undefined;
  removePack?: (id: string) => Promise<void>;
  pickAttendance?: (opts: {
    title?: string;
    personId?: string;
  }) => ClassPack | undefined;
  newestPack?: () => ClassPack | undefined;
  updatePack?: (id: string, patch: Partial<ClassPack>) => Promise<void>;
};

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'food',
  'transport',
  'home',
  'shopping',
  'health',
  'travel',
  'bills',
  'entertainment',
  'other',
];

function normalizeExpenseCategory(raw?: string): ExpenseCategory {
  const key = (raw || '').trim().toLowerCase();
  if (EXPENSE_CATEGORIES.includes(key as ExpenseCategory)) {
    return key as ExpenseCategory;
  }
  if (/food|grocery|coffee|restaurant|cafe/.test(key)) return 'food';
  if (/transport|uber|taxi|petrol|fuel|parking/.test(key)) return 'transport';
  if (/home|rent|furniture|utility/.test(key)) return 'home';
  if (/shop|amazon|clothes|retail/.test(key)) return 'shopping';
  if (/health|medical|pharmacy|doctor/.test(key)) return 'health';
  if (/travel|hotel|flight|airline/.test(key)) return 'travel';
  if (/bill|electric|water|internet|phone|subscription/.test(key)) return 'bills';
  if (/fun|movie|game|entertainment/.test(key)) return 'entertainment';
  return 'other';
}

function currencyFromAmountRaw(raw: string | number | undefined): string | undefined {
  return currencyFromSpokenText(raw);
}

function resolveActionCurrency(
  explicit: string | undefined,
  amountRaw: string | number | undefined,
  utterance: string | undefined,
  fallback: string
): string {
  const fromAction = explicit?.trim().toUpperCase();
  if (fromAction && /^[A-Z]{3}$/.test(fromAction)) return fromAction;
  return (
    currencyFromSpokenText(amountRaw) ||
    currencyFromSpokenText(utterance) ||
    fallback
  );
}

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export function isIsoDate(value: unknown): boolean {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return false;
  }
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Accept valid YYYY-MM-DD or parseable dates; reject junk and impossible calendar dates. */
export function normalizeDateField(raw: string): string | undefined {
  const s = raw.trim();
  if (!s || s === '—' || s === '-') return undefined;
  const isoMatch = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) {
    return isIsoDate(isoMatch[1]) ? isoMatch[1] : undefined;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const key = dayKey(d);
    return isIsoDate(key) ? key : undefined;
  }
  return undefined;
}

/**
 * Condition is unknown unless the user actually stated it.
 * "I got a new MacBook" is purchase recency — not "New" / "Good".
 */
function resolveCondition(
  raw?: string | null,
  utterance?: string
): string {
  const c = raw?.trim();
  if (!c || c === '—' || c === '-') return '—';
  const mentioned = /\b(condition|used|second[\s-]?hand|refurbished|excellent|fair|poor|mint|brand[\s-]?new)\b/i.test(
    utterance || ''
  );
  if (!mentioned && /^(good|new)$/i.test(c)) return '—';
  return titleCase(c);
}

/** Category/icon defaults when the model omits them — not brand correction.
 *  Everything lives in one Things pool (s1). Vehicles/docs are categories. */
function inferMeta(text: string): {
  category: string;
  room: string;
  spaceId: string;
  icon: Icon3DName;
  isDocument: boolean;
} {
  const t = text.toLowerCase();
  if (/\b(passport|visa|emirates|eid|licence|license|deed|will)\b/.test(t)) {
    return {
      category: 'Documents',
      room: '—',
      spaceId: 's1',
      icon: 'document',
      isDocument: true,
    };
  }
  if (/\b(car|vehicle|prado|toyota|bmw|tyre|tire|tesla)\b/.test(t)) {
    return { category: 'Vehicle', room: '—', spaceId: 's1', icon: 'car', isDocument: false };
  }
  if (/\b(coffee|espresso|barista|fridge|dishwasher|microwave|oven)\b/.test(t)) {
    return {
      category: 'Appliances',
      room: '—',
      spaceId: 's1',
      icon: /\bfridge|refrigerator\b/.test(t) ? 'fridge' : 'coffee',
      isDocument: false,
    };
  }
  if (/\b(tv|television|laptop|macbook|iphone|phone|headphones|watch|ipad|tablet)\b/.test(t)) {
    return {
      category: 'Electronics',
      room: '—',
      spaceId: 's1',
      icon: /\b(tv|television)\b/.test(t) ? 'tv' : 'laptop',
      isDocument: false,
    };
  }
  if (/\b(washer|washing|vacuum|utility)\b/.test(t)) {
    return { category: 'Home', room: '—', spaceId: 's1', icon: 'washing', isDocument: false };
  }
  return { category: 'Home', room: '—', spaceId: 's1', icon: 'package', isDocument: false };
}

function addActionToInput(
  action: ChatAddAction,
  source: InventoryItem['source'],
  lastUserText?: string,
  household: HouseholdMember[] = [],
  todayAnchor?: string
): Omit<InventoryItem, 'id' | 'createdAt'> {
  const name = titleCase(action.name.trim());
  const blob = `${name} ${action.category || ''} ${action.room || ''}`;
  const inferred = inferMeta(blob);
  const today = isIsoDate(todayAnchor) ? (todayAnchor as string) : dayKey();
  const label = new Date(`${today}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const brand = action.brand?.trim() ? titleCase(action.brand.trim()) : 'Unknown';
  let category = action.category?.trim() || inferred.category;
  let room = action.room?.trim() || inferred.room;
  const spaceId = 's1';

  // Never park laptops/phones as documents
  if (
    !inferred.isDocument &&
    category !== 'Documents' &&
    /personal documents/i.test(room)
  ) {
    room = '—';
  }

  const person = resolveAssignment({
    assignedTo: action.assignedTo,
    personId: action.personId,
    utterance: lastUserText,
    members: household,
  });

  // Who tags ownership; it does not move the Thing into a "Family space".
  if (person) {
    // keep room as-is (usually unused in the new model)
  }

  const price = formatMoney(action.price) || '—';
  const purchasedFrom = formatPurchasedFrom(action.purchasedFrom);
  const manualUrl = sanitizeManualUrl(action.manualUrl);
  // "until next december" is deterministic on-device — when the user spoke a
  // relative phrase, trust our parse over the model's date (models tend to
  // read "next december" as the nearest one).
  const spokenWarranty = warrantyExpiryFromUtterance(lastUserText);
  const spokeRelative =
    /\b(?:until|till|through|to)\s+next\b|\bnext\s+year\b/i.test(lastUserText ?? '');
  const warrantyExpiry =
    (spokeRelative ? spokenWarranty : undefined) ||
    normalizeWarrantyExpiry(action.warrantyExpiry) ||
    spokenWarranty ||
    '—';
  const warrantyActive = warrantyExpiry !== '—';
  const condition = resolveCondition(action.condition, lastUserText);
  const viaBits = [
    'Added via Chat',
    category,
    person?.assignedTo ? `for ${person.assignedTo}` : null,
    purchasedFrom ? `from ${purchasedFrom}` : null,
    price !== '—' ? price : null,
    warrantyActive ? `warranty ${warrantyExpiry}` : null,
  ].filter(Boolean);

  return {
    name,
    brand,
    category,
    room,
    spaceId,
    icon: inferred.icon,
    purchaseDate: today,
    price,
    purchasedFrom,
    manualUrl,
    assignedTo: person?.assignedTo,
    personId: person?.personId,
    warrantyExpiry,
    warrantyActive,
    condition,
    serial: '—',
    estimatedValue: price !== '—' ? price : '—',
    insight: viaBits.join(' · '),
    timeline: [
      {
        date: label,
        event: person?.assignedTo
          ? `Added via Chat · for ${person.assignedTo}`
          : purchasedFrom
            ? `Added via Chat · bought at ${purchasedFrom}`
            : 'Added via Chat',
      },
    ],
    isDocument: inferred.isDocument,
    ocrOnDevice: false,
    source,
  };
}

export type ApplyActionsResult = {
  lastAddedId: string | null;
  lastAddedName: string | null;
  lastAssignedTo: string | null;
  removedIds: string[];
  removedNames: string[];
  updatedIds: string[];
  openItemId: string | null;
  /** Expense to open this turn (show/open after spend — not a Thing). */
  openExpenseId: string | null;
  /** Any module to open this turn — Talk/Ask navigate from this. */
  openTarget: TalkFocus | null;
  /** Best item to treat as conversation focus after this turn */
  focusItemId: string | null;
  /** Last expense logged this turn — session focus for “show it”. */
  loggedExpenseId: string | null;
  /** Last module mutated this turn — session focus for show/update/delete. */
  talkFocus: TalkFocus | null;
  /** True when focus item was deleted this turn */
  clearedFocus: boolean;
  loggedDoneLabel: string | null;
  loggedExpenseTitle: string | null;
  loggedExpenseAmount: string | null;
  loggedExpenseMerchant: string | null;
  /** Existing expense was patched this turn (not a new log). */
  updatedExpense: boolean;
  loggedSubscriptionTitle: string | null;
  loggedSubscriptionAmount: string | null;
  updatedSubscription: boolean;
  removedExpenseTitle: string | null;
  removedSubscriptionTitle: string | null;
  removedHabitTitle: string | null;
  removedClassTitle: string | null;
  habitCheckInTitle: string | null;
  habitStreak: number | null;
  /** Distinct days marked in this turn (for natural multi-day replies). */
  habitCheckInDays: number;
  classPackTitle: string | null;
  classPackRemaining: number | null;
  classPackTotal: number | null;
  classPackScheduleTimeInferred?: boolean;
  classLoggedTitle: string | null;
  classLogAttemptFor: string | null;
  reminderLabel: string | null;
  reminderAt: string | null;
  removedLastDoneLabel: string | null;
  updatedClassPack: boolean;
  renamedPersonFrom: string | null;
  renamedPersonTo: string | null;
};

/**
 * Execute model-proposed actions against on-device inventory.
 * Name/brand come from the model as-is (aside from light title-case).
 */
export async function applyChatActions(
  actions: ChatAction[] | undefined,
  api: InventoryApi,
  source: InventoryItem['source'] = 'talk',
  options?: {
    fallbackFocusId?: string | null;
    resolveItem?: (id: string) => InventoryItem | undefined;
    lastUserText?: string;
    lastDone?: LastDoneApi;
    household?: HouseholdMember[];
    /** When set, a spoken name that isn't a member yet is created on the fly. */
    people?: {
      addMember: (input: NewHouseholdMemberInput) => Promise<HouseholdMember>;
      updateMember?: (id: string, patch: Partial<HouseholdMember>) => Promise<void>;
    };
    expenses?: ExpensesApi;
    subscriptions?: SubscriptionsApi;
    habits?: HabitsApi;
    classes?: ClassesApi;
    inventoryList?: { id: string; name: string }[];
    expensesList?: { id: string; title: string; merchant?: string }[];
    subscriptionsList?: { id: string; title: string }[];
    habitsList?: { id: string; title: string }[];
    classPacksList?: { id: string; title: string }[];
    lastDoneList?: { id: string; label: string }[];
    /** Prior-turn expense so “show it” opens juice, not the old TV. */
    lastFocusExpenseId?: string | null;
    /** Last module Talk touched — vague show/delete/update uses this. */
    lastTalkFocus?: TalkFocus | null;
    /** Household default ISO currency (from profile / onboarding). */
    defaultCurrency?: string;
    /** User's local calendar date (YYYY-MM-DD). */
    localDate?: string;
  }
): Promise<ApplyActionsResult> {
  const today = isIsoDate(options?.localDate)
    ? (options!.localDate as string)
    : dayKey();
  const defaultCurrency =
    options?.defaultCurrency?.trim().toUpperCase() ||
    getRuntimeDefaultCurrency();
  let lastAddedId: string | null = null;
  let lastAddedName: string | null = null;
  let lastAssignedTo: string | null = null;
  const removedIds: string[] = [];
  const removedNames: string[] = [];
  const updatedIds: string[] = [];
  let openItemId: string | null = null;
  let openExpenseId: string | null = null;
  let openTarget: TalkFocus | null = null;
  let focusItemId: string | null = null;
  let talkFocus: TalkFocus | null =
    options?.lastTalkFocus ??
    (options?.lastFocusExpenseId
      ? { kind: 'expense', id: options.lastFocusExpenseId }
      : null);
  let clearedFocus = false;
  let loggedDoneLabel: string | null = null;
  let loggedExpenseId: string | null = null;
  let loggedExpenseTitle: string | null = null;
  let loggedExpenseAmount: string | null = null;
  let loggedExpenseMerchant: string | null = null;
  let updatedExpense = false;
  let loggedSubscriptionTitle: string | null = null;
  let loggedSubscriptionAmount: string | null = null;
  let updatedSubscription = false;
  let removedExpenseTitle: string | null = null;
  let removedSubscriptionTitle: string | null = null;
  let removedHabitTitle: string | null = null;
  let removedClassTitle: string | null = null;
  let habitCheckInTitle: string | null = null;
  let habitStreak: number | null = null;
  const habitCheckInDateSet = new Set<string>();
  let classPackTitle: string | null = null;
  let classPackRemaining: number | null = null;
  let classPackTotal: number | null = null;
  let classPackScheduleTimeInferred = false;
  let classLoggedTitle: string | null = null;
  let classLogAttemptFor: string | null = null;
  let reminderLabel: string | null = null;
  let reminderAt: string | null = null;
  let removedLastDoneLabel: string | null = null;
  let updatedClassPack = false;
  let renamedPersonFrom: string | null = null;
  let renamedPersonTo: string | null = null;
  const fallback = options?.fallbackFocusId ?? null;
  const seenRemove = new Set<string>();
  const lastUserText = options?.lastUserText;
  const household = options?.household ?? [];
  const lastExpenseFocus =
    options?.lastTalkFocus?.kind === 'expense'
      ? options.lastTalkFocus.id
      : options?.lastTalkFocus
        ? null
        : options?.lastFocusExpenseId || null;
  const list = ensureTalkActions(Array.isArray(actions) ? actions : [], lastUserText);

  const remember = (kind: TalkFocus['kind'], id?: string | null) => {
    if (!id) return;
    talkFocus = { kind, id };
    if (kind === 'item') focusItemId = id;
    if (kind === 'expense') loggedExpenseId = loggedExpenseId || id;
  };

  /** Spoken name with no member yet → create them instead of mis-assigning. */
  const ensurePerson = async (
    person: ReturnType<typeof resolveAssignment>
  ): Promise<ReturnType<typeof resolveAssignment>> => {
    if (!person || person.personId || !options?.people?.addMember) return person;
    try {
      const member = await options.people.addMember({
        name: person.assignedTo,
        role: 'adult',
        relation: 'Family',
      });
      console.log('[LifeOS chat] created household member', member.id, member.name);
      return { personId: member.id, assignedTo: member.name };
    } catch {
      return person;
    }
  };
  const open = (target: TalkFocus) => {
    openTarget = target;
    talkFocus = target;
    if (target.kind === 'item') {
      openItemId = target.id;
      focusItemId = target.id;
    } else if (target.kind === 'expense') {
      openExpenseId = target.id;
      openItemId = null;
    } else {
      openItemId = null;
    }
  };

  for (const action of list) {
    if (!action || action.type === 'none') continue;
    if (action.type === 'add_item' && action.name?.trim()) {
      const item = await api.addItem(
        addActionToInput(action, source, lastUserText, household, today)
      );
      lastAddedId = item.id;
      lastAddedName = item.name;
      lastAssignedTo = item.assignedTo ?? null;
      remember('item', item.id);
      console.log(
        '[LifeOS chat] applied add_item',
        item.id,
        item.name,
        item.brand,
        item.warrantyActive ? `warranty ${item.warrantyExpiry}` : '',
        item.assignedTo ? `→ ${item.assignedTo}` : ''
      );
      continue;
    }
    if (action.type === 'update_item' && action.id) {
      const existingItem = options?.resolveItem?.(action.id);
      const expensePatch = expensePatchFromItemUpdate(action.patch);
      const expenseTargetId =
        !existingItem && options?.expenses
          ? resolveExpenseUpdateId({
              actionId: action.id,
              lastUserText,
              expensesList: options.expensesList,
              lastFocusExpenseId: lastExpenseFocus,
              getById: options.expenses.getById,
              hasPatch: Object.keys(expensePatch).length > 0,
            })
          : null;

      if (expenseTargetId && options?.expenses?.updateExpense && Object.keys(expensePatch).length) {
        await options.expenses.updateExpense(expenseTargetId, expensePatch);
        const row =
          options.expenses.getById?.(expenseTargetId) ||
          options.expensesList?.find((e) => e.id === expenseTargetId);
        loggedExpenseId = expenseTargetId;
        loggedExpenseTitle = expensePatch.title || row?.title || null;
        if (expensePatch.amount != null) {
          const cur = expensePatch.currency || defaultCurrency;
          loggedExpenseAmount =
            formatMoney(`${cur} ${expensePatch.amount}`) || `${cur} ${expensePatch.amount}`;
        }
        if (expensePatch.merchant) loggedExpenseMerchant = expensePatch.merchant;
        else if (row && 'merchant' in row) loggedExpenseMerchant = row.merchant || null;
        updatedExpense = true;
        remember('expense', expenseTargetId);
        console.log(
          '[LifeOS chat] remapped update_item → update_expense',
          expenseTargetId,
          expensePatch
        );
        continue;
      }

      if (!existingItem && options?.subscriptions?.updateSubscription) {
        const subId =
          (options.subscriptions.getById?.(action.id)
            ? action.id
            : undefined) ||
          idFromTitleList(lastUserText, options.subscriptionsList) ||
          (talkFocus?.kind === 'subscription' ? talkFocus.id : undefined);
        const subPatch: Parameters<
          NonNullable<SubscriptionsApi['updateSubscription']>
        >[1] = {};
        if (expensePatch.amount != null) subPatch.amount = expensePatch.amount;
        if (expensePatch.currency) subPatch.currency = expensePatch.currency;
        if (action.patch?.name?.trim()) subPatch.title = titleCase(action.patch.name);
        if (subId && Object.keys(subPatch).length) {
          await options.subscriptions.updateSubscription(subId, subPatch);
          const row =
            options.subscriptions.getById?.(subId) ||
            options.subscriptionsList?.find((s) => s.id === subId);
          loggedSubscriptionTitle = subPatch.title || row?.title || null;
          if (subPatch.amount != null) {
            const cur = String(subPatch.currency || defaultCurrency);
            loggedSubscriptionAmount =
              formatMoney(`${cur} ${subPatch.amount}`) || `${cur} ${subPatch.amount}`;
          }
          updatedSubscription = true;
          remember('subscription', subId);
          console.log('[LifeOS chat] remapped update_item → update_subscription', subId);
          continue;
        }
      }

      if (!existingItem && options?.classes?.updatePack) {
        const pack =
          options.classes.getById(action.id) ||
          (idFromTitleList(lastUserText, options.classPacksList)
            ? options.classes.getById(
                idFromTitleList(lastUserText, options.classPacksList)!
              )
            : undefined) ||
          (talkFocus?.kind === 'class' ? options.classes.getById(talkFocus.id) : undefined);
        const totalN =
          classTotalFromUtterance(lastUserText) ||
          (action.patch?.price != null ? Math.round(Number(parseAmount(action.patch.price))) : 0);
        if (pack && Number.isFinite(totalN) && totalN > 0) {
          await options.classes.updatePack(pack.id, { total: totalN });
          const next = options.classes.getById(pack.id) || { ...pack, total: totalN };
          classPackTitle = next.title;
          classPackRemaining = remainingCount(next);
          classPackTotal = next.total;
          updatedClassPack = true;
          remember('class', pack.id);
          console.log('[LifeOS chat] remapped update_item → update_class_pack', pack.id);
          continue;
        }
      }

      if (!existingItem && options?.resolveItem) {
        console.log('[LifeOS chat] skip update_item — not in inventory', action.id);
        continue;
      }

      const patch: Partial<InventoryItem> = {};
      if (action.patch?.brand != null && action.patch.brand !== '') {
        patch.brand = titleCase(action.patch.brand);
      }
      if (action.patch?.room != null && action.patch.room !== '') {
        patch.room = action.patch.room.trim();
      }
      if (action.patch?.name != null && action.patch.name !== '') {
        patch.name = titleCase(action.patch.name);
      }
      if (action.patch?.category != null && action.patch.category !== '') {
        patch.category = action.patch.category.trim();
      }
      if (action.patch?.price != null && action.patch.price !== '') {
        patch.price = formatMoney(action.patch.price) || action.patch.price.trim();
      }
      if (action.patch?.purchasedFrom != null && action.patch.purchasedFrom !== '') {
        patch.purchasedFrom =
          formatPurchasedFrom(action.patch.purchasedFrom) ||
          action.patch.purchasedFrom.trim();
      }
      if (action.patch?.purchaseDate != null && action.patch.purchaseDate !== '') {
        const d = normalizeDateField(action.patch.purchaseDate);
        if (d) patch.purchaseDate = d;
      }
      if (action.patch?.warrantyExpiry != null && action.patch.warrantyExpiry !== '') {
        const d =
          normalizeWarrantyExpiry(action.patch.warrantyExpiry) ||
          normalizeDateField(action.patch.warrantyExpiry);
        if (d) {
          patch.warrantyExpiry = d;
          patch.warrantyActive = true;
        }
      }
      if (action.patch?.serial != null && action.patch.serial !== '') {
        patch.serial = action.patch.serial.trim();
      }
      if (action.patch?.manualUrl != null && action.patch.manualUrl !== '') {
        const url = sanitizeManualUrl(action.patch.manualUrl);
        if (url) patch.manualUrl = url;
      }
      if (action.patch?.assignedTo != null && action.patch.assignedTo !== '') {
        patch.assignedTo = action.patch.assignedTo.trim();
      }
      if (action.patch?.personId != null && action.patch.personId !== '') {
        patch.personId = action.patch.personId.trim();
      }
      if (Object.keys(patch).length) {
        await api.updateItem(action.id, patch);
        updatedIds.push(action.id);
        remember('item', action.id);
        console.log('[LifeOS chat] applied update_item', action.id, patch);
      }
      continue;
    }
    if (action.type === 'update_expense' && action.id && options?.expenses?.updateExpense) {
      const patch: Parameters<ExpensesApi['updateExpense']>[1] = {};
      if (action.patch?.title?.trim()) patch.title = titleCase(action.patch.title);
      if (action.patch?.amount != null && action.patch.amount !== '') {
        const amount = parseAmount(action.patch.amount);
        if (Number.isFinite(amount) && amount > 0) patch.amount = amount;
      }
      if (action.patch?.currency?.trim()) {
        patch.currency = action.patch.currency.trim().toUpperCase();
      } else if (action.patch?.amount != null) {
        const cur = currencyFromAmountRaw(action.patch.amount);
        if (cur) patch.currency = cur;
      }
      if (action.patch?.category?.trim()) {
        patch.category = normalizeExpenseCategory(action.patch.category);
      }
      if (action.patch?.date?.trim()) {
        const d = normalizeDateField(action.patch.date);
        if (d) patch.date = d;
      }
      if (action.patch?.merchant != null && action.patch.merchant !== '') {
        patch.merchant =
          formatPurchasedFrom(action.patch.merchant) || action.patch.merchant.trim();
      }
      if (action.patch?.note?.trim()) patch.note = action.patch.note.trim();

      let id = action.id.trim();
      if (!options.expenses.getById?.(id)) {
        id =
          resolveExpenseUpdateId({
            actionId: id,
            lastUserText,
            expensesList: options.expensesList,
            lastFocusExpenseId: lastExpenseFocus,
            getById: options.expenses.getById,
            hasAmountPatch: patch.amount != null,
            hasPatch: Object.keys(patch).length > 0,
          }) || id;
      }
      if (!Object.keys(patch).length) {
        console.log('[LifeOS chat] skip update_expense — empty patch');
        continue;
      }
      if (options.expenses.getById && !options.expenses.getById(id)) {
        console.log('[LifeOS chat] skip update_expense — not found', id);
        continue;
      }
      await options.expenses.updateExpense(id, patch);
      const row = options.expenses.getById?.(id);
      loggedExpenseId = id;
      loggedExpenseTitle = patch.title || row?.title || null;
      if (patch.amount != null) {
        const cur = patch.currency || defaultCurrency;
        loggedExpenseAmount =
          formatMoney(`${cur} ${patch.amount}`) || `${cur} ${patch.amount}`;
      }
      loggedExpenseMerchant = patch.merchant || row?.merchant || null;
      updatedExpense = true;
      remember('expense', id);
      console.log('[LifeOS chat] applied update_expense', id, patch);
      continue;
    }
    if (action.type === 'remove_expense' && options?.expenses?.removeExpense) {
      const id =
        resolveExpenseUpdateId({
          actionId: String(action.id || '').trim(),
          lastUserText: `${lastUserText || ''} ${action.title || ''}`,
          expensesList: options.expensesList,
          lastFocusExpenseId: lastExpenseFocus,
          getById: options.expenses.getById,
          hasPatch: true,
        }) || String(action.id || '').trim();
      const row =
        options.expenses.getById?.(id) ||
        options.expensesList?.find((e) => e.id === id);
      if (!id || (!row && options.expenses.getById)) {
        console.log('[LifeOS chat] skip remove_expense — not found', action.id);
        continue;
      }
      await options.expenses.removeExpense(id);
      removedExpenseTitle = row?.title || action.title?.trim() || 'expense';
      if (talkFocus?.kind === 'expense' && talkFocus.id === id) {
        talkFocus = null;
        clearedFocus = true;
      }
      console.log('[LifeOS chat] applied remove_expense', id, removedExpenseTitle);
      continue;
    }
    if (action.type === 'open_expense') {
      const id =
        String(action.id || '').trim() ||
        loggedExpenseId ||
        lastExpenseFocus ||
        expenseIdFromUtterance(lastUserText, options?.expensesList) ||
        '';
      if (id) {
        open({ kind: 'expense', id });
        console.log('[LifeOS chat] open_expense', id);
      } else {
        console.log('[LifeOS chat] skip open_expense — no id');
      }
      continue;
    }
    if (action.type === 'remove_item') {
      const actionId = String(action.id || '').trim();
      if (actionId && seenRemove.has(actionId)) continue;
      if (actionId) seenRemove.add(actionId);
      const existing = actionId ? options?.resolveItem?.(actionId) : undefined;
      if (existing && actionId) {
        await api.removeItem(actionId);
        removedIds.push(actionId);
        removedNames.push(existing.name);
        if (fallback === actionId || talkFocus?.id === actionId) {
          clearedFocus = true;
          focusItemId = null;
          talkFocus = null;
        }
        console.log('[LifeOS chat] applied remove_item', actionId, existing.name);
        continue;
      }
      const expenseHit =
        (actionId
          ? options?.expenses?.getById?.(actionId) ||
            options?.expensesList?.find((e) => e.id === actionId)
          : undefined) ||
        (expenseIdFromUtterance(lastUserText, options?.expensesList)
          ? options?.expensesList?.find(
              (e) => e.id === expenseIdFromUtterance(lastUserText, options?.expensesList)
            )
          : undefined) ||
        (looksLikeVagueDelete(lastUserText) && talkFocus?.kind === 'expense'
          ? options?.expensesList?.find((e) => e.id === talkFocus?.id) ||
            options?.expenses?.getById?.(talkFocus.id)
          : undefined);
      if (expenseHit && options?.expenses?.removeExpense) {
        await options.expenses.removeExpense(expenseHit.id);
        removedExpenseTitle = expenseHit.title;
        if (talkFocus?.id === expenseHit.id) {
          talkFocus = null;
          clearedFocus = true;
        }
        console.log('[LifeOS chat] remapped remove_item → remove_expense', expenseHit.id);
        continue;
      }
      const subHit =
        (actionId
          ? options?.subscriptions?.getById?.(actionId) ||
            options?.subscriptionsList?.find((s) => s.id === actionId)
          : undefined) ||
        (idFromTitleList(lastUserText, options?.subscriptionsList)
          ? options?.subscriptionsList?.find(
              (s) => s.id === idFromTitleList(lastUserText, options?.subscriptionsList)
            )
          : undefined) ||
        (looksLikeVagueDelete(lastUserText) && talkFocus?.kind === 'subscription'
          ? options?.subscriptionsList?.find((s) => s.id === talkFocus?.id) ||
            options?.subscriptions?.getById?.(talkFocus.id)
          : undefined);
      if (subHit && options?.subscriptions?.removeSubscription) {
        await options.subscriptions.removeSubscription(subHit.id);
        removedSubscriptionTitle = subHit.title;
        if (talkFocus?.id === subHit.id) {
          talkFocus = null;
          clearedFocus = true;
        }
        console.log('[LifeOS chat] remapped remove_item → remove_subscription', subHit.id);
        continue;
      }
      const habitHit =
        (actionId ? options?.habits?.getById(actionId) : undefined) ||
        (idFromTitleList(lastUserText, options?.habitsList)
          ? options?.habits?.getById(
              idFromTitleList(lastUserText, options?.habitsList)!
            )
          : undefined) ||
        (looksLikeVagueDelete(lastUserText) && talkFocus?.kind === 'habit'
          ? options?.habits?.getById(talkFocus.id)
          : undefined);
      if (habitHit && options?.habits?.removeHabit) {
        await options.habits.removeHabit(habitHit.id);
        removedHabitTitle = habitHit.title;
        if (talkFocus?.id === habitHit.id) {
          talkFocus = null;
          clearedFocus = true;
        }
        console.log('[LifeOS chat] remapped remove_item → remove_habit', habitHit.id);
        continue;
      }
      const packHit =
        (actionId ? options?.classes?.getById(actionId) : undefined) ||
        (idFromTitleList(lastUserText, options?.classPacksList)
          ? options?.classes?.getById(
              idFromTitleList(lastUserText, options?.classPacksList)!
            )
          : undefined) ||
        (looksLikeVagueDelete(lastUserText) && talkFocus?.kind === 'class'
          ? options?.classes?.getById(talkFocus.id)
          : undefined);
      if (packHit && options?.classes?.removePack) {
        await options.classes.removePack(packHit.id);
        removedClassTitle = packHit.title;
        if (talkFocus?.id === packHit.id) {
          talkFocus = null;
          clearedFocus = true;
        }
        console.log('[LifeOS chat] remapped remove_item → remove_class_pack', packHit.id);
        continue;
      }
      const lastDoneHit =
        (actionId
          ? options?.lastDoneList?.find((d) => d.id === actionId)
          : undefined) ||
        (idFromLabelList(lastUserText, options?.lastDoneList)
          ? options?.lastDoneList?.find(
              (d) => d.id === idFromLabelList(lastUserText, options?.lastDoneList)
            )
          : undefined) ||
        (looksLikeVagueDelete(lastUserText) && talkFocus?.kind === 'lastDone'
          ? options?.lastDoneList?.find((d) => d.id === talkFocus?.id)
          : undefined);
      if (lastDoneHit && options?.lastDone?.remove) {
        await options.lastDone.remove(lastDoneHit.id);
        removedLastDoneLabel = lastDoneHit.label;
        if (talkFocus?.id === lastDoneHit.id) {
          talkFocus = null;
          clearedFocus = true;
        }
        console.log('[LifeOS chat] remapped remove_item → remove_last_done', lastDoneHit.id);
        continue;
      }
      console.log('[LifeOS chat] skip remove_item — not in inventory', actionId);
      continue;
    }
    if (
      action.type === 'open_item' ||
      action.type === 'open_habit' ||
      action.type === 'open_subscription' ||
      action.type === 'open_class' ||
      action.type === 'open_last_done'
    ) {
      const namedThing = inventoryIdFromUtterance(
        lastUserText,
        options?.inventoryList
      );
      const vagueShow = looksLikeShowLast(lastUserText);
      const spokenKind = talkFocusKindFromUtterance(lastUserText);
      const expenseFocus = loggedExpenseId || lastExpenseFocus || null;
      const prior = talkFocus;
      const wantsExpense = looksLikeShowExpense(lastUserText);

      if (namedThing && spokenKind !== 'expense') {
        open({ kind: 'item', id: namedThing });
        console.log('[LifeOS chat] open_item', namedThing, '(named)');
        continue;
      }
      if (wantsExpense && expenseFocus) {
        open({ kind: 'expense', id: expenseFocus });
        console.log('[LifeOS chat] open_expense', expenseFocus);
        continue;
      }
      const kindOpen: TalkFocus | null =
        action.type === 'open_habit' && (action.id || (prior?.kind === 'habit' ? prior.id : ''))
          ? { kind: 'habit', id: String(action.id || prior?.id || '') }
          : action.type === 'open_subscription' &&
              (action.id || (prior?.kind === 'subscription' ? prior.id : ''))
            ? { kind: 'subscription', id: String(action.id || prior?.id || '') }
          : action.type === 'open_class' &&
              (action.id || (prior?.kind === 'class' ? prior.id : ''))
            ? { kind: 'class', id: String(action.id || prior?.id || '') }
          : action.type === 'open_last_done' &&
              (action.id || (prior?.kind === 'lastDone' ? prior.id : ''))
            ? { kind: 'lastDone', id: String(action.id || prior?.id || '') }
            : null;
      if (kindOpen?.id) {
        open(kindOpen);
        console.log('[LifeOS chat] open', kindOpen.kind, kindOpen.id);
        continue;
      }
      if (spokenKind && prior?.kind === spokenKind) {
        open(prior);
        console.log('[LifeOS chat] open last focus', prior.kind, prior.id);
        continue;
      }
      if (spokenKind === 'habit') {
        const hid =
          String(action.id || '').trim() ||
          idFromTitleList(lastUserText, options?.habitsList) ||
          (prior?.kind === 'habit' ? prior.id : '');
        if (hid) {
          open({ kind: 'habit', id: hid });
          continue;
        }
      }
      if (spokenKind === 'subscription') {
        const sid =
          String(action.id || '').trim() ||
          idFromTitleList(lastUserText, options?.subscriptionsList) ||
          (prior?.kind === 'subscription' ? prior.id : '');
        if (sid) {
          open({ kind: 'subscription', id: sid });
          continue;
        }
      }
      if (spokenKind === 'class') {
        const cid =
          String(action.id || '').trim() ||
          idFromTitleList(lastUserText, options?.classPacksList) ||
          (prior?.kind === 'class' ? prior.id : '');
        if (cid) {
          open({ kind: 'class', id: cid });
          continue;
        }
      }
      if (spokenKind === 'lastDone') {
        const lid =
          String(action.id || '').trim() ||
          idFromLabelList(lastUserText, options?.lastDoneList) ||
          (prior?.kind === 'lastDone' ? prior.id : '');
        if (lid) {
          open({ kind: 'lastDone', id: lid });
          continue;
        }
      }
      // Vague “show me / show it” after ANY module → that record, never a stale TV.
      if (vagueShow && !namedThing) {
        if (prior) {
          open(prior);
          console.log('[LifeOS chat] open last talk focus', prior.kind, prior.id);
        } else {
          openItemId = null;
          console.log('[LifeOS chat] vague show — no talk focus');
        }
        continue;
      }
      if (wantsExpense && !namedThing) {
        openItemId = null;
        console.log('[LifeOS chat] open_expense missing — no expense focus');
        continue;
      }
      if (action.type !== 'open_item') {
        console.log('[LifeOS chat] skip open — no id for', action.type);
        continue;
      }
      const id = (namedThing || action.id || (prior?.kind === 'item' ? prior.id : '') || '').trim();
      if (id) {
        open({ kind: 'item', id });
        console.log('[LifeOS chat] open_item', id, action.id ? '' : '(focus)');
      } else {
        console.warn('[LifeOS chat] open_item missing id and no focus fallback');
      }
      continue;
    }
    if (action.type === 'log_done' && action.label?.trim() && options?.lastDone) {
      const label = action.label.trim();
      const inventoryItemId =
        (action.inventoryItemId || fallback || '').trim() || undefined;
      const doneAt = action.doneAt ? normalizeDateField(action.doneAt) : today;
      if (!doneAt) {
        console.log('[LifeOS chat] skip log_done — invalid date', action.doneAt);
        continue;
      }
      const saved = await options.lastDone.logDone({
        label,
        doneAt,
        inventoryItemId: inventoryItemId ?? null,
      });
      loggedDoneLabel = saved.label;
      remember('lastDone', saved.id);
      if (inventoryItemId) {
        const inv = options.resolveItem?.(inventoryItemId);
        if (inv) {
          const doneAt = saved.logs?.[0]?.doneAt || action.doneAt;
          await api.updateItem(inventoryItemId, {
            timeline: timelineAfterMaintenance(inv, saved.label, doneAt),
          });
          focusItemId = inventoryItemId;
        }
      }
      console.log(
        '[LifeOS chat] applied log_done',
        saved.label,
        inventoryItemId ? `→ ${inventoryItemId}` : ''
      );
      continue;
    }
    if (action.type === 'set_reminder' && action.label?.trim() && options?.lastDone?.setReminder) {
      const recurring =
        action.remindInterval?.unit === 'weekdays'
          ? {
              remindAt: action.remindAt,
              remindInterval: action.remindInterval,
            }
          : parseRecurringWeekdayReminder(lastUserText);
      const spokenAt = remindAtFromUtterance(lastUserText);
      const remindAt =
        (recurring?.remindAt
          ? normalizeDateField(recurring.remindAt)
          : undefined) ||
        (action.remindAt ? normalizeDateField(action.remindAt) : undefined) ||
        spokenAt;
      if (!remindAt && !recurring?.remindInterval) {
        console.log('[LifeOS chat] skip set_reminder — no date', action.label);
        continue;
      }
      if (!remindAt) {
        console.log('[LifeOS chat] skip set_reminder — no date', action.label);
        continue;
      }
      const spokenLabel = reminderLabelFromUtterance(lastUserText);
      const parsedReminder = parseReminderFromUtterance(lastUserText);
      const parsedLabel =
        parsedReminder?.label && parsedReminder.label !== 'Reminder'
          ? parsedReminder.label
          : null;
      const label = finalizeReminderLabel(
        parsedLabel || spokenLabel || action.label
      );
      const notes = parsedReminder?.notes?.trim() || action.note?.trim();
      const remindInterval =
        recurring?.remindInterval ||
        (action.remindInterval?.unit === 'weekdays'
          ? action.remindInterval
          : undefined);
      const inventoryItemId =
        action.inventoryItemId?.trim() ||
        inventoryIdFromUtterance(lastUserText, options.inventoryList);
      const person = resolveAssignment({
        assignedTo: action.assignedTo,
        personId: action.personId,
        utterance: lastUserText,
        members: household,
        preferSelf: true,
      });
      const saved = await options.lastDone.setReminder({
        label,
        remindAt,
        notes,
        remindInterval,
        inventoryItemId: inventoryItemId ?? null,
        personId: person?.personId ?? null,
        assignedTo: person?.assignedTo ?? null,
      });
      reminderLabel = saved.label;
      reminderAt = saved.remindAt || remindAt;
      remember('lastDone', saved.id);
      if (inventoryItemId) focusItemId = inventoryItemId;
      console.log('[LifeOS chat] applied set_reminder', saved.label, remindAt);
      continue;
    }
    if (action.type === 'add_expense' && action.title?.trim() && options?.expenses) {
      const amount = parseAmount(action.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.log('[LifeOS chat] skip add_expense — bad amount', action.amount);
        continue;
      }
      const currency = resolveActionCurrency(
        action.currency,
        action.amount,
        lastUserText,
        defaultCurrency
      );
      const date = action.date ? normalizeDateField(action.date) : today;
      if (!date) {
        console.log('[LifeOS chat] skip add_expense — invalid date', action.date);
        continue;
      }
      const merchant =
        formatPurchasedFrom(action.merchant) ||
        merchantFromUtterance(lastUserText) ||
        undefined;
      const person = resolveAssignment({
        assignedTo: action.assignedTo,
        personId: action.personId,
        utterance: lastUserText,
        members: household,
      });
      const saved = await options.expenses.addExpense({
        title: action.title.trim(),
        amount,
        currency,
        category: normalizeExpenseCategory(
          action.category || `${action.title} ${merchant || ''}`
        ),
        date,
        merchant,
        note: action.note?.trim() || undefined,
        inventoryItemId: action.inventoryItemId?.trim() || undefined,
        personId: person?.personId,
        source: 'talk',
      });
      loggedExpenseId = saved.id;
      loggedExpenseTitle = saved.title;
      loggedExpenseMerchant = saved.merchant || null;
      loggedExpenseAmount = formatMoney(`${currency} ${amount}`) || `${currency} ${amount}`;
      remember('expense', saved.id);
      console.log(
        '[LifeOS chat] applied add_expense',
        saved.id,
        saved.title,
        amount,
        merchant || ''
      );
      continue;
    }
    if (
      action.type === 'add_subscription' &&
      action.title?.trim() &&
      options?.subscriptions
    ) {
      const amount = parseAmount(action.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        console.log('[LifeOS chat] skip add_subscription — bad amount', action.amount);
        continue;
      }
      const currency = resolveActionCurrency(
        action.currency,
        action.amount,
        lastUserText,
        defaultCurrency
      );
      const cycle = normalizeSubscriptionCycle(action.cycle);
      const renewsOn = action.renewsOn
        ? normalizeDateField(action.renewsOn)
        : undefined;
      const person = resolveAssignment({
        assignedTo: action.assignedTo,
        personId: action.personId,
        utterance: lastUserText,
        members: household,
      });
      const saved = await options.subscriptions.addSubscription({
        title: action.title.trim(),
        amount,
        currency,
        cycle,
        renewsOn,
        category: normalizeSubscriptionCategory(
          action.category || `${action.title} ${action.provider || ''}`
        ),
        provider: action.provider?.trim() || undefined,
        note: action.note?.trim() || undefined,
        personId: person?.personId,
        source: 'talk',
      });
      loggedSubscriptionTitle = saved.title;
      loggedSubscriptionAmount =
        formatMoney(`${currency} ${amount}`) || `${currency} ${amount}`;
      remember('subscription', saved.id);
      console.log(
        '[LifeOS chat] applied add_subscription',
        saved.id,
        saved.title,
        amount,
        cycle
      );
      continue;
    }
    if (action.type === 'update_subscription' && options?.subscriptions?.updateSubscription) {
      const id =
        String(action.id || '').trim() ||
        idFromTitleList(lastUserText, options.subscriptionsList) ||
        '';
      const row =
        options.subscriptions.getById?.(id) ||
        options.subscriptionsList?.find((s) => s.id === id);
      const patch: Parameters<NonNullable<SubscriptionsApi['updateSubscription']>>[1] = {};
      if (action.patch?.title?.trim()) patch.title = titleCase(action.patch.title);
      if (action.patch?.amount != null && action.patch.amount !== '') {
        const amount = parseAmount(action.patch.amount);
        if (Number.isFinite(amount) && amount > 0) patch.amount = amount;
      }
      if (action.patch?.currency?.trim()) {
        patch.currency = action.patch.currency.trim().toUpperCase();
      }
      if (action.patch?.cycle?.trim()) {
        patch.cycle = normalizeSubscriptionCycle(action.patch.cycle);
      }
      if (action.patch?.renewsOn?.trim()) {
        const d = normalizeDateField(action.patch.renewsOn);
        if (d) patch.renewsOn = d;
      }
      if (action.patch?.category?.trim()) {
        patch.category = normalizeSubscriptionCategory(action.patch.category);
      }
      if (action.patch?.provider?.trim()) patch.provider = action.patch.provider.trim();
      if (action.patch?.note?.trim()) patch.note = action.patch.note.trim();
      if (!id || !Object.keys(patch).length || (!row && options.subscriptions.getById)) {
        console.log('[LifeOS chat] skip update_subscription — missing id/patch or not found', id);
        continue;
      }
      await options.subscriptions.updateSubscription(id, patch);
      loggedSubscriptionTitle = patch.title || row?.title || 'subscription';
      if (patch.amount != null) {
        const cur = String(patch.currency || defaultCurrency);
        loggedSubscriptionAmount =
          formatMoney(`${cur} ${patch.amount}`) || `${cur} ${patch.amount}`;
      }
      updatedSubscription = true;
      remember('subscription', id);
      console.log('[LifeOS chat] applied update_subscription', id, patch);
      continue;
    }
    if (action.type === 'remove_subscription' && options?.subscriptions?.removeSubscription) {
      const id =
        String(action.id || '').trim() ||
        idFromTitleList(`${lastUserText || ''} ${action.title || ''}`, options.subscriptionsList) ||
        '';
      const row =
        options.subscriptions.getById?.(id) ||
        options.subscriptionsList?.find((s) => s.id === id);
      if (!id || (!row && options.subscriptions.getById)) {
        console.log('[LifeOS chat] skip remove_subscription — not found', action.id);
        continue;
      }
      await options.subscriptions.removeSubscription(id);
      removedSubscriptionTitle = row?.title || action.title?.trim() || 'subscription';
      if (talkFocus?.kind === 'subscription' && talkFocus.id === id) {
        talkFocus = null;
        clearedFocus = true;
      }
      console.log('[LifeOS chat] applied remove_subscription', id);
      continue;
    }
    if (action.type === 'habit_check_in' && action.title?.trim() && options?.habits) {
      const title = titleCase(action.title.trim());
      const date = action.date ? normalizeDateField(action.date) : today;
      if (!date) {
        console.log('[LifeOS chat] skip habit_check_in — invalid date', action.date);
        continue;
      }
      const linkId = action.inventoryItemId?.trim() || undefined;
      const person = await ensurePerson(
        resolveAssignment({
          assignedTo: action.assignedTo,
          personId: action.personId,
          utterance: lastUserText,
          members: household,
          preferSelf: true,
        })
      );
      let habit =
        options.habits.findByTitle(action.title.trim(), person?.personId) ||
        options.habits.findByTitle(title, person?.personId);
      if (!habit && action.createIfMissing !== false) {
        habit = await options.habits.addHabit({
          title,
          why: action.why?.trim() || undefined,
          personId: person?.personId,
          assignedTo: person?.assignedTo,
          inventoryItemId: linkId,
          syncLastDone: linkId ? true : undefined,
        });
      }
      if (!habit) {
        console.log('[LifeOS chat] skip habit_check_in — not found', title);
        continue;
      }
      if (linkId && habit.inventoryItemId !== linkId && options.habits.updateHabit) {
        await options.habits.updateHabit(habit.id, {
          inventoryItemId: linkId,
          syncLastDone: habit.syncLastDone ?? true,
        });
        habit = options.habits.getById(habit.id) || {
          ...habit,
          inventoryItemId: linkId,
          syncLastDone: habit.syncLastDone ?? true,
        };
      }
      const already = loggedOn(habit, date);
      if (!already) {
        habit = (await options.habits.checkIn(habit.id, date)) || habit;
      }
      if (!already && habit && shouldSyncLastDone(habit) && options.lastDone) {
        const inventoryItemId = habit.inventoryItemId || linkId;
        if (inventoryItemId) {
          await options.lastDone.logDone({
            label: habit.title,
            inventoryItemId,
            doneAt: date,
            personId: habit.personId,
            assignedTo: habit.assignedTo,
          });
        }
      }
      habitCheckInTitle = habit.title;
      lastAssignedTo = habit.assignedTo ?? lastAssignedTo;
      habitStreak = currentStreak(habit);
      habitCheckInDateSet.add(date);
      remember('habit', habit.id);
      console.log(
        '[LifeOS chat] applied habit_check_in',
        habit.id,
        habit.title,
        date,
        `streak ${habitStreak}`,
        habit.assignedTo ? `→ ${habit.assignedTo}` : ''
      );
      continue;
    }
    if (action.type === 'remove_habit' && options?.habits?.removeHabit) {
      const person = resolveAssignment({
        assignedTo: undefined,
        personId: undefined,
        utterance: lastUserText,
        members: household,
        preferSelf: true,
      });
      const byId = action.id ? options.habits.getById(action.id) : undefined;
      const byTitle =
        (action.title && options.habits.findByTitle(action.title, person?.personId)) ||
        (lastUserText && options.habits.findByTitle(lastUserText, person?.personId));
      const habit =
        byId ||
        byTitle ||
        options.habitsList?.find((h) => h.id === action.id) ||
        (idFromTitleList(`${lastUserText || ''} ${action.title || ''}`, options.habitsList)
          ? options.habits.getById(
              idFromTitleList(`${lastUserText || ''} ${action.title || ''}`, options.habitsList)!
            )
          : undefined);
      if (!habit) {
        console.log('[LifeOS chat] skip remove_habit — not found');
        continue;
      }
      await options.habits.removeHabit(habit.id);
      removedHabitTitle = habit.title;
      if (talkFocus?.kind === 'habit' && talkFocus.id === habit.id) {
        talkFocus = null;
        clearedFocus = true;
      }
      console.log('[LifeOS chat] applied remove_habit', habit.id, habit.title);
      continue;
    }

    if (action.type === 'add_class_pack' && action.title?.trim() && options?.classes) {
      const spoken = classPackFromUtterance(lastUserText);
      const title = titleCase(action.title.trim());
      const totalRaw = spoken.total ?? action.total;
      const totalN = Math.round(Number(totalRaw));
      const total = Number.isFinite(totalN) && totalN > 0 ? totalN : 0;
      const monthsRaw = spoken.months ?? action.months;
      const months = monthsRaw != null ? Math.round(Number(monthsRaw)) : undefined;
      const scheduleDays =
        normalizeScheduleDays(action.scheduleDays) ||
        classScheduleDaysFromUtterance(lastUserText);
      const scheduleTime =
        action.scheduleTime?.trim() || classScheduleTimeFromUtterance(lastUserText);
      const completedRaw = action.completed ?? classCompletedCountFromUtterance(lastUserText);
      const completed =
        completedRaw != null && Number.isFinite(Number(completedRaw))
          ? Math.round(Number(completedRaw))
          : undefined;

      const person = await ensurePerson(
        resolveAssignment({
          assignedTo: action.assignedTo,
          personId: action.personId,
          utterance: lastUserText,
          members: household,
          preferSelf: true,
        })
      );
      // The model doesn't reliably know today's date — "before November" can
      // come back as 2023. Spoken deadline wins; reject windows that already
      // ended and starts that are ancient or after the end.
      const yearAgoDate = new Date(`${today}T12:00:00`);
      yearAgoDate.setFullYear(yearAgoDate.getFullYear() - 1);
      const yearAgo = dayKey(yearAgoDate);
      let startsOn = action.startsOn
        ? normalizeDateField(String(action.startsOn))
        : undefined;
      let endsOn =
        classDeadlineFromUtterance(lastUserText) ||
        (action.endsOn ? normalizeDateField(String(action.endsOn)) : undefined);
      if (endsOn && endsOn <= today) endsOn = undefined;
      if (startsOn && (startsOn < yearAgo || (endsOn && startsOn > endsOn))) {
        startsOn = undefined;
      }
      const pack = await options.classes.addPack({
        title,
        total: total || undefined,
        completed,
        months: months && months > 0 ? months : undefined,
        startsOn,
        endsOn,
        scheduleDays,
        scheduleTime,
        personId: person?.personId,
        assignedTo: person?.assignedTo,
      });
      classPackTitle = pack.title;
      classPackRemaining = remainingCount(pack);
      classPackTotal = pack.total;
      classPackScheduleTimeInferred = Boolean(pack.scheduleTimeInferred);
      lastAssignedTo = pack.assignedTo ?? lastAssignedTo;
      remember('class', pack.id);
      console.log(
        '[LifeOS chat] applied add_class_pack',
        pack.id,
        pack.title,
        `${pack.total} until ${pack.endsOn}`,
        pack.assignedTo ? `→ ${pack.assignedTo}` : ''
      );
      continue;
    }

    if (action.type === 'log_class' && options?.classes) {
      const person = resolveAssignment({
        assignedTo: action.assignedTo,
        personId: action.personId,
        utterance: lastUserText,
        members: household,
        preferSelf: true,
      });
      classLogAttemptFor = person?.assignedTo ?? classLogAttemptFor;
      const named =
        classTitleFromUtterance(lastUserText) || action.title?.trim() || undefined;
      const byId = action.id ? options.classes.getById(action.id) : undefined;
      const byIdOk =
        byId &&
        (!person?.personId ||
          !byId.personId ||
          byId.personId === person.personId)
          ? byId
          : undefined;
      const pack =
        byIdOk ||
        (options.classes.pickAttendance
          ? options.classes.pickAttendance({
              title: named,
              personId: person?.personId,
            })
          : pickAttendancePack([], { title: named, personId: person?.personId })) ||
        (!named && !person?.personId ? options.classes.newestPack?.() : undefined);
      if (!pack) {
        console.log('[LifeOS chat] skip log_class — pack not found', action.title);
        continue;
      }
      const date = action.date ? normalizeDateField(action.date) : today;
      if (!date) {
        console.log('[LifeOS chat] skip log_class — invalid date', action.date);
        continue;
      }
      const updated = await options.classes.logClass(pack.id, date);
      if (updated) {
        classLoggedTitle = updated.title;
        classPackRemaining = remainingCount(updated);
        classPackTotal = updated.total;
        lastAssignedTo = updated.assignedTo ?? lastAssignedTo;
        remember('class', updated.id);
        console.log(
          '[LifeOS chat] applied log_class',
          updated.id,
          updated.title,
          date,
          `${usedCount(updated)}/${updated.total}`,
          updated.assignedTo ? `→ ${updated.assignedTo}` : ''
        );
      }
      continue;
    }
    if (action.type === 'remove_class_pack' && options?.classes?.removePack) {
      const person = resolveAssignment({
        utterance: lastUserText,
        members: household,
        preferSelf: true,
      });
      const byId = action.id ? options.classes.getById(action.id) : undefined;
      const titled = action.title?.trim() || classTitleFromUtterance(lastUserText);
      const pack =
        byId ||
        (titled ? options.classes.findPack(titled, person?.personId) : undefined) ||
        (idFromTitleList(`${lastUserText || ''} ${action.title || ''}`, options.classPacksList)
          ? options.classes.getById(
              idFromTitleList(`${lastUserText || ''} ${action.title || ''}`, options.classPacksList)!
            )
          : undefined);
      if (!pack) {
        console.log('[LifeOS chat] skip remove_class_pack — not found');
        continue;
      }
      await options.classes.removePack(pack.id);
      removedClassTitle = pack.title;
      if (talkFocus?.kind === 'class' && talkFocus.id === pack.id) {
        talkFocus = null;
        clearedFocus = true;
      }
      console.log('[LifeOS chat] applied remove_class_pack', pack.id, pack.title);
      continue;
    }
    if (action.type === 'update_class_pack' && options?.classes?.updatePack) {
      const titled = action.title?.trim() || classTitleFromUtterance(lastUserText);
      const pack =
        (action.id ? options.classes.getById(action.id) : undefined) ||
        (titled ? options.classes.findPack(titled) : undefined) ||
        (talkFocus?.kind === 'class' ? options.classes.getById(talkFocus.id) : undefined);
      if (!pack) {
        console.log('[LifeOS chat] skip update_class_pack — not found');
        continue;
      }
      const patch: Partial<ClassPack> = {};
      if (action.patch?.title?.trim()) patch.title = titleCase(action.patch.title);
      if (action.patch?.total != null && action.patch.total !== '') {
        const n = Math.round(Number(action.patch.total));
        if (Number.isFinite(n) && n > 0) patch.total = n;
      }
      if (action.patch?.startsOn?.trim()) {
        const d = normalizeDateField(String(action.patch.startsOn));
        if (d) patch.startsOn = d;
      }
      if (action.patch?.endsOn?.trim()) {
        const d = normalizeDateField(String(action.patch.endsOn));
        if (d) patch.endsOn = d;
      }
      if (action.patch?.assignedTo?.trim() || action.patch?.personId) {
        const person = await ensurePerson(
          resolveAssignment({
            assignedTo: action.patch.assignedTo,
            personId: action.patch.personId,
            utterance: lastUserText,
            members: household,
          })
        );
        if (person?.personId) {
          patch.personId = person.personId;
          patch.assignedTo = person.assignedTo;
        }
      }
      if (action.patch?.scheduleDays !== undefined) {
        patch.scheduleDays = normalizeScheduleDays(action.patch.scheduleDays);
      } else {
        const spokenDays = classScheduleDaysFromUtterance(lastUserText);
        if (spokenDays) patch.scheduleDays = spokenDays;
      }
      if (action.patch?.scheduleTime !== undefined) {
        patch.scheduleTime = action.patch.scheduleTime?.trim() || undefined;
        patch.scheduleTimeInferred = false;
      } else {
        const spokenTime = classScheduleTimeFromUtterance(lastUserText);
        if (spokenTime) {
          patch.scheduleTime = spokenTime;
          patch.scheduleTimeInferred = false;
        }
      }
      const completedRaw =
        action.patch?.completed ?? classCompletedCountFromUtterance(lastUserText);
      if (completedRaw != null && Number.isFinite(Number(completedRaw))) {
        const adjusted = adjustCompletedCount(pack, Number(completedRaw));
        patch.logs = adjusted.logs;
      }

      if (!Object.keys(patch).length) {
        console.log('[LifeOS chat] skip update_class_pack — empty patch');
        continue;
      }
      await options.classes.updatePack(pack.id, patch);
      const next = options.classes.getById(pack.id) || { ...pack, ...patch };
      classPackTitle = next.title;
      classPackRemaining = remainingCount(next);
      classPackTotal = next.total;
      updatedClassPack = true;
      remember('class', pack.id);
      console.log('[LifeOS chat] applied update_class_pack', pack.id, patch);
      continue;
    }
    if (action.type === 'rename_person' && action.to?.trim() && options?.people?.updateMember) {
      const to = titleCase(action.to.trim());
      const fromRaw = action.from?.trim().toLowerCase() || '';
      // ASR can mangle the name in the correction itself ("Sara" may be stored
      // as "Sarah"), so resolve the member fuzzily — and fall back to matching
      // on `to`, which is always a near-variant of the stored name.
      const member =
        (fromRaw &&
          household.find((m) => m.name.trim().toLowerCase() === fromRaw)) ||
        (fromRaw ? fuzzyMatchMember(fromRaw, household) : undefined) ||
        fuzzyMatchMember(to, household) ||
        null;
      if (!member) {
        console.log('[LifeOS chat] skip rename_person — not found', action.from);
        continue;
      }
      await options.people.updateMember(member.id, {
        name: to,
        avatarLetter: avatarLetterFromName(to),
      });
      // The name is denormalized onto packs/habits — cascade it.
      if (options.classes?.updatePack) {
        for (const row of options.classPacksList ?? []) {
          const pack = options.classes.getById(row.id);
          if (pack?.personId === member.id) {
            await options.classes.updatePack(pack.id, { assignedTo: to });
          }
        }
      }
      if (options.habits?.updateHabit) {
        for (const row of options.habitsList ?? []) {
          const habit = options.habits.getById(row.id);
          if (habit?.personId === member.id) {
            await options.habits.updateHabit(habit.id, { assignedTo: to });
          }
        }
      }
      renamedPersonFrom = member.name;
      renamedPersonTo = to;
      console.log('[LifeOS chat] applied rename_person', member.id, member.name, '→', to);
      continue;
    }
    if (action.type === 'remove_last_done' && options?.lastDone?.remove) {
      const id =
        String(action.id || '').trim() ||
        idFromLabelList(`${lastUserText || ''} ${action.label || ''}`, options.lastDoneList) ||
        (talkFocus?.kind === 'lastDone' ? talkFocus.id : '') ||
        '';
      const row = options.lastDoneList?.find((d) => d.id === id);
      if (!id || (!row && options.lastDoneList)) {
        console.log('[LifeOS chat] skip remove_last_done — not found', action.id);
        continue;
      }
      await options.lastDone.remove(id);
      removedLastDoneLabel = row?.label || action.label?.trim() || 'activity';
      if (talkFocus?.kind === 'lastDone' && talkFocus.id === id) {
        talkFocus = null;
        clearedFocus = true;
      }
      console.log('[LifeOS chat] applied remove_last_done', id, removedLastDoneLabel);
      continue;
    }
  }

  if (fallback && removedIds.includes(fallback)) {
    clearedFocus = true;
    if (focusItemId === fallback) focusItemId = null;
  }

  return {
    lastAddedId,
    lastAddedName,
    lastAssignedTo,
    removedIds,
    removedNames,
    updatedIds,
    openItemId,
    openExpenseId,
    openTarget,
    focusItemId,
    talkFocus: clearedFocus && !talkFocus ? null : talkFocus,
    loggedExpenseId,
    clearedFocus,
    loggedDoneLabel,
    loggedExpenseTitle,
    loggedExpenseAmount,
    loggedExpenseMerchant,
    updatedExpense,
    loggedSubscriptionTitle,
    loggedSubscriptionAmount,
    updatedSubscription,
    removedExpenseTitle,
    removedSubscriptionTitle,
    removedHabitTitle,
    removedClassTitle,
    habitCheckInTitle,
    habitStreak,
    habitCheckInDays: habitCheckInDateSet.size,
    classPackTitle,
    classPackRemaining,
    classPackTotal,
    classPackScheduleTimeInferred,
    classLoggedTitle,
    classLogAttemptFor,
    reminderLabel,
    reminderAt,
    removedLastDoneLabel,
    updatedClassPack,
    renamedPersonFrom,
    renamedPersonTo,
  };
}

function expensePatchFromItemUpdate(
  patch?: ChatUpdateAction['patch']
): Parameters<ExpensesApi['updateExpense']>[1] {
  const out: Parameters<ExpensesApi['updateExpense']>[1] = {};
  if (!patch) return out;
  if (patch.price != null && patch.price !== '') {
    const amount = parseAmount(patch.price);
    if (Number.isFinite(amount) && amount > 0) out.amount = amount;
    const cur = currencyFromAmountRaw(patch.price);
    if (cur) out.currency = cur;
    else {
      const spoken = currencyFromSpokenText(patch.price);
      if (spoken) out.currency = spoken;
    }
  }
  if (patch.purchasedFrom != null && patch.purchasedFrom !== '') {
    out.merchant =
      formatPurchasedFrom(patch.purchasedFrom) || patch.purchasedFrom.trim();
  }
  if (patch.name != null && patch.name !== '') {
    out.title = titleCase(patch.name);
  }
  if (patch.category != null && patch.category !== '') {
    out.category = normalizeExpenseCategory(patch.category);
  }
  if (patch.purchaseDate != null && patch.purchaseDate !== '') {
    const d = normalizeDateField(patch.purchaseDate);
    if (d) out.date = d;
  }
  return out;
}

function idFromTitleList(
  text: string | undefined,
  list?: { id: string; title: string }[]
): string | undefined {
  if (!text?.trim() || !list?.length) return undefined;
  const t = text.toLowerCase();
  const scored = list
    .map((row) => {
      const title = row.title.toLowerCase();
      if (!title) return null;
      if (t.includes(title)) return { id: row.id, score: title.length };
      const words = title.split(/\s+/).filter((w) => w.length > 2);
      if (words.length && words.every((w) => t.includes(w))) {
        return { id: row.id, score: title.length };
      }
      return null;
    })
    .filter(Boolean) as { id: string; score: number }[];
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

function idFromLabelList(
  text: string | undefined,
  list?: { id: string; label: string }[]
): string | undefined {
  if (!text?.trim() || !list?.length) return undefined;
  return idFromTitleList(
    text,
    list.map((row) => ({ id: row.id, title: row.label }))
  );
}

function classTotalFromUtterance(text?: string): number | undefined {
  if (!text?.trim()) return undefined;
  const m = text.match(
    /(\d+)\s*(classes|sessions|lessons|class|session|lesson)\b/i
  );
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

function expenseIdFromUtterance(
  text: string | undefined,
  list?: { id: string; title: string; merchant?: string }[]
): string | undefined {
  return idFromTitleList(text, list);
}

function resolveExpenseUpdateId(params: {
  actionId: string;
  lastUserText?: string;
  expensesList?: { id: string; title: string; merchant?: string }[];
  lastFocusExpenseId?: string | null;
  getById?: ExpensesApi['getById'];
  hasAmountPatch?: boolean;
  hasPatch?: boolean;
}): string | null {
  const {
    actionId,
    lastUserText,
    expensesList,
    lastFocusExpenseId,
    getById,
    hasAmountPatch,
    hasPatch,
  } = params;
  if (getById?.(actionId)) return actionId;
  if (expensesList?.some((e) => e.id === actionId)) return actionId;
  const fromSpeech = expenseIdFromUtterance(lastUserText, expensesList);
  if (fromSpeech) return fromSpeech;
  const canUseFocus = hasPatch || hasAmountPatch;
  if (canUseFocus && lastFocusExpenseId) {
    if (
      !getById ||
      getById(lastFocusExpenseId) ||
      expensesList?.some((e) => e.id === lastFocusExpenseId)
    ) {
      return lastFocusExpenseId;
    }
  }
  return null;
}

/** Utterance clearly about an expense (not a Thing). */
export function looksLikeShowExpense(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase().replace(/[’']/g, "'");
  return (
    /\b(expense|spend|spending|purchase|receipt)\b/.test(t) ||
    /\b(last|latest|recent)\s+(expense|spend|purchase)\b/.test(t) ||
    /\bmy\s+(expense|spend|purchase)\b/.test(t)
  );
}

/** “Show it / show me / open that / show my last expense” without naming a product. */
export function looksLikeShowLast(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase().replace(/[’']/g, "'");
  if (looksLikeShowExpense(t)) return true;
  if (
    /^(show|open|see|view)(\s+me)?(\s+please)?\s*[.!?]?$/.test(t) ||
    /^(can you\s+)?(show|open|see|view)(\s+me)?(\s+please)?\s*[.!?]?$/.test(t)
  ) {
    return true;
  }
  return (
    /^(show|open|see|view)\s+(it|that|this|the\s+(item|expense|one|habit|subscription|class|activity))\b/.test(t) ||
    /^(show|open)\s+the\s+(item|expense|habit|subscription|class|activity)\b/.test(t) ||
    /^(can you )?(show|open)\s+(me\s+)?(it|that|this)\b/.test(t) ||
    /^(show|open)\s+me\s+(the\s+)?(my\s+)?(last\s+|latest\s+|recent\s+)?(item|expense|one|it|that|this|spend|purchase|habit|subscription|class|activity)\b/.test(
      t
    ) ||
    /\b(show|open|see|view)\s+(me\s+)?(my\s+)?(last\s+|latest\s+|recent\s+)?(expense|spend|purchase|habit|subscription|class pack|activity)\b/.test(
      t
    )
  );
}

function inventoryIdFromUtterance(
  text: string | undefined,
  list?: { id: string; name: string }[]
): string | undefined {
  if (!text?.trim() || !list?.length) return undefined;
  const t = text.toLowerCase();
  const hit = list.find((i) => {
    const name = i.name.toLowerCase();
    if (!name) return false;
    return t.includes(name) || (name.includes('passport') && t.includes('passport'));
  });
  return hit?.id;
}

function ensureTalkActions(
  actions: ChatAction[],
  lastUserText?: string
): ChatAction[] {
  let list = actions.filter((a) => a && a.type !== 'none');
  if (looksLikeClassEnrollment(lastUserText)) {
    list = list.filter((a) => a.type !== 'habit_check_in');
  }
  const types = new Set(list.map((a) => a.type));
  if (looksLikeClassEnrollment(lastUserText) && !types.has('add_class_pack')) {
    const title = classTitleFromUtterance(lastUserText) || 'Class';
    const spoken = classPackFromUtterance(lastUserText);
    list.push({
      type: 'add_class_pack',
      title,
      total: spoken.total,
      months: spoken.months,
    });
  }
  if (looksLikeClassAttendance(lastUserText) && !types.has('log_class')) {
    list.push({
      type: 'log_class',
      title: classTitleFromUtterance(lastUserText),
    });
  }
  if (looksLikeReminder(lastUserText) && !types.has('set_reminder')) {
    const recurring = parseRecurringWeekdayReminder(lastUserText);
    const remindAt = remindAtFromUtterance(lastUserText);
    const label = reminderLabelFromUtterance(lastUserText) || 'Reminder';
    if (remindAt || recurring) {
      list.push({
        type: 'set_reminder',
        label,
        remindAt: recurring?.remindAt || remindAt!,
        remindInterval: recurring?.remindInterval,
      });
    }
  }
  return list.length ? list : actions;
}

function sanitizeReply(reply: string, actions: ChatAction[]) {
  const trimmed = reply.trim();
  if (trimmed && !/^(none|null|undefined|n\/a)$/i.test(trimmed)) {
    return trimmed;
  }
  const types = actions.map((a) => a.type);
  if (types.includes('open_expense')) return 'Opening that expense.';
  if (types.includes('open_habit')) return 'Opening that habit.';
  if (types.includes('open_subscription')) return 'Opening that subscription.';
  if (types.includes('open_class')) return 'Opening that class pack.';
  if (types.includes('open_last_done')) return 'Opening that activity.';
  if (types.includes('open_item')) return 'Opening that item.';
  if (types.includes('add_item')) return 'Added to your inventory.';
  if (types.includes('add_expense')) return 'Saved that expense.';
  if (types.includes('update_expense')) return 'Updated that expense.';
  if (types.includes('remove_expense')) return 'Deleted that expense.';
  if (types.includes('add_subscription')) return 'Added that subscription.';
  if (types.includes('update_subscription')) return 'Updated that subscription.';
  if (types.includes('remove_subscription')) return 'Removed that subscription.';
  if (types.includes('habit_check_in')) return 'Got it.';
  if (types.includes('remove_habit')) return 'Removed that habit.';
  if (types.includes('add_class_pack')) return 'Added that class pack.';
  if (types.includes('log_class')) return 'Logged that class.';
  if (types.includes('remove_class_pack')) return 'Removed that class pack.';
  if (types.includes('update_class_pack')) return 'Updated that class pack.';
  if (types.includes('update_item')) return 'Updated.';
  if (types.includes('log_done')) return 'Marked that as done.';
  if (types.includes('set_reminder')) return 'Reminder set.';
  if (types.includes('remove_last_done')) return 'Removed that activity.';
  if (types.includes('remove_item')) return 'Removed from your inventory.';
  return 'Anything else?';
}

export function normalizeAgentResponse(raw: unknown): ChatAgentResponse {
  if (!raw || typeof raw !== 'object') {
    return {
      reply: 'I had trouble reading that response. Try again in a moment.',
      actions: [{ type: 'none' }],
    };
  }
  const obj = raw as Record<string, unknown>;
  const actions = Array.isArray(obj.actions)
    ? (obj.actions as ChatAction[])
    : [{ type: 'none' as const }];
  const reply =
    typeof obj.reply === 'string'
      ? sanitizeReply(obj.reply, actions)
      : sanitizeReply('', actions);
  return { reply, actions };
}
