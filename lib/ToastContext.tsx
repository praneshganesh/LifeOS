import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertCircle, CheckCircle2 } from 'lucide-react-native';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

type ToastTone = 'success' | 'error';

type ToastContextValue = {
  /** Brief confirmation pill ("Saved", "Class pack added"). Auto-dismisses. */
  showToast: (message: string, tone?: ToastTone) => void;
  /** Error pill — longer visible, coral background. */
  showError: (message: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const NATIVE_DRIVER = Platform.OS !== 'web';
const VISIBLE_MS = 1800;
const ERROR_VISIBLE_MS = 3200;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [message, setMessage] = useState('');
  const [tone, setTone] = useState<ToastTone>('success');
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback(
    (msg: string, nextTone: ToastTone = 'success') => {
      setMessage(msg);
      setTone(nextTone);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      Animated.timing(opacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: NATIVE_DRIVER,
      }).start();
      hideTimer.current = setTimeout(
        () => {
          Animated.timing(opacity, {
            toValue: 0,
            duration: 260,
            useNativeDriver: NATIVE_DRIVER,
          }).start(({ finished }) => {
            if (finished) setMessage('');
          });
        },
        nextTone === 'error' ? ERROR_VISIBLE_MS : VISIBLE_MS
      );
    },
    [opacity]
  );

  const showError = useCallback(
    (msg: string) => showToast(msg, 'error'),
    [showToast]
  );

  const value = useMemo(() => ({ showToast, showError }), [showToast, showError]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            {
              opacity,
              bottom: insets.bottom + 84,
              backgroundColor: colors.bgElevated,
              borderColor: tone === 'error' ? colors.coral : colors.line,
            },
          ]}
        >
          {tone === 'error' ? (
            <AlertCircle size={18} color={colors.coral} strokeWidth={2.2} />
          ) : (
            <CheckCircle2 size={18} color={colors.accent} strokeWidth={2.2} />
          )}
          <View style={{ flexShrink: 1 }}>
            <Animated.Text style={[styles.text, { color: colors.ink }]}>
              {message}
            </Animated.Text>
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    maxWidth: '86%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
    zIndex: 200,
  },
  text: {
    fontFamily: fonts.sansMedium,
    fontSize: 15,
  },
});
