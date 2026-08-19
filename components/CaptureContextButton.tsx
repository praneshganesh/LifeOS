import { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Camera } from 'lucide-react-native';
import {
  captureHref,
  rememberCaptureContext,
  type CaptureContextKind,
} from '@/lib/captureContext';
import { blurActiveElement } from '@/lib/a11y';
import { useTheme } from '@/lib/ThemeContext';

/** Remembers module context while mounted + opens context-aware Capture. */
export function CaptureContextButton({
  kind,
  spaceId,
  room,
  label = 'Capture',
}: {
  kind: CaptureContextKind;
  spaceId?: string;
  room?: string;
  label?: string;
}) {
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    rememberCaptureContext(kind, { spaceId, room });
  }, [kind, spaceId, room]);

  return (
    <Pressable
      onPress={() => {
        blurActiveElement();
        router.push(captureHref({ kind, spaceId, room }));
      }}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: colors.accent },
        pressed && { opacity: 0.88 },
      ]}
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Camera size={18} color={colors.accentOn} strokeWidth={2.2} />
    </Pressable>
  );
}

/** Call from screens that don't show a button but should bias the tab FAB. */
export function useRememberCaptureContext(
  kind: CaptureContextKind,
  opts?: { spaceId?: string; room?: string }
) {
  const spaceId = opts?.spaceId;
  const room = opts?.room;
  useEffect(() => {
    rememberCaptureContext(kind, { spaceId, room });
  }, [kind, spaceId, room]);
}

const styles = StyleSheet.create({
  btn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
