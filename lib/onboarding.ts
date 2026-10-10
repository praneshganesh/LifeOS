import AsyncStorage from '@react-native-async-storage/async-storage';

export const ONBOARDING_STORAGE_KEY = 'lifeos:onboarding:v1';

/** What the user said they care about during setup — product signal + UI hints. */
export type OnboardingIntent =
  | 'things'
  | 'reminders'
  | 'habits'
  | 'classes'
  | 'money'
  | 'family';

export const ONBOARDING_INTENT_OPTIONS: Array<{
  id: OnboardingIntent;
  label: string;
  hint: string;
}> = [
  { id: 'things', label: 'Things I own', hint: 'Warranties, gear, documents' },
  { id: 'reminders', label: 'Reminders', hint: 'Last-done & due dates' },
  { id: 'habits', label: 'Habits', hint: 'Daily check-ins' },
  { id: 'classes', label: 'Classes', hint: 'Sessions & packs' },
  { id: 'money', label: 'Money', hint: 'Expenses & subscriptions' },
  { id: 'family', label: 'Household', hint: 'People you share life with' },
];

export type OnboardingState = {
  done: true;
  completedAt: string;
  /** Intents chosen during setup (may be empty if skipped). */
  intents?: OnboardingIntent[];
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

export async function loadOnboardingIntents(): Promise<OnboardingIntent[]> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;
    return Array.isArray(parsed.intents) ? parsed.intents : [];
  } catch {
    return [];
  }
}

export async function saveOnboardingIntents(
  intents: OnboardingIntent[]
): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);
    const prev = raw ? (JSON.parse(raw) as Partial<OnboardingState>) : {};
    await AsyncStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        ...prev,
        intents,
      })
    );
  } catch {
    // ignore
  }
}

export async function completeOnboarding(
  intents?: OnboardingIntent[]
): Promise<void> {
  let savedIntents = intents;
  if (!savedIntents) {
    savedIntents = await loadOnboardingIntents();
  }
  const payload: OnboardingState = {
    done: true,
    completedAt: new Date().toISOString(),
    intents: savedIntents,
  };
  await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(payload));
}

export async function clearOnboarding(): Promise<void> {
  await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);
}
