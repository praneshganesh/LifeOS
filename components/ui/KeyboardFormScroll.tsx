import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
  forwardRef,
  useImperativeHandle,
} from 'react';
import {
  Keyboard,
  Platform,
  ScrollView,
  TextInput,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type StyleProp,
  type ViewStyle,
  type ScrollViewProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Extra space under content when the keyboard is closed. */
  bottomExtra?: number;
  style?: StyleProp<ViewStyle>;
} & Pick<
  ScrollViewProps,
  'showsVerticalScrollIndicator' | 'keyboardShouldPersistTaps' | 'keyboardDismissMode'
>;

/**
 * Form scroll that keeps the focused field above the keyboard — Apple-style.
 * Uses keyboard insets + scrolls the focused input into view when the keyboard opens.
 */
export const KeyboardFormScroll = forwardRef<ScrollView, Props>(
  function KeyboardFormScroll(
    {
      children,
      contentContainerStyle,
      bottomExtra = 40,
      style,
      showsVerticalScrollIndicator = false,
      keyboardShouldPersistTaps = 'handled',
      keyboardDismissMode = 'interactive',
    },
    ref
  ) {
    const insets = useSafeAreaInsets();
    const scrollRef = useRef<ScrollView>(null);
    const offsetY = useRef(0);
    const [kbHeight, setKbHeight] = useState(0);

    useImperativeHandle(ref, () => scrollRef.current as ScrollView);

    const ensureFocusedVisible = useCallback(() => {
      const focused = TextInput.State.currentlyFocusedInput?.();
      if (!focused || !scrollRef.current) return;

      // measureInWindow exists on host components; keep a soft cast for RN typings.
      const node = focused as unknown as {
        measureInWindow?: (
          cb: (x: number, y: number, w: number, h: number) => void
        ) => void;
      };
      node.measureInWindow?.((fx: number, fy: number, _fw: number, fh: number) => {
        const scrollHost = scrollRef.current as unknown as {
          measureInWindow?: (
            cb: (x: number, y: number, w: number, h: number) => void
          ) => void;
          scrollTo?: (opts: { y: number; animated?: boolean }) => void;
        };
        scrollHost.measureInWindow?.((sx, sy, _sw, sh) => {
          const gap = 20;
          const fieldBottom = fy + fh;
          const visibleBottom = sy + sh - gap;
          const overlap = fieldBottom - visibleBottom;
          if (overlap > 0) {
            scrollHost.scrollTo?.({
              y: Math.max(0, offsetY.current + overlap),
              animated: true,
            });
          } else if (fy < sy + gap) {
            scrollHost.scrollTo?.({
              y: Math.max(0, offsetY.current - (sy + gap - fy)),
              animated: true,
            });
          }
        });
      });
    }, []);

    useEffect(() => {
      const showEvt =
        Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
      const hideEvt =
        Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

      const show = Keyboard.addListener(showEvt, (e) => {
        setKbHeight(e.endCoordinates.height);
        // Wait for layout to shrink, then bring the field into view.
        setTimeout(ensureFocusedVisible, Platform.OS === 'ios' ? 60 : 120);
      });
      const hide = Keyboard.addListener(hideEvt, () => setKbHeight(0));
      return () => {
        show.remove();
        hide.remove();
      };
    }, [ensureFocusedVisible]);

    const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      offsetY.current = e.nativeEvent.contentOffset.y;
    };

    return (
      <ScrollView
        ref={scrollRef}
        style={style}
        contentContainerStyle={[
          contentContainerStyle,
          {
            paddingBottom:
              Math.max(insets.bottom, 12) +
              bottomExtra +
              // iOS also gets automaticallyAdjustKeyboardInsets; pad a little
              // extra so the focused field isn't glued to the keyboard edge.
              (kbHeight > 0 ? Math.max(kbHeight * 0.08, 24) : 0),
          },
        ]}
        showsVerticalScrollIndicator={showsVerticalScrollIndicator}
        keyboardShouldPersistTaps={keyboardShouldPersistTaps}
        keyboardDismissMode={keyboardDismissMode}
        automaticallyAdjustKeyboardInsets
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        {children}
      </ScrollView>
    );
  }
);
