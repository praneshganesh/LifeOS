import { useCallback, useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import 'react-native-gesture-handler';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Figtree_400Regular,
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import { fonts } from '@/constants/theme';
import { BrandSplash } from '@/components/BrandSplash';
import { OnboardingGate } from '@/components/OnboardingGate';
import { AppLockGate } from '@/components/AppLockGate';
import { NotificationDeepLinkHost } from '@/components/NotificationDeepLinkHost';
import { ThemeProvider, useTheme } from '@/lib/ThemeContext';
import { CloudGate } from '@/lib/cloud/CloudGate';
import { LastDoneProvider } from '@/lib/LastDoneContext';
import { InventoryProvider } from '@/lib/InventoryContext';
import { SpacesProvider } from '@/lib/SpacesContext';
import { HouseholdProvider } from '@/lib/HouseholdContext';
import { ExpensesProvider } from '@/lib/ExpensesContext';
import { HabitsProvider } from '@/lib/HabitsContext';
import { ClassesProvider } from '@/lib/ClassesContext';
import { SubscriptionsProvider } from '@/lib/SubscriptionsContext';
import { TalkOverlayProvider } from '@/lib/TalkOverlayContext';
import { ToastProvider } from '@/lib/ToastContext';
import { CurrencyProvider } from '@/lib/CurrencyContext';
import { FloatingNav, TalkOrb } from '@/components/TalkOverlay';
import 'react-native-reanimated';

export { ErrorBoundary } from 'expo-router';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

SplashScreen.preventAutoHideAsync();

function TalkOverlayHost() {
  return (
    <>
      <TalkOrb />
      <FloatingNav />
    </>
  );
}

function RootNavigation({
  showBrandSplash,
  onBrandSplashFinished,
}: {
  showBrandSplash: boolean;
  onBrandSplashFinished: () => void;
}) {
  const { colors } = useTheme();

  return (
    <>
      <NotificationDeepLinkHost />
      <StatusBar style={colors.statusBar} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerTitleStyle: {
            fontFamily: fonts.sansMedium,
            color: colors.ink,
          },
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="asset/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="asset/edit/[id]" options={{ title: 'Edit', headerBackTitle: 'Back' }} />
        <Stack.Screen name="space" options={{ headerShown: false }} />
        <Stack.Screen name="room/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen
          name="capture"
          options={{ presentation: 'fullScreenModal', headerShown: false }}
        />
        <Stack.Screen
          name="last-done/index"
          options={{ presentation: 'modal', title: 'Last done', headerShown: true }}
        />
        <Stack.Screen
          name="last-done/[id]"
          options={{ title: 'History', headerBackTitle: 'Back' }}
        />
        <Stack.Screen name="profile/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/privacy" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/security" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/notifications" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/plan" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/appearance" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/sharing" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/homes" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/data" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="settings/about" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="warranties/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="subscriptions" options={{ headerShown: false }} />
        <Stack.Screen name="insurance/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="insurance/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="family" options={{ headerShown: false }} />
        <Stack.Screen name="expenses" options={{ headerShown: false }} />
        <Stack.Screen name="habits" options={{ headerShown: false }} />
        <Stack.Screen name="classes" options={{ headerShown: false }} />
        <Stack.Screen name="purchases/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="purchases/[id]" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="documents/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="vehicles/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="maintenance/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="tasks/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="notifications/index" options={{ title: '', headerBackTitle: 'Back' }} />
        <Stack.Screen name="reports/index" options={{ title: '', headerBackTitle: 'Back' }} />
      </Stack>
      {!showBrandSplash ? <TalkOverlayHost /> : null}
      {showBrandSplash ? <BrandSplash onFinished={onBrandSplashFinished} /> : null}
    </>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Figtree: Figtree_400Regular,
    FigtreeMedium: Figtree_500Medium,
    FigtreeSemi: Figtree_600SemiBold,
    FigtreeBold: Figtree_700Bold,
  });
  const [showBrandSplash, setShowBrandSplash] = useState(true);

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      void SplashScreen.hideAsync();
    }
  }, [loaded]);

  const finishBrandSplash = useCallback(() => {
    setShowBrandSplash(false);
  }, []);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#0D0D0F' }}>
      <ThemeProvider>
        <CloudGate>
        <LastDoneProvider>
          <InventoryProvider>
            <SpacesProvider>
              <HouseholdProvider>
                <ExpensesProvider>
                  <HabitsProvider>
                    <ClassesProvider>
                      <SubscriptionsProvider>
                        <TalkOverlayProvider>
                          <ToastProvider>
                            <CurrencyProvider>
                            <AppLockGate>
                              <OnboardingGate>
                                <RootNavigation
                                  showBrandSplash={showBrandSplash}
                                  onBrandSplashFinished={finishBrandSplash}
                                />
                              </OnboardingGate>
                            </AppLockGate>
                            </CurrencyProvider>
                          </ToastProvider>
                        </TalkOverlayProvider>
                      </SubscriptionsProvider>
                    </ClassesProvider>
                  </HabitsProvider>
                </ExpensesProvider>
              </HouseholdProvider>
            </SpacesProvider>
          </InventoryProvider>
        </LastDoneProvider>
        </CloudGate>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
