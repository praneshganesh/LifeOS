import type { Icon3DName } from '@/components/ui/Icon3D';
import type { InventoryItem } from '@/lib/InventoryContext';
import { formatMoney, formatPurchasedFrom } from '@/lib/chat/prompt';
import { sanitizeManualUrl } from '@/lib/manualLink';
import { timelineAfterMaintenance } from '@/lib/maintenanceLink';
import type { HouseholdMember } from '@/lib/household';
import {
  parseAmount,
  type ExpenseCategory,
  type NewExpenseInput,
} from '@/lib/expenses';
import type { Habit, NewHabitInput } from '@/lib/habits';
import { currentStreak, dayKey, loggedOn, shouldSyncLastDone } from '@/lib/habits';
import {
  classPackFromUtterance,
  classTitleFromUtterance,
  looksLikeClassAttendance,
  looksLikeClassEnrollment,
  remainingCount,
  usedCount,
  type ClassPack,
  type NewClassPackInput,
} from '@/lib/classes';
import {
  normalizeSubscriptionCategory,
  normalizeSubscriptionCycle,
  type NewSubscriptionInput,
} from '@/lib/subscriptions';
import { resolveAssignment } from '@/lib/people';
import type { ChatAction, ChatAddAction, ChatAgentResponse } from '@/lib/chat/types';
import {
  looksLikeReminder,
  normalizeWarrantyExpiry,
  remindAtFromUtterance,
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
  }) => Promise<{ label: string; inventoryItemId?: string; logs?: { doneAt: string }[] }>;
  setReminder?: (input: {
    label: string;
    remindAt: string;
    inventoryItemId?: string | null;
  }) => Promise<{ label: string; remindAt?: string; inventoryItemId?: string }>;
};

type ExpensesApi = {
  addExpense: (input: NewExpenseInput) => Promise<{ id: string; title: string; amount: number }>;
};

type SubscriptionsApi = {
  addSubscription: (
    input: NewSubscriptionInput
  ) => Promise<{ id: string; title: string; amount: number; currency: string; cycle: string }>;
};

type HabitsApi = {
  addHabit: (input: NewHabitInput) => Promise<Habit>;
  updateHabit?: (id: string, patch: Partial<Habit>) => Promise<void>;
  checkIn: (id: string, date?: string) => Promise<Habit | null>;
  findByTitle: (title: string) => Habit | undefined;
  getById: (id: string) => Habit | undefined;
};

type ClassesApi = {
  addPack: (input: NewClassPackInput) => Promise<ClassPack>;
  logClass: (id: string, date?: string) => Promise<ClassPack | null>;
  findPack: (title: string, personId?: string) => ClassPack | undefined;
  getById: (id: string) => ClassPack | undefined;
  newestPack?: () => ClassPack | undefined;
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

function currencyFromAmountRaw(raw: string | number | undefined): string {
  if (typeof raw === 'number') return 'AED';
  const s = String(raw || '');
  if (/\b(usd|dollars?|\$)\b/i.test(s)) return 'USD';
  if (/\b(eur|euros?|€)\b/i.test(s)) return 'EUR';
  if (/\b(gbp|pounds?|£)\b/i.test(s)) return 'GBP';
  return 'AED';
}

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Accept YYYY-MM-DD or common spoken dates; reject junk. */
function normalizeDateField(raw: string): string | undefined {
  const s = raw.trim();
  if (!s || s === '—' || s === '-') return undefined;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return dayKey(d);
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

/** Category/room/icon defaults when the model omits them — not brand correction. */
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
      room: 'Personal Documents',
      spaceId: 's5',
      icon: 'document',
      isDocument: true,
    };
  }
  if (/\b(car|vehicle|prado|toyota|bmw|tyre|tire)\b/.test(t)) {
    return { category: 'Vehicle', room: 'Vehicles', spaceId: 's4', icon: 'car', isDocument: false };
  }
  if (/\b(coffee|espresso|barista|fridge|dishwasher|microwave|oven)\b/.test(t)) {
    return {
      category: 'Appliances',
      room: 'Kitchen',
      spaceId: 's1',
      icon: /\bfridge|refrigerator\b/.test(t) ? 'fridge' : 'coffee',
      isDocument: false,
    };
  }
  if (/\b(tv|television|laptop|macbook|iphone|phone|headphones|watch|ipad|tablet)\b/.test(t)) {
    return {
      category: 'Electronics',
      room: 'Personal',
      spaceId: 's1',
      icon: /\b(tv|television)\b/.test(t) ? 'tv' : 'laptop',
      isDocument: false,
    };
  }
  if (/\b(washer|washing|vacuum|utility)\b/.test(t)) {
    return { category: 'Home', room: 'Utility', spaceId: 's1', icon: 'washing', isDocument: false };
  }
  return { category: 'Home', room: 'Inbox', spaceId: 's1', icon: 'package', isDocument: false };
}

function addActionToInput(
  action: ChatAddAction,
  source: InventoryItem['source'],
  lastUserText?: string,
  household: HouseholdMember[] = []
): Omit<InventoryItem, 'id' | 'createdAt'> {
  const name = titleCase(action.name.trim());
  const blob = `${name} ${action.category || ''} ${action.room || ''}`;
  const inferred = inferMeta(blob);
  const today = dayKey();
  const label = new Date().toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const brand = action.brand?.trim() ? titleCase(action.brand.trim()) : 'Unknown';
  let category = action.category?.trim() || inferred.category;
  let room = action.room?.trim() || inferred.room;
  let spaceId = inferred.spaceId;

  // Never park laptops/phones in document folders
  if (
    !inferred.isDocument &&
    category !== 'Documents' &&
    /personal documents/i.test(room)
  ) {
    room = 'Personal';
  }

  const person = resolveAssignment({
    assignedTo: action.assignedTo,
    personId: action.personId,
    utterance: lastUserText,
    members: household,
  });

  if (person && !inferred.isDocument) {
    // Belonging to a family member → Family space unless it's a shared kitchen appliance
    if (!/\b(kitchen|living room|utility)\b/i.test(room)) {
      spaceId = 's6';
      if (/^personal$/i.test(room) || !room) room = 'Family';
    }
  }

  const price = formatMoney(action.price) || '—';
  const purchasedFrom = formatPurchasedFrom(action.purchasedFrom);
  const manualUrl = sanitizeManualUrl(action.manualUrl);
  const warrantyExpiry =
    normalizeWarrantyExpiry(action.warrantyExpiry) ||
    warrantyExpiryFromUtterance(lastUserText) ||
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
  /** Best item to treat as conversation focus after this turn */
  focusItemId: string | null;
  /** True when focus item was deleted this turn */
  clearedFocus: boolean;
  loggedDoneLabel: string | null;
  loggedExpenseTitle: string | null;
  loggedExpenseAmount: string | null;
  loggedSubscriptionTitle: string | null;
  loggedSubscriptionAmount: string | null;
  habitCheckInTitle: string | null;
  habitStreak: number | null;
  /** Distinct days marked in this turn (for natural multi-day replies). */
  habitCheckInDays: number;
  classPackTitle: string | null;
  classPackRemaining: number | null;
  classPackTotal: number | null;
  classLoggedTitle: string | null;
  reminderLabel: string | null;
  reminderAt: string | null;
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
    expenses?: ExpensesApi;
    subscriptions?: SubscriptionsApi;
    habits?: HabitsApi;
    classes?: ClassesApi;
    inventoryList?: { id: string; name: string }[];
  }
): Promise<ApplyActionsResult> {
  let lastAddedId: string | null = null;
  let lastAddedName: string | null = null;
  let lastAssignedTo: string | null = null;
  const removedIds: string[] = [];
  const removedNames: string[] = [];
  const updatedIds: string[] = [];
  let openItemId: string | null = null;
  let focusItemId: string | null = null;
  let clearedFocus = false;
  let loggedDoneLabel: string | null = null;
  let loggedExpenseTitle: string | null = null;
  let loggedExpenseAmount: string | null = null;
  let loggedSubscriptionTitle: string | null = null;
  let loggedSubscriptionAmount: string | null = null;
  let habitCheckInTitle: string | null = null;
  let habitStreak: number | null = null;
  const habitCheckInDateSet = new Set<string>();
  let classPackTitle: string | null = null;
  let classPackRemaining: number | null = null;
  let classPackTotal: number | null = null;
  let classLoggedTitle: string | null = null;
  let reminderLabel: string | null = null;
  let reminderAt: string | null = null;
  const fallback = options?.fallbackFocusId ?? null;
  const seenRemove = new Set<string>();
  const lastUserText = options?.lastUserText;
  const household = options?.household ?? [];
  const list = ensureTalkActions(Array.isArray(actions) ? actions : [], lastUserText);

  for (const action of list) {
    if (!action || action.type === 'none') continue;
    if (action.type === 'add_item' && action.name?.trim()) {
      const item = await api.addItem(
        addActionToInput(action, source, lastUserText, household)
      );
      lastAddedId = item.id;
      lastAddedName = item.name;
      lastAssignedTo = item.assignedTo ?? null;
      focusItemId = item.id;
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
        focusItemId = action.id;
        console.log('[LifeOS chat] applied update_item', action.id, patch);
      }
      continue;
    }
    if (action.type === 'remove_item' && action.id) {
      if (seenRemove.has(action.id)) continue;
      seenRemove.add(action.id);
      const existing = options?.resolveItem?.(action.id);
      if (!existing) {
        console.log('[LifeOS chat] skip remove_item — not in inventory', action.id);
        continue;
      }
      await api.removeItem(action.id);
      removedIds.push(action.id);
      removedNames.push(existing.name);
      if (fallback === action.id || focusItemId === action.id) {
        clearedFocus = true;
        focusItemId = null;
      }
      console.log('[LifeOS chat] applied remove_item', action.id, existing.name);
      continue;
    }
    if (action.type === 'open_item') {
      const id = (action.id || fallback || '').trim();
      if (id) {
        openItemId = id;
        focusItemId = id;
        console.log('[LifeOS chat] open_item', id, action.id ? '' : '(fallback focus)');
      } else {
        console.warn('[LifeOS chat] open_item missing id and no focus fallback');
      }
      continue;
    }
    if (action.type === 'log_done' && action.label?.trim() && options?.lastDone) {
      const label = action.label.trim();
      const inventoryItemId =
        (action.inventoryItemId || fallback || '').trim() || undefined;
      const saved = await options.lastDone.logDone({
        label,
        doneAt: action.doneAt,
        inventoryItemId: inventoryItemId ?? null,
      });
      loggedDoneLabel = saved.label;
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
      const spokenAt = remindAtFromUtterance(lastUserText);
      const remindAt =
        (action.remindAt ? normalizeDateField(action.remindAt) : undefined) || spokenAt;
      if (!remindAt) {
        console.log('[LifeOS chat] skip set_reminder — no date', action.label);
        continue;
      }
      const spokenLabel = reminderLabelFromUtterance(lastUserText);
      const label = (spokenLabel || action.label).trim();
      const inventoryItemId =
        action.inventoryItemId?.trim() ||
        inventoryIdFromUtterance(lastUserText, options.inventoryList);
      const saved = await options.lastDone.setReminder({
        label,
        remindAt,
        inventoryItemId: inventoryItemId ?? null,
      });
      reminderLabel = saved.label;
      reminderAt = saved.remindAt || remindAt;
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
      const currency =
        (action.currency?.trim().toUpperCase() ||
          currencyFromAmountRaw(action.amount)) ??
        'AED';
      const date = action.date ? normalizeDateField(action.date) : undefined;
      const saved = await options.expenses.addExpense({
        title: action.title.trim(),
        amount,
        currency,
        category: normalizeExpenseCategory(
          action.category || `${action.title} ${action.merchant || ''}`
        ),
        date,
        merchant: action.merchant?.trim() || undefined,
        note: action.note?.trim() || undefined,
        inventoryItemId: action.inventoryItemId?.trim() || undefined,
        source: 'talk',
      });
      loggedExpenseTitle = saved.title;
      loggedExpenseAmount = formatMoney(`${currency} ${amount}`) || `${currency} ${amount}`;
      console.log('[LifeOS chat] applied add_expense', saved.id, saved.title, amount);
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
      const currency =
        (action.currency?.trim().toUpperCase() ||
          currencyFromAmountRaw(action.amount)) ??
        'AED';
      const cycle = normalizeSubscriptionCycle(action.cycle);
      const renewsOn = action.renewsOn
        ? normalizeDateField(action.renewsOn)
        : undefined;
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
        source: 'talk',
      });
      loggedSubscriptionTitle = saved.title;
      loggedSubscriptionAmount =
        formatMoney(`${currency} ${amount}`) || `${currency} ${amount}`;
      console.log(
        '[LifeOS chat] applied add_subscription',
        saved.id,
        saved.title,
        amount,
        cycle
      );
      continue;
    }
    if (action.type === 'habit_check_in' && action.title?.trim() && options?.habits) {
      // Keep spoken form lightly cased for display; matching uses normalizeHabitKey
      const title = titleCase(action.title.trim());
      const date =
        (action.date ? normalizeDateField(action.date) : undefined) || dayKey();
      const linkId = action.inventoryItemId?.trim() || undefined;
      let habit = options.habits.findByTitle(action.title.trim())
        || options.habits.findByTitle(title);
      if (!habit && action.createIfMissing !== false) {
        habit = await options.habits.addHabit({
          title,
          why: action.why?.trim() || undefined,
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
          });
        }
      }
      habitCheckInTitle = habit.title;
      habitStreak = currentStreak(habit);
      habitCheckInDateSet.add(date);
      console.log(
        '[LifeOS chat] applied habit_check_in',
        habit.id,
        habit.title,
        date,
        `streak ${habitStreak}`
      );
    }

    if (action.type === 'add_class_pack' && action.title?.trim() && options?.classes) {
      const spoken = classPackFromUtterance(lastUserText);
      const title = titleCase(action.title.trim());
      const totalRaw = spoken.total ?? action.total;
      const totalN = Math.round(Number(totalRaw));
      const total = Number.isFinite(totalN) && totalN > 0 ? totalN : 0;
      const monthsRaw = spoken.months ?? action.months;
      const months = monthsRaw != null ? Math.round(Number(monthsRaw)) : undefined;
      const person = resolveAssignment({
        assignedTo: action.assignedTo,
        personId: action.personId,
        utterance: lastUserText,
        members: household,
      });
      const pack = await options.classes.addPack({
        title,
        total: total || undefined,
        months: months && months > 0 ? months : undefined,
        startsOn: action.startsOn ? normalizeDateField(String(action.startsOn)) : undefined,
        endsOn: action.endsOn ? normalizeDateField(String(action.endsOn)) : undefined,
        personId: person?.personId,
        assignedTo: person?.assignedTo,
      });
      classPackTitle = pack.title;
      classPackRemaining = remainingCount(pack);
      classPackTotal = pack.total;
      lastAssignedTo = pack.assignedTo ?? lastAssignedTo;
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
      });
      const named =
        classTitleFromUtterance(lastUserText) || action.title?.trim() || undefined;
      const byId = action.id ? options.classes.getById(action.id) : undefined;
      const titled = named
        ? options.classes.findPack(named, person?.personId)
        : undefined;
      const pack =
        byId || titled || (!named ? options.classes.newestPack?.() : undefined);
      if (!pack) {
        console.log('[LifeOS chat] skip log_class — pack not found', action.title);
        continue;
      }
      const date = action.date ? normalizeDateField(action.date) : dayKey();
      const updated = await options.classes.logClass(pack.id, date);
      if (updated) {
        classLoggedTitle = updated.title;
        classPackRemaining = remainingCount(updated);
        classPackTotal = updated.total;
        lastAssignedTo = updated.assignedTo ?? lastAssignedTo;
        console.log(
          '[LifeOS chat] applied log_class',
          updated.id,
          updated.title,
          date,
          `${usedCount(updated)}/${updated.total}`
        );
      }
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
    focusItemId,
    clearedFocus,
    loggedDoneLabel,
    loggedExpenseTitle,
    loggedExpenseAmount,
    loggedSubscriptionTitle,
    loggedSubscriptionAmount,
    habitCheckInTitle,
    habitStreak,
    habitCheckInDays: habitCheckInDateSet.size,
    classPackTitle,
    classPackRemaining,
    classPackTotal,
    classLoggedTitle,
    reminderLabel,
    reminderAt,
  };
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
  const list = actions.filter((a) => a && a.type !== 'none');
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
    const remindAt = remindAtFromUtterance(lastUserText);
    const label = reminderLabelFromUtterance(lastUserText) || 'Reminder';
    if (remindAt) {
      list.push({ type: 'set_reminder', label, remindAt });
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
  if (types.includes('open_item')) return 'Opening that item.';
  if (types.includes('add_item')) return 'Added to your inventory.';
  if (types.includes('add_expense')) return 'Saved that expense.';
  if (types.includes('add_subscription')) return 'Added that subscription.';
  if (types.includes('habit_check_in')) return 'Got it.';
  if (types.includes('add_class_pack')) return 'Added that class pack.';
  if (types.includes('log_class')) return 'Logged that class.';
  if (types.includes('update_item')) return 'Updated.';
  if (types.includes('log_done')) return 'Marked that as done.';
  if (types.includes('set_reminder')) return 'Reminder set.';
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
