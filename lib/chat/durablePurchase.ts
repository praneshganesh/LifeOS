import { brandFromName } from '@/lib/brands';
import type { ChatAction } from '@/lib/chat/types';

/** Product nouns that belong in Things, not one-off spend. */
const DURABLE_NOUN =
  /\b(lamps?|lights?|tvs?|televisions?|laptops?|notebooks?|macbooks?|iphones?|ipads?|phones?|tablets?|headphones?|earbuds?|airpods?|watches?|cameras?|fridges?|refrigerators?|washers?|dryers?|dishwashers?|ovens?|microwaves?|vacuums?|routers?|printers?|monitors?|speakers?|keyboards?|mice|mouses?|consoles?|playstations?|xbox(?:es)?|switches?|blenders?|toasters?|kettles?|fans?|projectors?|machines?)\b/i;

/** Clear consumable / service spend — stay as expenses even with a price. */
const CONSUMABLE =
  /\b(coffee|latte|espresso|juice|smoothie|tea|groceries|grocery|lunch|dinner|breakfast|uber|taxi|fuel|petrol|gas|bill|subscription|rent|ticket|tickets|meal|snack|pizza|burger)\b/i;

/**
 * Durable goods with a manufacturer (or a durable product noun) are Things
 * with a purchase price — not expenses. "got a Philips lamp for 50 dollars".
 */
export function looksLikeDurablePurchase(
  title?: string | null,
  utterance?: string | null
): boolean {
  const titleText = String(title || '').trim();
  const spoken = String(utterance || '').trim();
  const blob = `${titleText} ${spoken}`.trim();
  if (!blob) return false;
  if (CONSUMABLE.test(titleText) && !brandFromName(titleText) && !DURABLE_NOUN.test(titleText)) {
    return false;
  }
  if (CONSUMABLE.test(blob) && !brandFromName(blob) && !DURABLE_NOUN.test(blob)) {
    return false;
  }
  const brand =
    brandFromName(titleText) ||
    brandFromName(spoken) ||
    brandFromName(blob);
  if (brand) return true;
  return DURABLE_NOUN.test(blob);
}

/** Rewrite a misclassified add_expense into add_item (+ price). */
export function expenseToDurableItem(
  action: Extract<ChatAction, { type: 'add_expense' }>,
  utterance?: string | null
): Extract<ChatAction, { type: 'add_item' }> | null {
  if (!looksLikeDurablePurchase(action.title, utterance)) return null;
  const title = String(action.title || '').trim();
  if (!title) return null;
  const brand =
    brandFromName(title) ||
    brandFromName(utterance) ||
    undefined;
  const amount = action.amount;
  const currency =
    typeof action.currency === 'string' && /^[A-Z]{3}$/i.test(action.currency.trim())
      ? action.currency.trim().toUpperCase()
      : '';
  let price: string | undefined;
  if (typeof amount === 'number' && Number.isFinite(amount)) {
    price = currency ? `${currency} ${amount}` : String(amount);
  } else if (typeof amount === 'string' && amount.trim()) {
    price = currency && !/^[A-Z]{3}\b/i.test(amount.trim())
      ? `${currency} ${amount.trim()}`
      : amount.trim();
  }
  return {
    type: 'add_item',
    name: title,
    ...(brand ? { brand } : {}),
    ...(price ? { price } : {}),
    ...(action.merchant?.trim() ? { purchasedFrom: action.merchant.trim() } : {}),
  };
}

/** Prefer Thing over expense when the model mis-labels a durable purchase. */
export function coerceDurablePurchases(
  actions: ChatAction[],
  utterance?: string | null
): ChatAction[] {
  const next: ChatAction[] = [];
  let converted = false;
  for (const a of actions) {
    if (!a || a.type === 'none') continue;
    if (a.type === 'add_expense') {
      const item = expenseToDurableItem(a, utterance);
      if (item) {
        next.push(item);
        converted = true;
        continue;
      }
    }
    next.push(a);
  }
  if (!converted) return actions;
  // Drop a redundant add_item that duplicates the converted title.
  const names = new Set(
    next
      .filter((a): a is Extract<ChatAction, { type: 'add_item' }> => a.type === 'add_item')
      .map((a) => a.name.trim().toLowerCase())
  );
  if (names.size <= 1) return next;
  const seen = new Set<string>();
  return next.filter((a) => {
    if (a.type !== 'add_item') return true;
    const key = a.name.trim().toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
