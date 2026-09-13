/** Merge continuous ASR finals without duplicating growing rewrites of the same phrase. */
export function mergeFinalSpeechPart(parts: string[], next: string): string[] {
  const text = next.trim();
  if (!text) return parts;
  if (!parts.length) return [text];
  const last = parts[parts.length - 1] ?? '';
  if (text === last) return parts;
  if (text.startsWith(last) || last.startsWith(text)) {
    const out = parts.slice(0, -1);
    out.push(text.length >= last.length ? text : last);
    return out;
  }
  // Full re-recognition of the whole utterance so far
  const joined = parts.join(' ');
  if (text.startsWith(joined) || joined.startsWith(text)) {
    return [text.length >= joined.length ? text : joined];
  }
  return [...parts, text];
}
