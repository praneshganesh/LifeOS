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
import { ensureClassActions, classTitleFromUtterance, looksLikeClassAttendance, looksLikeClassEnrollment } from './classes.mjs';
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
const SYSTEM = `Saavi home-inventory + spend assistant for voice/chat. Reply in 1 short real English sentence (never the word "none").

ASR often mangles brand and store names. When the real manufacturer or retailer is clear from context, store the correct common spelling and reply with that. If it is not a clear match, keep what they said — never invent a brand or merchant.

Defaults: coffee/espresso → Kitchen / Appliances. Laptops/phones/headphones → room Personal (never Personal Documents — that is for passports/IDs only). Rooms: Kitchen, Living Room, Bedroom, Utility, Vehicles, Personal, Family, Personal Documents.
Ownership: assign ONLY if Household JSON in this request has that person (match name or id). Never invent people, never copy example names (there is no Ananya unless they are in Household). Exception: if the user explicitly names a person this turn who is NOT in Household (“I enrolled Maya for piano”), keep assignedTo with that exact spoken name and NO personId — the app creates them; never substitute a different household member. Things: if they did not name someone, omit assignedTo and personId. Habits, class packs, attendance, reminders: first-person (“I walked”, “I attended”, “I enrolled”, “remind me”) with no other person named → the household member whose relation is You (include that id + name). Never log another adult’s class or habit as theirs. “My son’s swimming” → that child only.
On add_item for appliances/electronics: include "manualUrl" when you know a real https manufacturer support/manual page (e.g. Apple → https://support.apple.com). Never invent fake product-PDF URLs. Omit if unsure.

Facts (critical):
- Answer ONLY from Inventory + LastDone + Expenses + Habits + Classes + Subscriptions JSON in this request.
- Inventory fields may include price, purchasedFrom, purchaseDate, addedAt, warrantyExpiry, expiryDate, serial, assignedTo, room, recentEvents.
- Expenses fields: title, amount, currency, category, date, merchant.
- Habits fields: title, assignedTo, category, streak, doneToday, rate30.
- Class packs fields: title, assignedTo, total, used, remaining, startsOn, endsOn, scheduleDays, scheduleTime.
- Subscriptions fields: title, amount, currency, cycle, renewsOn, category, provider.
- If a field is missing, say it isn’t recorded — NEVER invent dates, prices, stores, warranty lengths, serials, service history, spend totals, streaks, remaining classes, or renewals.
- Spend questions ("how much did I spend", "food this month") → sum/filter Expenses only; if empty, say nothing is logged yet.
- Recurring / "what do I pay for Netflix" / monthly subscriptions → Subscriptions JSON only.
- Habit streak / "did I walk" → Habits JSON only.
- Class packs / "how many skating classes left" / remaining sessions → Classes JSON only.
- Optional insight: if they ask about unnecessary spend, compare recent Expenses to owned Inventory cautiously — never invent.
- "when did I add it" → use addedAt (Saavi add date), not a made-up purchase date.
- "where did I buy it" → purchasedFrom only.
- "where is X" → room only.
- "how long is the warranty" → warrantyExpiry only.
- passport / document expiry → expiryDate, else warrantyExpiry. Never invent.
- "when did I last service/maintain X" → LastDone rows with matching itemId/itemName, or recentEvents on the item; if neither matches, say you don’t have a service log.
- User says they serviced/maintained/descaled something → log_done { label, inventoryItemId?, doneAt? } (prefer inventory id from Inventory JSON).
- reminder / "remind me" / "log a reminder" → set_reminder { label, remindAt, inventoryItemId?, remindInterval? }. remindAt YYYY-MM-DD ("next Tuesday" → that date). For "every Tuesday and Friday at 6:30am for 8 weeks" / "until December" set remindInterval { unit:"weekdays", weekdays:[2,5], hour:6, minute:30, value:1, endsAt? } (JS weekdays 0=Sun…6=Sat; endsAt YYYY-MM-DD optional — omit for indefinite). Not log_done.

Actions:
- durable goods (laptop, machine, headphones, passport) → add_item (name, brand?, room?, category?, price?, purchasedFrom?, warrantyExpiry?, manualUrl?, assignedTo?, personId?). warrantyExpiry YYYY-MM-DD; year-only "until 2028" → 2028-12-31. Omit condition unless they said used/refurbished/etc — never invent Good. "I got a new X" is not a condition.
- spent/paid/coffee run/groceries/bill (one-off consumable spend, not a Thing) → add_expense { title, amount, currency?, category?, date?, merchant?, assignedTo?, personId? } categories: food|transport|home|shopping|health|travel|bills|entertainment|other. "at/in/from STORE for X" or "got X from STORE for N dirhams" → always set merchant to STORE (keep spelling if ASR is unclear; normalize only when the real retailer is obvious). Named currency words → ISO codes (dirhams→AED, dollars→USD, euros→EUR, pounds→GBP, rupees→INR). If they name no currency, omit currency (app uses Default currency). Named person ("for Aarav") → that personId. Vague "show/open that/show me" after ANY successful action → open that same record using session focus (kind + id). Never open an unrelated Thing.
- refine an expense (change amount/merchant/title of yogurt, coffee, groceries already in Expenses JSON) → update_expense { id, patch: { amount?, currency?, merchant?, title?, date?, category? } }. Never update_item for consumable spend. Spoken currency words → ISO code; otherwise leave currency unset.
- delete an expense ("delete that juice", "remove the coffee spend") → remove_expense { id } from Expenses JSON. Never remove_item for spend. Vague "delete that" uses session focus.
- recurring subscription ("I pay for Netflix", "Spotify is 22 a month") → add_subscription { title, amount, currency?, cycle?, renewsOn?, category?, provider?, assignedTo?, personId? } cycle: weekly|monthly|yearly; categories: streaming|software|fitness|cloud|news|other. Same currency rules as expenses.
- change/cancel a subscription → update_subscription { id, patch } or remove_subscription { id } from Subscriptions JSON. Never update_item / remove_item for a subscription.
- habit check-in ("I walked", "mark gym done", "did meditation") → habit_check_in { title, date?, why?, createIfMissing?, inventoryItemId?, assignedTo?, personId? } (default createIfMissing true). First-person with no other name → You. Never check in someone else’s habit of the same title. Delete a habit → remove_habit { id }.
- enrolled in a class pack ("I enrolled for swimming", "24 skating classes in 3 months", "Ishaan has skating at 10 AM on Saturdays, 12 classes before November, 6 already done") → add_class_pack { title, total?, completed?, scheduleDays?, scheduleTime?, months?, startsOn?, endsOn?, assignedTo?, personId? }. scheduleDays: array of lowercase days e.g. ["saturday"] or ["monday", "wednesday"]. scheduleTime: formatted time e.g. "10:00 AM". completed: number of classes already completed / done so far (e.g. 6). Create even if they omit the count. ASR "12th classes" → total 12. Not a habit. Not a lookup. First-person enroll → You; “my son” → that child. Never also habit_check_in on enroll. Dates: endsOn/startsOn are YYYY-MM-DD and must be today or later — "before November" → the NEXT upcoming 1 November (never a past year); omit startsOn unless they said when it starts. Change pack size/schedule/completed count → update_class_pack { id, patch: { total?, completed?, scheduleDays?, scheduleTime? } }. Reassign a pack to someone else → update_class_pack { id, patch: { assignedTo } }. Cancel a pack → remove_class_pack { id }.
- correcting a person's NAME ("that's spelled with double A", "it's Saara not Sara", "S-A-A-R-A") → rename_person { from, to }. from = the CURRENT name of the Household member being corrected, copied from Household JSON (ASR may misspell the name again this turn — match it to the closest member; use session focus when they don't repeat the name). to = the intended spelling: a letter-by-letter spelling wins; otherwise apply the spoken instruction to that member's stored name (e.g. "double A" doubles the a, "two Ts" doubles the t) — never assume this turn's transcript spelling is what is stored. Never treat a name correction as update_class_pack, add_class_pack, or a new person.
- attended a class ("I attended", "went to skating") → log_class { title?, id?, date?, assignedTo?, personId? } only if Classes JSON has a pack for that person (or one unassigned pack). If Classes JSON is empty, do not log_class. Never invent a pack from attendance. Never log another adult’s pack.
- refine Thing (store/price/warranty/date/serial/name) → update_item { id, patch } (patch may include purchaseDate, warrantyExpiry, serial, purchasedFrom, price). If user gives price with a currency word → include that ISO code in the price string; bare numbers use Default currency. Sharafdg→Sharaf DG.
- service/maintain/descale/filter change → log_done { label, inventoryItemId?, doneAt? }
- reminder ("remind me next Tuesday", "every Tuesday and Friday at 6:30 AM", "log a reminder to renew passport") → set_reminder { label, remindAt, remindInterval?, inventoryItemId?, assignedTo?, personId? }. remindAt YYYY-MM-DD. Recurring weekdays use remindInterval.unit "weekdays". Do not refuse — Saavi stores this on Last Done.
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
  if (types.includes('open_expense')) return 'Opening that expense.';
  if (types.includes('open_habit')) return 'Opening that habit.';
  if (types.includes('open_subscription')) return 'Opening that subscription.';
  if (types.includes('open_class')) return 'Opening that class.';
  if (types.includes('open_last_done')) return 'Opening that activity.';
  if (types.includes('add_item')) return 'Added to your inventory.';
  if (types.includes('update_item')) return 'Updated.';
  if (types.includes('remove_item')) return 'Removed from your inventory.';
  if (types.includes('add_expense')) return 'Logged that expense.';
  if (types.includes('update_expense')) return 'Updated that expense.';
  if (types.includes('remove_expense')) return 'Deleted that expense.';
  if (types.includes('add_subscription')) return 'Added that subscription.';
  if (types.includes('update_subscription')) return 'Updated that subscription.';
  if (types.includes('remove_subscription')) return 'Deleted that subscription.';
  if (types.includes('habit_check_in')) return 'Checked in.';
  if (types.includes('remove_habit')) return 'Deleted that habit.';
  if (types.includes('add_class_pack')) return 'Added that class pack.';
  if (types.includes('update_class_pack')) return 'Updated that class pack.';
  if (types.includes('remove_class_pack')) return 'Deleted that class pack.';
  if (types.includes('log_class')) return 'Logged that class.';
  if (types.includes('log_done')) return 'Logged that.';
  if (types.includes('set_reminder')) return 'Reminder set.';
  if (types.includes('remove_last_done')) return 'Deleted that activity.';
  if (types.includes('rename_person')) return 'Updated that name.';
  return 'Anything else?';
}

/** Pull store from "from/at/in STORE for …" — keep spelling as spoken (no rewrite map). */
export function merchantFromUtterance(text) {
  const t = String(text || '');
  if (!t.trim()) return undefined;
  const m = t.match(
    /\b(?:at|in|from|@)\s+([A-Za-z][A-Za-z .']{1,40}?)(?:\s+(?:for|on|this|today|yesterday|\d)\b|,|\.|$)/i
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

export function formatExpenseAmount(amount, currency, defaultCurrency = '') {
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
  if (/\b(usd|dollars?|\$)\b/i.test(raw)) return `USD ${pretty}`;
  if (/\b(eur|euros?|€)\b/i.test(raw)) return `EUR ${pretty}`;
  if (/\b(gbp|pounds?|£)\b/i.test(raw)) return `GBP ${pretty}`;
  const fallback = String(defaultCurrency || '').trim().toUpperCase();
  if (fallback && /^\d+(\.\d+)?$/.test(raw.replace(/,/g, ''))) {
    return `${fallback} ${pretty}`;
  }
  return raw;
}

/** Rebuild add/delete replies from actions so toast matches stored fields. */
export function alignReplyWithActions(reply, actions) {
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

export function expenseIdFromSummary(text, expensesSummary) {
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
  return /^(delete|remove|forget|cancel)(\s+(it|that|this|please))?\s*[.!?]?$/.test(t);
}

export function currencyFromUtterance(text) {
  const s = String(text || '');
  if (/\b(aed|dirhams?|dhs|dh)\b/i.test(s)) return 'AED';
  if (/\b(usd|dollars?|\$)\b/i.test(s)) return 'USD';
  if (/\b(eur|euros?|€)\b/i.test(s)) return 'EUR';
  if (/\b(gbp|pounds?|£)\b/i.test(s)) return 'GBP';
  if (/\b(inr|rupees?)\b/i.test(s)) return 'INR';
  if (/\b(sar|riyals?)\b/i.test(s)) return 'SAR';
  return '';
}

function repairExpenseItemAction(a, { ids, expenseIds, lastUserText, expensesSummary }) {
  if (a.type !== 'update_item' || !a.id) return a;
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
      currencyFromUtterance(String(lastUserText || a.patch?.price || ''))
    ) {
      patch.currency = currencyFromUtterance(
        String(lastUserText || a.patch?.price || '')
      );
    }
    return { type: 'update_expense', id: matched, patch };
  }
  return a;
}

function repairAddItemAction(a, { people, lastUserText }) {
  if (a.type !== 'add_item') return a;
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

function repairPeopleAction(a, { people, lastUserText }) {
  if (
    a.type !== 'add_class_pack' &&
    a.type !== 'log_class' &&
    a.type !== 'habit_check_in' &&
    a.type !== 'set_reminder'
  ) {
    return a;
  }
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
    // Keep a name the user actually spoke this turn — the app creates
    // that person instead of silently reassigning to self.
    if (
      assigned &&
      String(lastUserText || '')
        .toLowerCase()
        .includes(assigned.toLowerCase())
    ) {
      next.assignedTo = assigned;
    }
    return next;
  }
  return { ...a, assignedTo: hit.name, personId: hit.id };
}

function repairNavigationAction(a, { ids, expenseIds, itemFocus, expenseFocus, sessionFocus, lastUserText }) {
  if (
    a.type !== 'open_item' &&
    a.type !== 'open_expense' &&
    a.type !== 'open_habit' &&
    a.type !== 'open_subscription' &&
    a.type !== 'open_class' &&
    a.type !== 'open_last_done'
  ) {
    return a;
  }
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
  // If the action is specifically open_habit, open_subscription, open_class, open_last_done,
  // do not fallback to open_item unless the original type was open_item.
  if (a.type !== 'open_item') {
    return a;
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

function repairRemovalAction(a, { ids, expenseIds, sessionFocus, lastUserText }) {
  if (a.type !== 'remove_item') return a;
  const id = String(a.id || '').trim();
  if (id && !ids.has(id) && expenseIds.has(id)) {
    return { type: 'remove_expense', id };
  }
  if ((!id || !ids.has(id)) && isVagueDeleteUtterance(lastUserText) && sessionFocus) {
    return removeActionForFocus(sessionFocus);
  }
  return a;
}

function repairAddExpenseAction(a, { lastUserText, defaultCurrency }) {
  if (a.type !== 'add_expense') return a;
  const next = { ...a };
  const merchant =
    String(a.merchant || '').trim() || merchantFromUtterance(lastUserText) || '';
  if (merchant) next.merchant = merchant;
  else delete next.merchant;
  if (!String(next.currency || '').trim()) {
    const spoken = currencyFromUtterance(String(lastUserText || ''));
    if (spoken) next.currency = spoken;
    else if (defaultCurrency) next.currency = defaultCurrency;
  }
  return next;
}

export function repairActions(actions, { focusItemId, focusExpenseId, sessionFocus, inventorySummary, household, lastUserText, classPacksSummary, expensesSummary, defaultCurrency }) {
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
    let action = a;
    action = repairExpenseItemAction(action, { ids, expenseIds, lastUserText, expensesSummary });
    action = repairAddItemAction(action, { people, lastUserText });
    action = repairPeopleAction(action, { people, lastUserText });
    action = repairNavigationAction(action, { ids, expenseIds, itemFocus, expenseFocus, sessionFocus, lastUserText });
    action = repairRemovalAction(action, { ids, expenseIds, sessionFocus, lastUserText });
    action = repairAddExpenseAction(action, { lastUserText, defaultCurrency });
    return action;
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
        currency: e.currency || undefined,
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

export function isIsoDate(value) {
  const s = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
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
      if (Array.isArray(p.scheduleDays) && p.scheduleDays.length) {
        row.scheduleDays = p.scheduleDays;
      }
      if (p.scheduleTime) row.scheduleTime = p.scheduleTime;
      if (p.assignedTo) row.assignedTo = p.assignedTo;
      if (p.personId) row.personId = p.personId;
      return row;
    });
}

/**
 * Lightweight post-repair action validation gate (Priority 2).
 * Ensures invalid or malformed actions never reach the client while preserving valid multi-actions.
 */
export function validateAction(action) {
  if (!action || typeof action !== 'object') return false;
  const type = action.type;
  if (!type || typeof type !== 'string') return false;

  switch (type) {
    case 'none':
      return true;

    case 'add_item':
      return typeof action.name === 'string' && action.name.trim().length > 0;

    case 'update_item':
      return Boolean(
        typeof action.id === 'string' &&
        action.id.trim().length > 0 &&
        action.patch &&
        typeof action.patch === 'object' &&
        Object.keys(action.patch).length > 0
      );

    case 'remove_item':
    case 'open_item':
      return typeof action.id === 'string' && action.id.trim().length > 0;

    case 'add_expense':
      return Boolean(
        typeof action.title === 'string' &&
        action.title.trim().length > 0 &&
        action.amount != null &&
        action.amount !== '' &&
        !Number.isNaN(Number(String(action.amount).replace(/[^0-9.-]/g, ''))) &&
        String(action.amount).replace(/[^0-9.-]/g, '').length > 0
      );

    case 'update_expense':
      return (
        typeof action.id === 'string' &&
        action.id.trim().length > 0 &&
        action.patch &&
        typeof action.patch === 'object' &&
        Object.keys(action.patch).length > 0
      );

    case 'remove_expense':
    case 'open_expense':
      return (
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.title === 'string' && action.title.trim().length > 0)
      );

    case 'add_subscription':
      return (
        typeof action.title === 'string' &&
        action.title.trim().length > 0 &&
        action.amount != null &&
        action.amount !== '' &&
        !Number.isNaN(Number(String(action.amount).replace(/[^0-9.-]/g, '')))
      );

    case 'update_subscription':
      return (
        typeof action.id === 'string' &&
        action.id.trim().length > 0 &&
        action.patch &&
        typeof action.patch === 'object' &&
        Object.keys(action.patch).length > 0
      );

    case 'remove_subscription':
    case 'open_subscription':
      return (
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.title === 'string' && action.title.trim().length > 0)
      );

    case 'habit_check_in':
      return typeof action.title === 'string' && action.title.trim().length > 0;

    case 'remove_habit':
    case 'open_habit':
      return (
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.title === 'string' && action.title.trim().length > 0)
      );

    case 'add_class_pack':
      return typeof action.title === 'string' && action.title.trim().length > 0;

    case 'update_class_pack':
      return (
        ((typeof action.id === 'string' && action.id.trim().length > 0) ||
          (typeof action.title === 'string' && action.title.trim().length > 0)) &&
        action.patch &&
        typeof action.patch === 'object' &&
        Object.keys(action.patch).length > 0
      );

    case 'remove_class_pack':
    case 'open_class':
      return (
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.title === 'string' && action.title.trim().length > 0)
      );

    case 'log_class':
      return Boolean(
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.title === 'string' && action.title.trim().length > 0)
      );

    case 'log_done':
      return typeof action.label === 'string' && action.label.trim().length > 0;

    case 'set_reminder':
      return (
        typeof action.label === 'string' &&
        action.label.trim().length > 0 &&
        isIsoDate(action.remindAt)
      );

    case 'remove_last_done':
    case 'open_last_done':
      return (
        (typeof action.id === 'string' && action.id.trim().length > 0) ||
        (typeof action.label === 'string' && action.label.trim().length > 0)
      );

    case 'rename_person':
      return (
        typeof action.from === 'string' &&
        action.from.trim().length > 0 &&
        typeof action.to === 'string' &&
        action.to.trim().length > 0
      );

    default:
      return false;
  }
}

export function validateActions(actions) {
  if (!Array.isArray(actions)) return [{ type: 'none' }];
  const valid = [];
  for (const action of actions) {
    if (validateAction(action)) {
      valid.push(action);
    } else {
      console.warn('[Chat] rejected invalid action', action);
    }
  }
  const meaningful = valid.filter((a) => a.type !== 'none');
  return meaningful.length ? meaningful : [{ type: 'none' }];
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
        currency: s.currency || undefined,
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
  const defaultCurrency = String(body.defaultCurrency || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 3);
  const focusItemId =
    typeof body.session?.focusItemId === 'string' && body.session.focusItemId
      ? body.session.focusItemId
      : null;
  const focusExpenseId =
    typeof body.session?.focusExpenseId === 'string' && body.session.focusExpenseId
      ? body.session.focusExpenseId
      : null;
  const sessionFocus = sessionFocusFromBody(body.session);

  const rawLocalDate = typeof body.localDate === 'string' ? body.localDate.trim() : '';
  const validLocalDate = isIsoDate(rawLocalDate) ? rawLocalDate : null;
  const today = validLocalDate || new Date().toISOString().slice(0, 10);
  const timezoneStr =
    typeof body.timezone === 'string' && body.timezone.trim()
      ? ` User timezone: ${body.timezone.trim().slice(0, 50)}.`
      : '';

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
      content: `Today is ${today}.${timezoneStr} Resolve relative dates using this local date. Future expressions such as "next Tuesday", "in three months", and "before November" must resolve to the next applicable future date. Historical expressions such as "yesterday", "last Tuesday", and "last month" must remain in the past.\nDefault currency: ${defaultCurrency || 'unset (omit currency unless they named one)'}.\n${focusLine}\nHousehold people (use id + name for assignedTo/personId):\n${JSON.stringify(household)}\nInventory (newest first):\n${JSON.stringify(inventorySummary)}\nLastDone activities (maintenance/service logs):\n${JSON.stringify(lastDoneSummary)}\nExpenses (newest first):\n${JSON.stringify(expensesSummary)}\nSubscriptions:\n${JSON.stringify(subscriptionsSummary)}\nHabits:\n${JSON.stringify(habitsSummary)}\nClasses (session packs):\n${JSON.stringify(classPacksSummary)}`,
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
      defaultCurrency,
    });
    parsed.actions = validateActions(parsed.actions);
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

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('/chat.mjs') || process.argv[1].endsWith('\\chat.mjs'));

if (isDirectRun) {
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
}
