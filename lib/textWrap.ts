/**
 * Soften awkward line breaks for body copy (chat, notes, titles).
 * Keeps clock tokens and similar short pairs on one line.
 */
export function softenLineWrap(text: string): string {
  if (!text) return text;
  return (
    text
      // 5 pm / 9:00 AM / 12 p.m.
      .replace(
        /(\d{1,2}(?::\d{2})?)\s+(a\.?m\.?|p\.?m\.?)\b/gi,
        (_, clock: string, meridiem: string) => `${clock}\u00a0${meridiem}`
      )
      // $50 / AED 12 — keep code + amount together when spaced
      .replace(
        /\b([A-Z]{3})\s+(\d[\d,]*(?:\.\d+)?)\b/g,
        (_, code: string, amount: string) => `${code}\u00a0${amount}`
      )
      .replace(
        /(\$|€|£)\s+(\d[\d,]*(?:\.\d+)?)\b/g,
        (_, sym: string, amount: string) => `${sym}\u00a0${amount}`
      )
  );
}
