import { Platform, type TextStyle } from 'react-native';

/** Blur the focused element so modals don't hide focus behind aria-hidden. */
export function blurActiveElement() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}

/** Kill the browser’s blue focus ring. Pair with our own border color. */
export const noFocusRing: TextStyle =
  Platform.OS === 'web'
    ? ({ outlineStyle: 'none', outlineWidth: 0, boxShadow: 'none' } as unknown as TextStyle)
    : {};
