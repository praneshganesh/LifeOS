export type ChatRole = 'user' | 'assistant';

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type InventorySummaryItem = {
  id: string;
  name: string;
  brand: string;
  room: string;
  category: string;
  price?: string;
  purchasedFrom?: string;
  purchaseDate?: string;
  warrantyExpiry?: string;
  expiryDate?: string;
  warrantyActive?: boolean;
  serial?: string;
  assignedTo?: string;
  createdAt?: string;
  timeline?: { date: string; event: string }[];
  /** ISO date the item was added to LifeOS (from createdAt) */
  addedAt?: string;
  recentEvents?: { date: string; event: string }[];
};

export type ChatSessionFocus = {
  /** Item most recently added/updated/opened in this conversation */
  focusItemId?: string | null;
  /** Expense most recently logged/updated — “show it” after spend */
  focusExpenseId?: string | null;
  /** Last module Talk touched — vague show/delete/update uses this. */
  focus?: { kind: string; id: string } | null;
};

export type ChatAddAction = {
  type: 'add_item';
  name: string;
  brand?: string;
  room?: string;
  category?: string;
  /** Display price, e.g. "AED 800" */
  price?: string;
  /** Retailer / marketplace, e.g. "Amazon", "Sharaf DG" */
  purchasedFrom?: string;
  /** Official manual or support page URL (https only) */
  manualUrl?: string;
  /** Warranty end — YYYY-MM-DD, or a year like "2028" */
  warrantyExpiry?: string;
  /** Only if the user stated condition (new/used/…). Omit to leave unknown. */
  condition?: string;
  /** Who this belongs to — a real household member name. */
  assignedTo?: string;
  personId?: string;
};

export type ChatUpdateAction = {
  type: 'update_item';
  id: string;
  patch: {
    brand?: string;
    room?: string;
    name?: string;
    category?: string;
    price?: string;
    purchasedFrom?: string;
    purchaseDate?: string;
    warrantyExpiry?: string;
    serial?: string;
    manualUrl?: string;
    assignedTo?: string;
    personId?: string;
  };
};

export type ChatRemoveAction = {
  type: 'remove_item';
  id: string;
};

export type ChatOpenAction = {
  type: 'open_item';
  id: string;
};

/** Log a maintenance / Last Done activity, optionally linked to an inventory item. */
export type ChatLogDoneAction = {
  type: 'log_done';
  /** Activity label, e.g. "Descaled" or "Changed filter" */
  label: string;
  /** Inventory item this service was for */
  inventoryItemId?: string;
  /** When it was done — YYYY-MM-DD preferred */
  doneAt?: string;
};

/** One-off future reminder (Last Done remindAt) — not a completed activity. */
export type ChatSetReminderAction = {
  type: 'set_reminder';
  label: string;
  /** YYYY-MM-DD */
  remindAt: string;
  inventoryItemId?: string;
  assignedTo?: string;
  personId?: string;
};

/** Log a spend entry (not a durable Thing). */
export type ChatAddExpenseAction = {
  type: 'add_expense';
  /** Short description, e.g. "Groceries" or "Coffee" */
  title: string;
  /** Number or string like "45.50" / "AED 50" */
  amount: number | string;
  currency?: string;
  /** food | transport | home | shopping | health | travel | bills | entertainment | other */
  category?: string;
  /** YYYY-MM-DD when known */
  date?: string;
  merchant?: string;
  note?: string;
  inventoryItemId?: string;
  assignedTo?: string;
  personId?: string;
};

/** Refine an existing expense (amount, merchant, title, …). */
export type ChatUpdateExpenseAction = {
  type: 'update_expense';
  id: string;
  patch: {
    title?: string;
    amount?: number | string;
    currency?: string;
    category?: string;
    date?: string;
    merchant?: string;
    note?: string;
  };
};

export type ChatRemoveExpenseAction = {
  type: 'remove_expense';
  id?: string;
  title?: string;
};

export type ChatOpenExpenseAction = {
  type: 'open_expense';
  id?: string;
};

export type ChatOpenHabitAction = {
  type: 'open_habit';
  id?: string;
};

export type ChatOpenSubscriptionAction = {
  type: 'open_subscription';
  id?: string;
};

export type ChatOpenClassAction = {
  type: 'open_class';
  id?: string;
};

export type ChatOpenLastDoneAction = {
  type: 'open_last_done';
  id?: string;
};

export type ChatRemoveLastDoneAction = {
  type: 'remove_last_done';
  id?: string;
  label?: string;
};

export type ChatUpdateClassPackAction = {
  type: 'update_class_pack';
  id?: string;
  title?: string;
  patch: {
    title?: string;
    total?: number | string;
    months?: number | string;
    startsOn?: string;
    endsOn?: string;
    assignedTo?: string;
    personId?: string;
  };
};

/** Correct a household member's name ("it's Saara, not Sara"). */
export type ChatRenamePersonAction = {
  type: 'rename_person';
  /** Current (wrong) name as stored. */
  from?: string;
  /** Corrected name. */
  to: string;
};

/** Log a recurring subscription. */
export type ChatAddSubscriptionAction = {
  type: 'add_subscription';
  title: string;
  amount: number | string;
  currency?: string;
  /** weekly | monthly | yearly */
  cycle?: string;
  /** YYYY-MM-DD next renewal */
  renewsOn?: string;
  /** streaming | software | fitness | cloud | news | other */
  category?: string;
  provider?: string;
  note?: string;
  assignedTo?: string;
  personId?: string;
};

export type ChatUpdateSubscriptionAction = {
  type: 'update_subscription';
  id: string;
  patch: {
    title?: string;
    amount?: number | string;
    currency?: string;
    cycle?: string;
    renewsOn?: string;
    category?: string;
    provider?: string;
    note?: string;
  };
};

export type ChatRemoveSubscriptionAction = {
  type: 'remove_subscription';
  id?: string;
  title?: string;
};

export type ChatRemoveHabitAction = {
  type: 'remove_habit';
  id?: string;
  title?: string;
};

export type ChatRemoveClassPackAction = {
  type: 'remove_class_pack';
  id?: string;
  title?: string;
};

/** Check in a habit (create if missing when createIfMissing). */
export type ChatHabitCheckInAction = {
  type: 'habit_check_in';
  title: string;
  date?: string;
  why?: string;
  createIfMissing?: boolean;
  /** Optional Thing to link (and log Last Done on check-in). */
  inventoryItemId?: string;
  assignedTo?: string;
  personId?: string;
};

/** Enroll a finite class pack (24 sessions in 3 months). */
export type ChatAddClassPackAction = {
  type: 'add_class_pack';
  title: string;
  total?: number | string;
  months?: number | string;
  startsOn?: string;
  endsOn?: string;
  assignedTo?: string;
  personId?: string;
};

/** Log attendance against an existing class pack. */
export type ChatLogClassAction = {
  type: 'log_class';
  title?: string;
  id?: string;
  date?: string;
  assignedTo?: string;
  personId?: string;
};

export type ChatNoneAction = { type: 'none' };

export type ChatAction =
  | ChatAddAction
  | ChatUpdateAction
  | ChatRemoveAction
  | ChatOpenAction
  | ChatOpenExpenseAction
  | ChatOpenHabitAction
  | ChatOpenSubscriptionAction
  | ChatOpenClassAction
  | ChatOpenLastDoneAction
  | ChatLogDoneAction
  | ChatSetReminderAction
  | ChatRemoveLastDoneAction
  | ChatAddExpenseAction
  | ChatUpdateExpenseAction
  | ChatRemoveExpenseAction
  | ChatAddSubscriptionAction
  | ChatUpdateSubscriptionAction
  | ChatRemoveSubscriptionAction
  | ChatHabitCheckInAction
  | ChatRemoveHabitAction
  | ChatAddClassPackAction
  | ChatUpdateClassPackAction
  | ChatLogClassAction
  | ChatRemoveClassPackAction
  | ChatRenamePersonAction
  | ChatNoneAction;

export type ChatAgentResponse = {
  reply: string;
  actions: ChatAction[];
};
