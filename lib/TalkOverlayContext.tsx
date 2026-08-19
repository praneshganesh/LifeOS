import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { TalkFocus } from '@/lib/chat/focus';

type TalkOverlayContextValue = {
  open: boolean;
  openTalk: () => void;
  closeTalk: () => void;
  toggleTalk: () => void;
  /** Last module Talk touched — vague “show me” / “delete that” uses this. */
  talkFocus: TalkFocus | null;
  setTalkFocus: (focus: TalkFocus | null) => void;
  /** Last Thing — derived from talkFocus when kind is item */
  focusItemId: string | null;
  setFocusItemId: (id: string | null) => void;
  /** Last expense — derived from talkFocus when kind is expense */
  focusExpenseId: string | null;
  setFocusExpenseId: (id: string | null) => void;
};

const TalkOverlayContext = createContext<TalkOverlayContextValue | null>(null);

export function TalkOverlayProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [talkFocus, setTalkFocus] = useState<TalkFocus | null>(null);

  const openTalk = useCallback(() => setOpen(true), []);
  const closeTalk = useCallback(() => setOpen(false), []);
  const toggleTalk = useCallback(() => setOpen((v) => !v), []);

  const focusItemId = talkFocus?.kind === 'item' ? talkFocus.id : null;
  const focusExpenseId = talkFocus?.kind === 'expense' ? talkFocus.id : null;

  const setFocusItemId = useCallback((id: string | null) => {
    if (id) setTalkFocus({ kind: 'item', id });
    else {
      setTalkFocus((prev) => (prev?.kind === 'item' ? null : prev));
    }
  }, []);

  const setFocusExpenseId = useCallback((id: string | null) => {
    if (id) setTalkFocus({ kind: 'expense', id });
    else {
      setTalkFocus((prev) => (prev?.kind === 'expense' ? null : prev));
    }
  }, []);

  const value = useMemo(
    () => ({
      open,
      openTalk,
      closeTalk,
      toggleTalk,
      talkFocus,
      setTalkFocus,
      focusItemId,
      setFocusItemId,
      focusExpenseId,
      setFocusExpenseId,
    }),
    [
      open,
      openTalk,
      closeTalk,
      toggleTalk,
      talkFocus,
      setFocusItemId,
      setFocusExpenseId,
      focusItemId,
      focusExpenseId,
    ]
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
