import { parseAddIntent } from '@/lib/parseTalkIntent';

/** Local answers from on-device Saavi data — never used for document OCR. */
export function answerFor(q: string, inventoryNames: string[] = []) {
  const lower = q.toLowerCase().trim();
  const names = inventoryNames.map((n) => n.toLowerCase());
  const has = (re: RegExp) => names.some((n) => re.test(n));

  // Add intents are handled by the Chat/Talk conversation layer.
  if (parseAddIntent(q)) {
    return '';
  }

  if (/^(hi|hello|hey|yo|sup)\b/.test(lower)) {
    return 'Hey — what’s new? You can tell me what you bought, or ask about something you already own.';
  }
  if (/thank/.test(lower)) {
    return 'Anytime. I’m here when you add something or need a quick check.';
  }
  if (/how are you|what'?s up/.test(lower)) {
    return 'Doing well. Ready when you are — purchases, warranties, documents, whatever’s on your mind.';
  }

  if (lower.includes('passport')) {
    return has(/passport/)
      ? 'I see a passport in your Things. Open it for the expiry we stored — I won’t invent a date.'
      : 'I don’t see a passport yet — Capture one and I’ll keep track of the expiry.';
  }
  if (lower.includes('warranty')) {
    return 'Warranties live with each item under Things. Tell me the product name and I’ll look for dates we already have.';
  }
  if (lower.includes('coffee') || lower.includes('descale')) {
    return has(/coffee/)
      ? 'There’s a coffee-related item in your Things. Open it, or log descaling under Last Done.'
      : 'No coffee machine on file yet — say “I got a coffee machine” and we’ll add one.';
  }
  if (lower.includes('car') || lower.includes('prado') || lower.includes('insurance')) {
    return has(/prado|car|vehicle|toyota/)
      ? 'There’s a vehicle-related item in your Things. Open it for service and insurance notes we stored.'
      : 'I don’t have a vehicle yet. Say “I got a Prado” (or similar) and we’ll track it.';
  }
  if (lower.includes('document') || lower.includes('eid') || lower.includes('emirates')) {
    return 'For IDs and passports, Capture reads the text automatically. Want to Capture one now?';
  }
  if (
    inventoryNames.length &&
    (lower.includes('added') ||
      lower.includes('captured') ||
      lower.includes('recent') ||
      lower.includes('what do i own') ||
      lower.includes('my things'))
  ) {
    const list = inventoryNames.slice(0, 4).join(', ');
    const more = inventoryNames.length > 4 ? ` (+${inventoryNames.length - 4} more)` : '';
    return `Here’s what’s recent: ${list}${more}. Ask about any of them, or tell me something new you got.`;
  }
  if (lower.includes('added') || lower.includes('captured')) {
    return 'Nothing captured yet. Try “I got headphones” or use Capture for a photo/receipt.';
  }
  if (lower.includes('setting') || lower.includes('profile')) {
    return 'Profile is the avatar up top — Settings lives there too.';
  }
  if (lower.includes('help') || lower.includes('what can you')) {
    return 'Tell me what you bought (“I got a coffee machine”), ask about passport or warranty, or browse Things from the package icon.';
  }

  return 'I work from your Saavi data. Tell me what you got, or ask about a thing you already own.';
}
