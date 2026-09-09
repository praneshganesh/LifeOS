import { Tabs } from 'expo-router';

/**
 * No bottom tab bar — Capture / Ask / Talk live in the floating dock (bottom-left).
 */
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { display: 'none' },
      }}
      tabBar={() => null}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="ask" options={{ href: null, title: 'Ask' }} />
      <Tabs.Screen
        name="capture-tab"
        options={{ href: null }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen
        name="talk"
        options={{ href: null }}
        listeners={{
          tabPress: (e) => {
            e.preventDefault();
          },
        }}
      />
      <Tabs.Screen name="spaces" options={{ href: null, title: 'Life' }} />
      <Tabs.Screen name="done" options={{ href: null }} />
      <Tabs.Screen name="search" options={{ href: null }} />
      <Tabs.Screen name="ai" options={{ href: null }} />
    </Tabs>
  );
}
