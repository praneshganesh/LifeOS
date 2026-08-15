import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTalkOverlay } from '@/lib/TalkOverlayContext';

/**
 * Legacy Talk route — opens the floating sheet and returns to Chat.
 */
export default function TalkScreen() {
  const router = useRouter();
  const { openTalk } = useTalkOverlay();

  useEffect(() => {
    openTalk();
    router.replace('/(tabs)');
  }, [openTalk, router]);

  return <View />;
}
