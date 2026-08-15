import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_STORAGE_KEY = 'lifeos:onboarding:v1';

export type OnboardingState = {
  done: true;
  completedAt: string;
};

async function hasExistingUserData(): Promise<boolean> {
  const pairs = await AsyncStorage.multiGet([
    'lifeos:inventory:v1',
    'lifeos:household:v1',
    'lifeos:expenses:v1',
    'lifeos:habits:v1',
  ]);
  return pairs.some(([, raw]) => {
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  });
}

export async function isOnboardingDone(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<OnboardingState>;
      if (parsed?.done === true) return true;
    }
    // Pre-P1 installs already using the app — don't force the tour
    if (await hasExistingUserData()) {
      await completeOnboarding();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function completeOnboarding(): Promise<void> {
  const payload: OnboardingState = {
    done: true,
    completedAt: new Date().toISOString(),
  };
  await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
}

export async function clearOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
