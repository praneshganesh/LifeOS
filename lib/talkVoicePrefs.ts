import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:talk-voice:v1';

export type TalkVoicePrefs = {
  /** Speak Talk replies aloud (on-device TTS). */
  speakReplies: boolean;
};

export const DEFAULT_TALK_VOICE_PREFS: TalkVoicePrefs = {
  speakReplies: true,
};

export async function loadTalkVoicePrefs(): Promise<TalkVoicePrefs> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_TALK_VOICE_PREFS };
    const parsed = JSON.parse(raw) as Partial<TalkVoicePrefs>;
    return { ...DEFAULT_TALK_VOICE_PREFS, ...parsed };
  } catch {
    return { ...DEFAULT_TALK_VOICE_PREFS };
  }
}

export async function saveTalkVoicePrefs(
  prefs: TalkVoicePrefs
): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
