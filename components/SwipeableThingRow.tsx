import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { Pencil, Trash2 } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { Icon3DBadge, type Icon3DName } from '@/components/ui/Icon3D';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { blurActiveElement } from '@/lib/a11y';

const EDIT_W = 72;
const DELETE_W = 80;
const SPRING = { damping: 18, stiffness: 220, overshootClamping: true } as const;

type Props = {
  name: string;
  subtitle?: string;
  icon: Icon3DName;
  onPress: () => void;
  /** Swipe left reveals Edit (user-owned items). */
  onEdit?: () => void;
  /** Swipe left reveals Delete (user-owned items). */
  onDelete?: () => void;
};

function RowFace({
  name,
  subtitle,
  icon,
  onPress,
}: {
  name: string;
  subtitle?: string;
  icon: Icon3DName;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={() => {
        blurActiveElement();
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: colors.surface },
        pressed && { opacity: 0.92 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={name}
    >
      <Icon3DBadge name={icon} size={48} />
      <View style={styles.copy}>
        <Text variant="headline" numberOfLines={1}>
          {name}
        </Text>
        {subtitle ? (
          <Text variant="caption" numberOfLines={1} style={{ marginTop: 4 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * Phone-native thing row: tap to open, swipe left for Edit / Delete.
 */
export function SwipeableThingRow({
  name,
  subtitle,
  icon,
  onPress,
  onEdit,
  onDelete,
}: Props) {
  const { colors } = useTheme();
  const drag = useSharedValue(0);
  const start = useSharedValue(0);
  const [open, setOpen] = useState(false);

  const actionW = (onEdit ? EDIT_W : 0) + (onDelete ? DELETE_W : 0);
  const canSwipe = actionW > 0;

  const close = () => {
    drag.value = withSpring(0, SPRING);
    setOpen(false);
  };

  const pan = Gesture.Pan()
    .enabled(canSwipe)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => {
      start.value = drag.value;
    })
    .onUpdate((e) => {
      const next = start.value + e.translationX;
      drag.value = Math.min(0, Math.max(-actionW, next));
    })
    .onEnd(() => {
      const shouldOpen = drag.value < -actionW * 0.45;
      drag.value = withSpring(shouldOpen ? -actionW : 0, SPRING);
      runOnJS(setOpen)(shouldOpen);
    });

  const actionsClipStyle = useAnimatedStyle(() => ({
    width: -drag.value,
  }));

  const face = (
    <RowFace
      name={name}
      subtitle={subtitle}
      icon={icon}
      onPress={() => {
        if (open) {
          close();
          return;
        }
        onPress();
      }}
    />
  );

  if (!canSwipe) {
    return (
      <View
        style={[
          styles.shell,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        {face}
      </View>
    );
  }

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[
          styles.shell,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        <View style={styles.track}>
          <View style={styles.faceWrap}>{face}</View>
          <Animated.View style={[styles.actionsClip, actionsClipStyle]}>
            <View style={[styles.actionsRow, { width: actionW }]}>
              {onEdit ? (
                <Pressable
                  onPress={() => {
                    blurActiveElement();
                    close();
                    onEdit();
                  }}
                  style={({ pressed }) => [
                    styles.editAction,
                    { backgroundColor: colors.forest },
                    pressed && { opacity: 0.9 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Edit"
                >
                  <Pencil size={18} color={colors.onInk} strokeWidth={2.2} />
                  <Text style={[styles.actionLabel, { color: colors.onInk }]}>Edit</Text>
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
                    styles.deleteAction,
                    { backgroundColor: colors.coral },
                    pressed && { opacity: 0.9 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel="Delete"
                >
                  <Trash2 size={18} color={colors.onInk} strokeWidth={2.2} />
                  <Text style={[styles.actionLabel, { color: colors.onInk }]}>Delete</Text>
                </Pressable>
              ) : null}
            </View>
          </Animated.View>
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  shell: {
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  faceWrap: {
    flex: 1,
    minWidth: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 72,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  actionsClip: {
    overflow: 'hidden',
  },
  actionsRow: {
    flexDirection: 'row',
    height: '100%',
  },
  editAction: {
    width: EDIT_W,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  deleteAction: {
    width: DELETE_W,
    minHeight: 72,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  actionLabel: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
  },
});
