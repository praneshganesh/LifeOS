import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'lifeos:home-surface:v1';

export type HomeSurface = 'today' | 'ask' | 'things';

export async function loadHomeSurface(): Promise<HomeSurface> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === 'ask' || raw === 'today' || raw === 'things') return raw;
  } catch {
    /* keep default */
  }
  return 'today';
}

export async function saveHomeSurface(surface: HomeSurface): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, surface);
}
