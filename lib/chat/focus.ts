export type TalkFocusKind =
  | 'item'
  | 'expense'
  | 'habit'
  | 'subscription'
  | 'class'
  | 'lastDone';

export type TalkFocus = {
  kind: TalkFocusKind;
  id: string;
};

export function hrefForTalkFocus(focus: TalkFocus): string {
  switch (focus.kind) {
    case 'expense':
      return `/expenses/${focus.id}`;
    case 'habit':
      return `/habits/${focus.id}`;
    case 'subscription':
      return `/subscriptions/${focus.id}`;
    case 'class':
      return `/classes/${focus.id}`;
    case 'lastDone':
      return `/last-done/${focus.id}`;
    default:
      return `/asset/${focus.id}`;
  }
}

export function openingLineForFocus(focus: TalkFocus): string {
  switch (focus.kind) {
    case 'expense':
      return 'Opening that expense.';
    case 'habit':
      return 'Opening that habit.';
    case 'subscription':
      return 'Opening that subscription.';
    case 'class':
      return 'Opening that class pack.';
    case 'lastDone':
      return 'Opening that activity.';
    default:
      return 'Opening that item.';
  }
}

/** Named module in the utterance — not a brand/store map. */
export function talkFocusKindFromUtterance(text?: string): TalkFocusKind | null {
  if (!text?.trim()) return null;
  const t = text.trim().toLowerCase().replace(/[’']/g, "'");
  if (/\b(expense|spend|spending|purchase|receipt)\b/.test(t)) return 'expense';
  if (/\b(habit|streak)\b/.test(t)) return 'habit';
  if (/\bsubscription/.test(t)) return 'subscription';
  if (/\b(class pack|class packs|classes left)\b/.test(t) || /\b(enroll|attendance)\b/.test(t)) {
    return 'class';
  }
  if (/\b(last done|reminder|activity)\b/.test(t)) return 'lastDone';
  if (/\b(item|thing)\b/.test(t)) return 'item';
  return null;
}

export function looksLikeVagueDelete(text?: string): boolean {
  if (!text?.trim()) return false;
  const t = text.trim().toLowerCase().replace(/[’']/g, "'");
  return /^(delete|remove|forget)(\s+(it|that|this|please))?\s*[.!?]?$/.test(t);
}
