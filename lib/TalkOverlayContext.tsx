import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

type TalkOverlayContextValue = {
  open: boolean;
  openTalk: () => void;
  closeTalk: () => void;
  toggleTalk: () => void;
  /** Last item added/updated/opened — survives Talk close so “open the item” works */
  focusItemId: string | null;
  setFocusItemId: (id: string | null) => void;
};

const TalkOverlayContext = createContext<TalkOverlayContextValue | null>(null);

export function TalkOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [focusItemId, setFocusItemId] = useState<string | null>(null);

  const openTalk = useCallback(() => setOpen(true), []);
  const closeTalk = useCallback(() => setOpen(false), []);
  const toggleTalk = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({
      open,
      openTalk,
      closeTalk,
      toggleTalk,
      focusItemId,
      setFocusItemId,
    }),
    [open, openTalk, closeTalk, toggleTalk, focusItemId]
  );

  return (
    <TalkOverlayContext.Provider value={value}>{children}</TalkOverlayContext.Provider>
  );
}

export function useTalkOverlay() {
  const ctx = useContext(TalkOverlayContext);
  if (!ctx) throw new Error('useTalkOverlay must be used within TalkOverlayProvider');
  return ctx;
}
