/**
 * LifeOS Chat API proxy — keeps OPENAI_API_KEY off the device.
 * Run: npm run chat-api
 *
 * Cost notes (gpt-4o-mini ~ $0.15 / 1M in, $0.60 / 1M out):
 * - One completion per user turn (no second brand-normalize call).
 * - Short system + one few-shot; inventory capped; history capped.
 * - Logs estimated USD per request so spend is visible in the terminal.
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  bearerToken,
  clientIp,
  corsHeaders,
  createLimiter,
  originAllowed,
  parseOriginList,
  tokenOk,
} from './guard.mjs';
import { repairHeardBrand } from './brands.mjs';
import { ensureClassActions, classTitleFromUtterance, looksLikeClassAttendance } from './classes.mjs';
import { ensureReminderActions } from './reminders.mjs';

const PORT = Number(process.env.PORT || process.env.CHAT_API_PORT || 8787);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
/** Rough list prices USD / 1M tokens — override via env if you change models */
const PRICE_IN = Number(process.env.OPENAI_PRICE_IN_PER_M || 0.15);
const PRICE_OUT = Number(process.env.OPENAI_PRICE_OUT_PER_M || 0.6);
const MAX_BODY_BYTES = Number(process.env.CHAT_API_MAX_BODY || 65_536);
const OPENAI_TIMEOUT_MS = Number(process.env.CHAT_API_OPENAI_TIMEOUT_MS || 20_000);
const CORS_ALLOWLIST = parseOriginList(process.env.CHAT_API_CORS_ORIGINS);
const API_TOKEN = process.env.CHAT_API_TOKEN?.trim() || '';
const PUBLIC_METRICS =
  process.env.CHAT_API_PUBLIC_METRICS === '1' ||
  process.env.NODE_ENV !== 'production';
const limiter = createLimiter({
  rpm: Number(process.env.CHAT_API_RPM || 30),
  daily: Number(process.env.CHAT_API_DAILY_MAX || 200),
});

let sessionSpendUsd = 0;
let sessionCalls = 0;

function loadDotEnv() {
  const path = resolve(process.cwd(), '.env');
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadDotEnv();

/** Keep this stable + under ~600 tokens so prompt cache can kick in. */
const SYSTEM = `LifeOS home-inventory + spend assistant for voice/chat. Reply in 1 short real English sentence (never the word "none").

ASR often mangles brand and store names. When the real manufacturer or retailer is clear from context, store the correct common spelling and reply with that. If it is not a clear match, keep what they said — never invent a brand or merchant.

Defaults: coffee/espresso → Kitchen / Appliances. Laptops/phones/headphones → room Personal (never Personal Documents — that is for passports/IDs only). Rooms: Kitchen, Living Room, Bedroom, Utility, Vehicles, Personal, Family, Personal Documents.
Ownership: assign ONLY if Household JSON in this request has that person (match name or id). Never invent people, never copy example names (there is no Ananya unless they are in Household). Things: if they did not name someone, omit assignedTo and personId. Habits, class packs, attendance, reminders: first-person (“I walked”, “I attended”, “I enrolled”, “remind me”) with no other person named → the household member whose relation is You (include that id + name). Never log another adult’s class or habit as theirs. “My son’s swimming” → that child only.
On add_item for appliances/electronics: include "manualUrl" when you know a real https manufacturer support/manual page (e.g. Apple → https://support.apple.com). Never invent fake product-PDF URLs. Omit if unsure.

Facts (critical):
- Answer ONLY from Inventory + LastDone + Expenses + Habits + Subscriptions JSON in this request.
- Inventory fields may include price, purchasedFrom, purchaseDate, addedAt, warrantyExpiry, expiryDate, serial, assignedTo, room, recentEvents.
- Expenses fields: title, amount, currency, category, date, merchant.
- Habits fields: title, assignedTo, category, streak, doneToday, rate30.
- Class packs fields: title, assignedTo, total, used, remaining, startsOn, endsOn.
- Subscriptions fields: title, amount, currency, cycle, renewsOn, category, provider.
- If a field is missing, say it isn’t recorded — NEVER invent dates, prices, stores, warranty lengths, serials, service history, spend totals, streaks, remaining classes, or renewals.
- Spend questions ("how much did I spend", "food this month") → sum/filter Expenses only; if empty, say nothing is logged yet.
- Recurring / "what do I pay for Netflix" / monthly subscriptions → Subscriptions JSON only.
- Habit streak / "did I walk" → Habits JSON only.
- Class packs / "how many skating classes left" / remaining sessions → Classes JSON only.
- Optional insight: if they ask about unnecessary spend, compare recent Expenses to owned Inventory cautiously — never invent.
- "when did I add it" → use addedAt (LifeOS add date), not a made-up purchase date.
- "where did I buy it" → purchasedFrom only.
- "where is X" → room only.
- "how long is the warranty" → warrantyExpiry only.
- passport / document expiry → expiryDate, else warrantyExpiry. Never invent.
- "when did I last service/maintain X" → LastDone rows with matching itemId/itemName, or recentEvents on the item; if neither matches, say you don’t have a service log.
- User says they serviced/maintained/descaled something → log_done { label, inventoryItemId?, doneAt? } (prefer inventory id from Inventory JSON).
- reminder / "remind me" / "log a reminder" → set_reminder { label, remindAt, inventoryItemId? }. remindAt YYYY-MM-DD ("next Tuesday" → that date). Not log_done. Link Inventory id when they name a Thing (passport).

Actions:
- durable goods (laptop, machine, headphones, passport) → add_item (name, brand?, room?, category?, price?, purchasedFrom?, warrantyExpiry?, manualUrl?, assignedTo?, personId?). warrantyExpiry YYYY-MM-DD; year-only "until 2028" → 2028-12-31. Omit condition unless they said used/refurbished/etc — never invent Good. "I got a new X" is not a condition.
- spent/paid/coffee run/groceries/bill (one-off consumable spend, not a Thing) → add_expense { title, amount, currency?, category?, date?, merchant?, assignedTo?, personId? } categories: food|transport|home|shopping|health|travel|bills|entertainment|other. "at/in/from STORE for X" or "got X from STORE for N dirhams" → always set merchant to STORE (keep spelling if ASR is unclear; normalize only when the real retailer is obvious). Dirhams → currency AED. Named person ("for Aarav") → that personId. Vague "show/open that/show me" after ANY successful action → open that same record using session focus (kind + id). Never open an unrelated Thing.
- refine an expense (change amount/merchant/title of yogurt, coffee, groceries already in Expenses JSON) → update_expense { id, patch: { amount?, currency?, merchant?, title?, date?, category? } }. Never update_item for consumable spend. Dirhams → amount number + currency AED.
- delete an expense ("delete that juice", "remove the coffee spend") → remove_expense { id } from Expenses JSON. Never remove_item for spend. Vague "delete that" uses session focus.
- recurring subscription ("I pay for Netflix", "Spotify is AED 22/month") → add_subscription { title, amount, currency?, cycle?, renewsOn?, category?, provider?, assignedTo?, personId? } cycle: weekly|monthly|yearly; categories: streaming|software|fitness|cloud|news|other
- change/cancel a subscription → update_subscription { id, patch } or remove_subscription { id } from Subscriptions JSON. Never update_item / remove_item for a subscription.
- habit check-in ("I walked", "mark gym done", "did meditation") → habit_check_in { title, date?, why?, createIfMissing?, inventoryItemId?, assignedTo?, personId? } (default createIfMissing true). First-person with no other name → You. Never check in someone else’s habit of the same title. Delete a habit → remove_habit { id }.
- enrolled in a class pack ("I enrolled for swimming", "24 skating classes in 3 months") → add_class_pack { title, total?, months?, endsOn?, assignedTo?, personId? }. Create even if they omit the count. ASR "12th classes" → total 12. Not a habit. Not a lookup. First-person enroll → You; “my son” → that child. Never also habit_check_in on enroll. Change pack size → update_class_pack { id, patch: { total? } }. Cancel a pack → remove_class_pack { id }.
- attended a class ("I attended", "went to skating") → log_class { title?, id?, date?, assignedTo?, personId? } only if Classes JSON has a pack for that person (or one unassigned pack). If Classes JSON is empty, do not log_class. Never invent a pack from attendance. Never log another adult’s pack.
- refine Thing (store/price/warranty/date/serial/name) → update_item { id, patch } (patch may include purchaseDate, warrantyExpiry, serial, purchasedFrom, price). If user gives price → "AED 800" for dirhams; Sharafdg→Sharaf DG.
- service/maintain/descale/filter change → log_done { label, inventoryItemId?, doneAt? }
- reminder ("remind me next Tuesday", "log a reminder to renew passport") → set_reminder { label, remindAt, inventoryItemId?, assignedTo?, personId? }. remindAt YYYY-MM-DD. Do not refuse — LifeOS stores this on Last Done.
- delete a Last Done activity / reminder → remove_last_done { id } from LastDone JSON.
- delete/sold a Thing → remove_item { id } (reply with count). "Did you delete?" → none only, do not remove again.
- show/open a Thing → open_item { id } (use focus item id; never omit id)
- show/open an expense → open_expense { id } (use focus expense id after spend)
- show/open a habit → open_habit { id }
- show/open a subscription → open_subscription { id }
- show/open a class pack → open_class { id }
- show/open a Last Done activity → open_last_done { id }
- questions → none

JSON only: { "reply": string, "actions": Action[] }`;

/** Single few-shot — enough to teach shape without burning tokens every turn. */
const FEW_SHOT = [
  {
    role: 'user',
    content: 'I got a new MacBook Air',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      reply: 'Added MacBook Air.',
      actions: [
        {
          type: 'add_item',
          name: 'MacBook Air',
          brand: 'Apple',
          room: 'Personal',
          category: 'Electronics',
          manualUrl: 'https://support.apple.com',
        },
      ],
    }),
  },
];

function applyCors(req, res) {
  const origin = req.headers.origin;
  const headers = corsHeaders(origin, CORS_ALLOWLIST);
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('payload too large'), { code: 'PAYLOAD' }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolveBody(raw ? JSON.parse(raw) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function json(req, res, status, body) {
  applyCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function estimateCostUsd(usage) {
  const inn = Number(usage?.prompt_tokens || 0);
  const out = Number(usage?.completion_tokens || 0);
  return (inn * PRICE_IN + out * PRICE_OUT) / 1_000_000;
}

function sanitizeReply(reply, actions) {
  const trimmed = typeof reply === 'string' ? reply.trim() : '';
  if (trimmed && !/^(none|null|undefined|n\/a)$/i.test(trimmed)) return trimmed;
  const types = (Array.isArray(actions) ? actions : []).map((a) => a?.type);
  if (types.includes('open_item')) return 'Opening that item.';
  if (types.includes('add_item')) return 'Added to your inventory.';
  if (types.includes('add_expense')) return 'Logged that expense.';
  if (types.includes('add_subscription')) return 'Added that subscription.';
  if (types.includes('habit_check_in')) return 'Checked in.';
  if (types.includes('add_class_pack')) return 'Added that class pack.';
  if (types.includes('log_class')) return 'Logged that class.';
  if (types.includes('update_item')) return 'Updated.';
  if (types.includes('log_done')) return 'Logged that.';
  if (types.includes('set_reminder')) return 'Reminder set.';
  if (types.includes('remove_item')) return 'Removed from your inventory.';
  return 'Anything else?';
}

/** Pull store from "from/at/in STORE for …" — keep spelling as spoken (no rewrite map). */
function merchantFromUtterance(text) {
  const t = String(text || '');
  if (!t.trim()) return undefined;
  const m = t.match(
    /\b(?:at|in|from|@)\s+([A-Za-z][A-Za-z .']{1,40}?)(?:\s+for\b|\s+on\b|\s+\d|,|\.|$)/i
  );
  if (!m?.[1]) return undefined;
  const candidate = m[1].trim();
  if (/^(aed|dirhams?|dhs|dh|euros?|dollars?|cash|card)$/i.test(candidate)) {
    return undefined;
  }
  return candidate
    .split(/\s+/)
    .filter(Boolean)
    .map((w) =>
      w.length <= 3 ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
    )
    .join(' ');
}

function formatExpenseAmount(amount, currency) {
  const raw = amount != null ? String(amount).trim() : '';
  if (!raw) return '';
  const numMatch = raw.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  const n = numMatch ? Number(numMatch[1]) : NaN;
  const pretty = Number.isFinite(n)
    ? n.toLocaleString('en-US', { maximumFractionDigits: 2 })
    : raw;
  const cur = String(currency || '').trim().toUpperCase();
  if (cur) return `${cur} ${pretty}`;
  if (/\b(aed|dirhams?|dhs|dh)\b/i.test(raw)) return `AED ${pretty}`;
  if (/^\d+(\.\d+)?$/.test(raw)) return `AED ${pretty}`;
  return raw;
}

/** Rebuild add/delete replies from actions so toast matches stored fields. */
function alignReplyWithActions(reply, actions) {
  const list = Array.isArray(actions) ? actions : [];
  const add = list.find((a) => a?.type === 'add_item' && a.name);
  if (add) {
    const bits = [`Added ${add.name}`];
    if (add.price) bits.push(String(add.price));
    if (add.purchasedFrom) bits.push(`from ${add.purchasedFrom}`);
    const w = String(add.warrantyExpiry || '').trim();
    if (w) {
      const shown = /^\d{4}-12-31$/.test(w) ? w.slice(0, 4) : w;
      bits.push(`warranty until ${shown}`);
    }
    return `${bits.join(' — ')}.`;
  }
  const expense = list.find((a) => a?.type === 'add_expense' && a.title);
  if (expense) {
    const at = expense.merchant ? ` at ${expense.merchant}` : '';
    const amt = formatExpenseAmount(expense.amount, expense.currency);
    return amt
      ? `Logged ${expense.title}${at} — ${amt}.`
      : `Logged expense: ${expense.title}${at}.`;
  }
  const expenseUpdate = list.find((a) => a?.type === 'update_expense' && a.id);
  if (expenseUpdate) {
    const amt = formatExpenseAmount(
      expenseUpdate.patch?.amount,
      expenseUpdate.patch?.currency
    );
    const title = expenseUpdate.patch?.title || 'expense';
    const at = expenseUpdate.patch?.merchant
      ? ` at ${expenseUpdate.patch.merchant}`
      : '';
    return amt ? `Updated ${title}${at} — ${amt}.` : `Updated ${title}${at}.`;
  }
  const expenseRemove = list.find((a) => a?.type === 'remove_expense');
  if (expenseRemove) return 'Deleted that expense.';
  const openExp = list.find((a) => a?.type === 'open_expense');
  if (openExp) return 'Opening that expense.';
  const sub = list.find((a) => a?.type === 'add_subscription' && a.title);
  if (sub) {
    const amt = formatExpenseAmount(sub.amount, sub.currency);
    return amt ? `Added ${sub.title} — ${amt}.` : `Added subscription: ${sub.title}.`;
  }
  const habit = list.find((a) => a?.type === 'habit_check_in' && a.title);
  if (habit) return `Checked in ${habit.title}.`;
  const pack = list.find((a) => a?.type === 'add_class_pack' && a.title);
  if (pack) {
    const bits = [`Added ${pack.title}`];
    if (pack.assignedTo) bits.push(`for ${pack.assignedTo}`);
    if (pack.total) bits.push(`${pack.total} classes`);
    return `${bits.join(' — ')}.`;
  }
  const logged = list.find((a) => a?.type === 'log_class');
  if (logged) return logged.title ? `Logged ${logged.title}.` : 'Logged that class.';
  const reminder = list.find((a) => a?.type === 'set_reminder' && a.label);
  if (reminder) {
    return reminder.remindAt
      ? `Reminder set: ${reminder.label} — ${reminder.remindAt}.`
      : `Reminder set: ${reminder.label}.`;
  }
  const removes = list.filter((a) => a?.type === 'remove_item' && a.id);
  if (removes.length === 1) return 'Deleted 1 item from your inventory.';
  if (removes.length > 1) {
    return `Deleted ${removes.length} items from your inventory.`;
  }
  return sanitizeReply(reply, list);
}

function inventoryIds(summary) {
  return new Set(
    (Array.isArray(summary) ? summary : [])
      .map((i) => i?.id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  );
}

function yearOrIsoToExpiry(raw) {
  const s = String(raw || '').trim();
  if (!s || s === '—' || s === '-') return undefined;
  if (/^\d{4}$/.test(s)) return `${s}-12-31`;
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return iso ? iso[1] : undefined;
}

function warrantyExpiryFromUtterance(text) {
  if (!text) return undefined;
  const m = String(text).match(
    /\b(?:warranty|guarantee)\b[\s\S]{0,48}?\b(?:until|till|through|to)\s+(\d{4}(?:-\d{2}-\d{2})?)\b/i
  );
  if (!m) return undefined;
  return yearOrIsoToExpiry(m[1]);
}

function statedCondition(raw, utterance) {
  const c = String(raw || '').trim();
  if (!c || c === '—' || c === '-') return undefined;
  const mentioned =
    /\b(condition|used|second[\s-]?hand|refurbished|excellent|fair|poor|mint|brand[\s-]?new)\b/i.test(
      utterance || ''
    );
  if (!mentioned && /^(good|new)$/i.test(c)) return undefined;
  return c;
}

function expenseIdFromSummary(text, expensesSummary) {
  const list = Array.isArray(expensesSummary) ? expensesSummary : [];
  const t = String(text || '').toLowerCase();
  if (!t || !list.length) return undefined;
  const scored = list
    .map((e) => {
      const title = String(e?.title || '').toLowerCase();
      if (!title) return null;
      if (t.includes(title)) return { id: e.id, score: title.length };
      const words = title.split(/\s+/).filter((w) => w.length > 2);
      if (words.length && words.every((w) => t.includes(w))) {
        return { id: e.id, score: title.length };
      }
      return null;
    })
    .filter(Boolean);
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.id;
}

function looksLikeExpenseRefine(text, expensesSummary) {
  const list = Array.isArray(expensesSummary) ? expensesSummary : [];
  if (!list.length || !String(text || '').trim()) return false;
  if (!/\b(update|change|fix|set|make)\b/i.test(text)) return false;
  if (
    !/\b(price|amount|cost|dirhams?|aed|dhs|merchant|store|category|title|name|date)\b/i.test(
      text
    )
  ) {
    // Still OK if they named an expense title from the list
    if (!expenseIdFromSummary(text, list)) return false;
  }
  return Boolean(expenseIdFromSummary(text, list));
}

function sessionFocusFromBody(session) {
  const raw = session?.focus;
  if (
    raw &&
    typeof raw.kind === 'string' &&
    typeof raw.id === 'string' &&
    raw.id.trim()
  ) {
    return { kind: raw.kind, id: raw.id.trim() };
  }
  if (typeof session?.focusExpenseId === 'string' && session.focusExpenseId) {
    return { kind: 'expense', id: session.focusExpenseId };
  }
  if (typeof session?.focusItemId === 'string' && session.focusItemId) {
    return { kind: 'item', id: session.focusItemId };
  }
  return null;
}

function openActionForFocus(focus) {
  if (!focus?.id) return null;
  switch (focus.kind) {
    case 'expense':
      return { type: 'open_expense', id: focus.id };
    case 'habit':
      return { type: 'open_habit', id: focus.id };
    case 'subscription':
      return { type: 'open_subscription', id: focus.id };
    case 'class':
      return { type: 'open_class', id: focus.id };
    case 'lastDone':
      return { type: 'open_last_done', id: focus.id };
    default:
      return { type: 'open_item', id: focus.id };
  }
}

function removeActionForFocus(focus) {
  if (!focus?.id) return null;
  switch (focus.kind) {
    case 'expense':
      return { type: 'remove_expense', id: focus.id };
    case 'habit':
      return { type: 'remove_habit', id: focus.id };
    case 'subscription':
      return { type: 'remove_subscription', id: focus.id };
    case 'class':
      return { type: 'remove_class_pack', id: focus.id };
    case 'lastDone':
      return { type: 'remove_last_done', id: focus.id };
    default:
      return { type: 'remove_item', id: focus.id };
  }
}

function isVagueShowUtterance(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'");
  return (
    /^(show|open|see|view)(\s+me)?(\s+please)?[.!?]?$/.test(t) ||
    /^(show|open)\s+(it|that|this|me)\b/.test(t) ||
    /^(can you )?(show|open)\s+(me\s+)?(it|that|this)\b/.test(t)
  );
}

function isVagueDeleteUtterance(text) {
  const t = String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[’']/g, "'");
  return /^(delete|remove|forget)(\s+(it|that|this|please))?\s*[.!?]?$/.test(t);
}

function repairActions(actions, { focusItemId, focusExpenseId, sessionFocus, inventorySummary, household, lastUserText, classPacksSummary, expensesSummary }) {
  const ids = inventoryIds(inventorySummary);
  const expenseIds = new Set(
    (Array.isArray(expensesSummary) ? expensesSummary : [])
      .map((e) => e?.id)
      .filter((id) => typeof id === 'string' && id.length > 0)
  );
  const itemFocus = focusItemId || null;
  const expenseFocus =
    (sessionFocus?.kind === 'expense' ? sessionFocus.id : null) ||
    focusExpenseId ||
    null;
  const people = Array.isArray(household) ? household : [];
  const repaired = ensureReminderActions(
    ensureClassActions(actions, lastUserText, classPacksSummary),
    lastUserText,
    inventorySummary
  ).filter((a) => {
    if (!a) return false;
    if (looksLikeClassEnrollment(lastUserText) && a.type === 'habit_check_in') {
      return false;
    }
    return true;
  });

  return repaired.map((a) => {
    if (!a) return a;
    if (a.type === 'update_item' && a.id) {
      const id = String(a.id || '').trim();
      const inInventory = ids.has(id);
      const inExpenses = expenseIds.has(id);
      if (!inInventory && (inExpenses || looksLikeExpenseRefine(lastUserText, expensesSummary))) {
        const matched =
          (inExpenses && id) ||
          expenseIdFromSummary(lastUserText, expensesSummary) ||
          id;
        const patch = {};
        if (a.patch?.price != null && a.patch.price !== '') patch.amount = a.patch.price;
        if (a.patch?.purchasedFrom) patch.merchant = a.patch.purchasedFrom;
        if (a.patch?.name) patch.title = a.patch.name;
        if (a.patch?.category) patch.category = a.patch.category;
        if (a.patch?.purchaseDate) patch.date = a.patch.purchaseDate;
        if (
          !patch.currency &&
          /\b(aed|dirhams?|dhs|dh)\b/i.test(String(lastUserText || a.patch?.price || ''))
        ) {
          patch.currency = 'AED';
        }
        return { type: 'update_expense', id: matched, patch };
      }
    }
    if (a.type === 'add_item') {
      const next = repairHeardBrand({
        name: a.name,
        brand: a.brand,
        category: a.category,
        room: a.room,
      });
      const assigned = String(a.assignedTo || next.assignedTo || '').trim();
      const personId = String(a.personId || next.personId || '').trim();
      const hit = people.find(
        (p) =>
          (personId && p.id === personId) ||
          (assigned &&
            String(p.name || '').toLowerCase() === assigned.toLowerCase())
      );
      const merged = { ...a, ...next };
      const warrantyExpiry =
        yearOrIsoToExpiry(merged.warrantyExpiry) ||
        warrantyExpiryFromUtterance(lastUserText);
      if (warrantyExpiry) merged.warrantyExpiry = warrantyExpiry;
      else delete merged.warrantyExpiry;
      const condition = statedCondition(merged.condition, lastUserText);
      if (condition) merged.condition = condition;
      else delete merged.condition;
      if (!hit) {
        delete merged.assignedTo;
        delete merged.personId;
        return merged;
      }
      return { ...merged, assignedTo: hit.name, personId: hit.id };
    }
    if (a.type === 'add_class_pack' || a.type === 'log_class' || a.type === 'habit_check_in' || a.type === 'set_reminder') {
      const assigned = String(a.assignedTo || '').trim();
      const personId = String(a.personId || '').trim();
      const hit = people.find(
        (p) =>
          (personId && p.id === personId) ||
          (assigned &&
            String(p.name || '').toLowerCase() === assigned.toLowerCase())
      );
      if (!hit) {
        const next = { ...a };
        delete next.assignedTo;
        delete next.personId;
        return next;
      }
      return { ...a, assignedTo: hit.name, personId: hit.id };
    }
    if (
      a.type === 'open_item' ||
      a.type === 'open_expense' ||
      a.type === 'open_habit' ||
      a.type === 'open_subscription' ||
      a.type === 'open_class' ||
      a.type === 'open_last_done'
    ) {
      const text = String(lastUserText || '').toLowerCase();
      const wantsExpense =
        a.type === 'open_expense' ||
        /\b(expense|spend|spending|purchase|receipt)\b/.test(text);
      if (wantsExpense && expenseFocus) {
        let eid = typeof a.id === 'string' ? a.id.trim() : '';
        if (!expenseIds.has(eid)) eid = expenseFocus;
        return { type: 'open_expense', id: eid };
      }
      if (isVagueShowUtterance(lastUserText) && sessionFocus) {
        return openActionForFocus(sessionFocus);
      }
      let id = typeof a.id === 'string' ? a.id.trim() : '';
      if (id === 'FOCUS_ITEM_ID') id = itemFocus || '';
      if (!id || (!ids.has(id) && id !== itemFocus)) {
        if (sessionFocus && sessionFocus.kind !== 'item') {
          return openActionForFocus(sessionFocus);
        }
        id = itemFocus || id;
      }
      return { type: 'open_item', id };
    }
    if (a.type === 'remove_item') {
      const id = String(a.id || '').trim();
      if (id && !ids.has(id) && expenseIds.has(id)) {
        return { type: 'remove_expense', id };
      }
      if ((!id || !ids.has(id)) && isVagueDeleteUtterance(lastUserText) && sessionFocus) {
        return removeActionForFocus(sessionFocus);
      }
    }
    if (a.type === 'add_expense') {
      const next = { ...a };
      const merchant =
        String(a.merchant || '').trim() || merchantFromUtterance(lastUserText) || '';
      if (merchant) next.merchant = merchant;
      else delete next.merchant;
      if (
        !String(next.currency || '').trim() &&
        /\b(aed|dirhams?|dhs|dh)\b/i.test(String(lastUserText || ''))
      ) {
        next.currency = 'AED';
      }
      return next;
    }
    return a;
  });
}

/** Trim inventory payload — keep answerable facts; drop empty placeholders. */
function slimInventory(summary) {
  return (Array.isArray(summary) ? summary : []).slice(0, 20).map((i) => {
    const row = {
      id: i.id,
      name: i.name,
      brand: i.brand,
      room: i.room,
      category: i.category,
    };
    const keep = (k) => {
      const v = i[k];
      if (v == null || v === '' || v === '—') return;
      row[k] = v;
    };
    keep('price');
    keep('purchasedFrom');
    keep('purchaseDate');
    keep('addedAt');
    keep('warrantyExpiry');
    keep('expiryDate');
    keep('serial');
    keep('assignedTo');
    if (typeof i.warrantyActive === 'boolean' && row.warrantyExpiry) {
      row.warrantyActive = i.warrantyActive;
    }
    if (Array.isArray(i.recentEvents) && i.recentEvents.length) {
      row.recentEvents = i.recentEvents.slice(0, 3);
    }
    return row;
  });
}

function slimLastDone(summary) {
  return (Array.isArray(summary) ? summary : [])
    .filter((i) => i && i.activity && (i.lastDone || i.remindAt))
    .slice(0, 20)
    .map((i) => {
      const row = { activity: i.activity };
      if (i.id) row.id = i.id;
      if (i.lastDone) row.lastDone = i.lastDone;
      if (i.remindAt) row.remindAt = i.remindAt;
      if (i.itemId) row.itemId = i.itemId;
      if (i.itemName) row.itemName = i.itemName;
      if (i.assignedTo) row.assignedTo = i.assignedTo;
      return row;
    });
}

function slimExpenses(summary) {
  return (Array.isArray(summary) ? summary : [])
    .filter((e) => e && e.title && typeof e.amount === 'number')
    .slice(0, 30)
    .map((e) => {
      const row = {
        id: e.id,
        title: e.title,
        amount: e.amount,
        currency: e.currency || 'AED',
        category: e.category || 'other',
        date: e.date,
      };
      if (e.merchant) row.merchant = e.merchant;
      if (e.personId) row.personId = e.personId;
      return row;
    });
}

function slimHabits(summary) {
  return (Array.isArray(summary) ? summary : [])
    .filter((h) => h && h.title)
    .slice(0, 25)
    .map((h) => {
      const row = {
        id: h.id,
        title: h.title,
        category: h.category || 'other',
        streak: Number(h.streak) || 0,
        doneToday: Boolean(h.doneToday),
        rate30: Number(h.rate30) || 0,
      };
      if (h.assignedTo) row.assignedTo = h.assignedTo;
      if (h.personId) row.personId = h.personId;
      return row;
    });
}

function slimClassPacks(summary) {
  return (Array.isArray(summary) ? summary : [])
    .filter((p) => p && p.title)
    .slice(0, 20)
    .map((p) => {
      const total = Number(p.total) || 0;
      const used = Number(p.used) || 0;
      const row = {
        id: p.id,
        title: p.title,
        total,
        used,
        startsOn: p.startsOn,
        endsOn: p.endsOn,
      };
      if (total > 0) {
        row.remaining =
          p.remaining != null ? Number(p.remaining) : Math.max(0, total - used);
      }
      if (p.assignedTo) row.assignedTo = p.assignedTo;
      if (p.personId) row.personId = p.personId;
      return row;
    });
}

function slimSubscriptions(summary) {
  return (Array.isArray(summary) ? summary : [])
    .filter((s) => s && s.title && typeof s.amount === 'number')
    .slice(0, 30)
    .map((s) => {
      const row = {
        id: s.id,
        title: s.title,
        amount: s.amount,
        currency: s.currency || 'AED',
        cycle: s.cycle || 'monthly',
        renewsOn: s.renewsOn,
        category: s.category || 'other',
      };
      if (s.provider) row.provider = s.provider;
      if (s.personId) row.personId = s.personId;
      return row;
    });
}

const server = createServer(async (req, res) => {
  applyCors(req, res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const origin = req.headers.origin;
  if (!originAllowed(origin, CORS_ALLOWLIST)) {
    json(req, res, 403, { error: 'Origin not allowed' });
    return;
  }

  const path = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && (path === '/' || path === '/health')) {
    const payload = { ok: true, model: MODEL };
    if (PUBLIC_METRICS) {
      payload.sessionCalls = sessionCalls;
      payload.sessionSpendUsd = Number(sessionSpendUsd.toFixed(6));
    }
    json(req, res, 200, payload);
    return;
  }

  if (req.method !== 'POST' || path !== '/chat') {
    json(req, res, 404, { error: 'Not found' });
    return;
  }

  if (!tokenOk(API_TOKEN, bearerToken(req.headers.authorization))) {
    json(req, res, 401, { error: 'Unauthorized' });
    return;
  }

  const limited = limiter.check(clientIp(req));
  if (!limited.ok) {
    res.setHeader('Retry-After', String(limited.retryAfterSec));
    json(req, res, 429, {
      error:
        limited.reason === 'daily'
          ? 'Daily Talk limit reached. Try again tomorrow.'
          : 'Too many Talk requests. Wait a moment.',
    });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    json(req, res, 500, {
      error: 'OPENAI_API_KEY is not set on the chat API server',
    });
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch (err) {
    if (err?.code === 'PAYLOAD') {
      json(req, res, 413, { error: 'Request too large' });
      return;
    }
    json(req, res, 400, { error: 'Invalid JSON body' });
    return;
  }

  const messages = Array.isArray(body.messages) ? body.messages.slice(-8) : [];
  const inventorySummary = slimInventory(body.inventorySummary);
  const lastDoneSummary = slimLastDone(body.lastDoneSummary);
  const expensesSummary = slimExpenses(body.expensesSummary);
  const habitsSummary = slimHabits(body.habitsSummary);
  const classPacksSummary = slimClassPacks(body.classPacksSummary);
  const subscriptionsSummary = slimSubscriptions(body.subscriptionsSummary);
  const household = Array.isArray(body.household) ? body.household.slice(0, 12) : [];
  const focusItemId =
    typeof body.session?.focusItemId === 'string' && body.session.focusItemId
      ? body.session.focusItemId
      : null;
  const focusExpenseId =
    typeof body.session?.focusExpenseId === 'string' && body.session.focusExpenseId
      ? body.session.focusExpenseId
      : null;
  const sessionFocus = sessionFocusFromBody(body.session);

  if (!messages.length) {
    json(req, res, 400, { error: 'messages required' });
    return;
  }

  const focusBits = [];
  if (sessionFocus) {
    focusBits.push(
      `Session focus: kind=${sessionFocus.kind} id=${sessionFocus.id} (vague "show me" / "delete that" / "update that" MUST use this record, never a different module).`
    );
  }
  if (focusExpenseId) {
    focusBits.push(
      `Focus expense id: ${focusExpenseId} (use for "show it" after spend / open_expense).`
    );
  }
  if (focusItemId) {
    focusBits.push(`Focus item id: ${focusItemId} (use for "the item" / open_item).`);
  }
  const focusLine = focusBits.length
    ? focusBits.join(' ')
    : `No focus id. For open_item, name the Thing — do not guess the newest inventory item.`;

  const openAiMessages = [
    { role: 'system', content: SYSTEM },
    ...FEW_SHOT,
    {
      role: 'system',
      content: `${focusLine}\nHousehold people (use id + name for assignedTo/personId):\n${JSON.stringify(household)}\nInventory (newest first):\n${JSON.stringify(inventorySummary)}\nLastDone activities (maintenance/service logs):\n${JSON.stringify(lastDoneSummary)}\nExpenses (newest first):\n${JSON.stringify(expensesSummary)}\nSubscriptions:\n${JSON.stringify(subscriptionsSummary)}\nHabits:\n${JSON.stringify(habitsSummary)}\nClasses (session packs):\n${JSON.stringify(classPacksSummary)}`,
    },
    ...messages.map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content ?? m.text ?? ''),
    })),
  ];

  const oaAbort = new AbortController();
  const oaTimer = setTimeout(() => oaAbort.abort(), OPENAI_TIMEOUT_MS);
  try {
    const oaRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: oaAbort.signal,
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.15,
        max_tokens: 220,
        response_format: { type: 'json_object' },
        messages: openAiMessages,
      }),
    });

    const data = await oaRes.json();
    if (!oaRes.ok) {
      console.error('OpenAI error', data);
      json(req, res, 502, {
        error: data?.error?.message || 'OpenAI request failed',
      });
      return;
    }

    const content = data?.choices?.[0]?.message?.content;
    if (!content) {
      json(req, res, 502, { error: 'Empty model response' });
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      json(req, res, 502, { error: 'Model returned invalid JSON' });
      return;
    }

    if (!Array.isArray(parsed.actions)) parsed.actions = [{ type: 'none' }];
    const lastUser = [...messages].reverse().find((m) => m.role === 'user');
    const lastUserText = String(lastUser?.content ?? lastUser?.text ?? '');
    parsed.actions = repairActions(parsed.actions, {
      focusItemId,
      focusExpenseId,
      sessionFocus,
      inventorySummary,
      household,
      lastUserText,
      classPacksSummary,
      expensesSummary,
    });
    parsed.reply = alignReplyWithActions(parsed.reply, parsed.actions);
    if (
      looksLikeClassAttendance(lastUserText) &&
      !parsed.actions.some((a) => a?.type === 'log_class' || a?.type === 'add_class_pack')
    ) {
      const title = classTitleFromUtterance(lastUserText);
      parsed.reply = title
        ? `There's no ${title} pack yet. Enroll first, then I can log attendance.`
        : `There's no class pack to log against yet.`;
    }

    const cost = estimateCostUsd(data?.usage);
    sessionSpendUsd += cost;
    sessionCalls += 1;
    console.log('[OpenAI]', {
      model: MODEL,
      user: String(lastUser?.content ?? '').slice(0, 100),
      actions: parsed.actions.map((a) => a?.type),
      tokens: data?.usage?.total_tokens,
      prompt: data?.usage?.prompt_tokens,
      completion: data?.usage?.completion_tokens,
      costUsd: Number(cost.toFixed(6)),
      sessionUsd: Number(sessionSpendUsd.toFixed(4)),
      sessionCalls,
      reply: String(parsed.reply).slice(0, 100),
    });

    json(req, res, 200, {
      ...parsed,
      via: 'openai',
      model: MODEL,
      usage: data?.usage,
      costUsd: Number(cost.toFixed(6)),
    });
  } catch (err) {
    const aborted = err?.name === 'AbortError';
    console.error(err);
    json(req, res, aborted ? 504 : 500, {
      error: aborted ? 'Chat service timed out' : 'Chat proxy failed',
    });
  } finally {
    clearTimeout(oaTimer);
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`LifeOS chat API on http://localhost:${PORT}/chat`);
  console.log(`Model: ${MODEL} (≈ $${PRICE_IN}/1M in · $${PRICE_OUT}/1M out)`);
  console.log(
    `Guards: rpm=${process.env.CHAT_API_RPM || 30} daily=${process.env.CHAT_API_DAILY_MAX || 200} token=${API_TOKEN ? 'on' : 'off'} cors=${CORS_ALLOWLIST ? CORS_ALLOWLIST.length : '*'}`
  );
  if (!process.env.OPENAI_API_KEY) {
    console.warn('Warning: OPENAI_API_KEY is missing — requests will fail.');
  }
});
