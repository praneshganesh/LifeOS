import { Platform } from 'react-native';

/** Blur the focused element so modals don't hide focus behind aria-hidden. */
export function blurActiveElement() {
  if (Platform.OS !== 'web') return;
  if (typeof document === 'undefined') return;
  const el = document.activeElement;
  if (el instanceof HTMLElement) el.blur();
}
