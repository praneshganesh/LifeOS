import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Check, Clock, Pencil, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { fonts } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';

const TRIGGER = 88;
const EDIT_W = 68;
const DELETE_W = 76;
const SPRING = { damping: 20, stiffness: 240, overshootClamping: true } as const;

/** Only one row may show Edit / Delete at a time, like iOS lists. */
let closeOpenRow: (() => void) | null = null;

type Props = {
  children: ReactNode;
  /** Full swipe right past the threshold. */
  onComplete?: () => void;
  /** Full swipe left past the threshold. Takes precedence over Edit / Delete. */
  onSnooze?: () => void;
  /**
   * Swipe left reveals Edit / Delete buttons that must be tapped.
   * A swipe alone never deletes; callers still confirm before removing.
   */
  onEdit?: () => void;
  onDelete?: () => void;
  completeLabel?: string;
  snoozeLabel?: string;
  /** Outer shape (radius, margins). The underlay is clipped to it. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Row swipe actions in the style of iOS lists:
 * swipe right to complete, swipe left to snooze or reveal Edit / Delete.
 */
export function SwipeActions({
  children,
  onComplete,
  onSnooze,
  onEdit,
  onDelete,
  completeLabel = 'Done',
  snoozeLabel = 'Snooze',
  style,
}: Props) {
  const { colors } = useTheme();
  const drag = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const canRight = Boolean(onComplete);
  const revealW = onSnooze ? 0 : (onEdit ? EDIT_W : 0) + (onDelete ? DELETE_W : 0);
  const canSnooze = Boolean(onSnooze);
  const canReveal = revealW > 0;

  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = () => {
    drag.value = withSpring(0, SPRING);
    setOpen(false);
  };
  const close = () => closeRef.current();

  const markOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      if (closeOpenRow && closeOpenRow !== closeRef.current) closeOpenRow();
      closeOpenRow = closeRef.current;
    } else if (closeOpenRow === closeRef.current) {
      closeOpenRow = null;
    }
  };

  useEffect(
    () => () => {
      if (closeOpenRow === closeRef.current) closeOpenRow = null;
    },
    []
  );

  const fire = (dir: 'right' | 'left') => {
    if (dir === 'right') onComplete?.();
    else onSnooze?.();
  };

  const pan = Gesture.Pan()
    .enabled(canRight || canSnooze || canReveal)
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      start.value = drag.value;
    })
    .onUpdate((e) => {
      let x = start.value + e.translationX;
      // Completing only starts from a closed row, so an open Edit/Delete
      // tray swipes shut instead of marking the item done.
      if (x > 0 && (!canRight || start.value < 0)) x = 0;
      if (x < 0 && !canSnooze && !canReveal) x = 0;
      if (canReveal && x < -revealW) x = -revealW - (-revealW - x) * 0.15;
      drag.value = x;
    })
    .onEnd(() => {
      if (drag.value > TRIGGER && start.value >= 0) {
        drag.value = withTiming(0, { duration: 220 });
        runOnJS(fire)('right');
      } else if (canSnooze && drag.value < -TRIGGER) {
        drag.value = withTiming(0, { duration: 220 });
        runOnJS(fire)('left');
      } else if (canReveal && drag.value < -revealW * 0.45) {
        drag.value = withSpring(-revealW, SPRING);
        runOnJS(markOpen)(true);
      } else {
        drag.value = withSpring(0, SPRING);
        runOnJS(markOpen)(false);
      }
    });

  const faceStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value }],
  }));
  const completeStyle = useAnimatedStyle(() => ({
    opacity: drag.value > 0 ? 1 : 0,
    transform: [{ scale: interpolate(drag.value, [0, TRIGGER], [0.7, 1], 'clamp') }],
  }));
  const snoozeStyle = useAnimatedStyle(() => ({
    opacity: drag.value < 0 ? 1 : 0,
    transform: [{ scale: interpolate(-drag.value, [0, TRIGGER], [0.7, 1], 'clamp') }],
  }));
  const completeBg = useAnimatedStyle(() => ({ opacity: drag.value > 0 ? 1 : 0 }));
  const snoozeBg = useAnimatedStyle(() => ({ opacity: drag.value < 0 ? 1 : 0 }));
  const trayStyle = useAnimatedStyle(() => ({ opacity: drag.value < 0 ? 1 : 0 }));

  const a11yActions = [
    ...(onEdit && canReveal ? [{ name: 'edit', label: 'Edit' }] : []),
    ...(onDelete && canReveal ? [{ name: 'delete', label: 'Delete' }] : []),
  ];

  if (!canRight && !canSnooze && !canReveal) {
    return <View style={style}>{children}</View>;
  }

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.shell, style]}
        accessibilityActions={a11yActions.length ? a11yActions : undefined}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'edit') onEdit?.();
          if (e.nativeEvent.actionName === 'delete') onDelete?.();
        }}
      >
        {canRight ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.under,
              styles.underLeft,
              { backgroundColor: colors.forest },
              completeBg,
            ]}
          >
            <Animated.View style={[styles.action, completeStyle]}>
              <Check size={18} color={colors.forestOn} strokeWidth={2.6} />
              <Text style={[styles.label, { color: colors.forestOn }]}>{completeLabel}</Text>
            </Animated.View>
          </Animated.View>
        ) : null}
        {canSnooze ? (
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              styles.under,
              styles.underRight,
              { backgroundColor: colors.amber },
              snoozeBg,
            ]}
          >
            <Animated.View style={[styles.action, snoozeStyle]}>
              <Clock size={18} color={colors.onInk} strokeWidth={2.4} />
              <Text style={[styles.label, { color: colors.onInk }]}>{snoozeLabel}</Text>
            </Animated.View>
          </Animated.View>
        ) : null}
        {canReveal ? (
          <Animated.View style={[styles.tray, { width: revealW }, trayStyle]}>
            {onEdit ? (
              <Pressable
                onPress={() => {
                  blurActiveElement();
                  close();
                  onEdit();
                }}
                style={({ pressed }) => [
                  styles.trayBtn,
                  { width: EDIT_W, backgroundColor: colors.slate },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Edit"
              >
                <Pencil size={18} color={colors.onInk} strokeWidth={2.2} />
                <Text style={[styles.label, { color: colors.onInk }]}>Edit</Text>
              </Pressable>
            ) : null}
            {onDelete ? (
              <Pressable
                onPress={() => {
                  blurActiveElement();
                  close();
                  onDelete();
                }}
                style={({ pressed }) => [
                  styles.trayBtn,
                  { width: DELETE_W, backgroundColor: colors.coral },
                  pressed && { opacity: 0.85 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Delete"
              >
                <Trash2 size={18} color={colors.onInk} strokeWidth={2.2} />
                <Text style={[styles.label, { color: colors.onInk }]}>Delete</Text>
              </Pressable>
            ) : null}
          </Animated.View>
        ) : null}
        <Animated.View style={faceStyle}>
          {children}
          {open ? (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={close}
              accessibilityLabel="Close actions"
            />
          ) : null}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
  },
  under: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  underLeft: {
    justifyContent: 'flex-start',
  },
  underRight: {
    justifyContent: 'flex-end',
  },
  tray: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    flexDirection: 'row',
  },
  trayBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  action: {
    alignItems: 'center',
    gap: 2,
  },
  label: {
    fontFamily: fonts.sansMedium,
    fontSize: 11,
  },
});
