import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import {
  connectWithApple,
  getAuthAccountState,
  isAppleAuthAvailable,
  signOutCloud,
  type AuthAccountState,
} from '@/lib/auth/apple';
import { deleteMyAccount } from '@/lib/auth/deleteAccount';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

const EMPTY: AuthAccountState = {
  ready: false,
  configured: false,
  userId: null,
  isAnonymous: true,
  hasAppleIdentity: false,
  email: null,
  displayHint: null,
};

export default function AccountSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [state, setState] = useState<AuthAccountState>(EMPTY);
  const [appleOk, setAppleOk] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    let live = true;
    void getAuthAccountState().then((s) => {
      if (live) setState(s);
    });
    void isAppleAuthAvailable().then((ok) => {
      if (live) setAppleOk(ok);
    });
    return () => {
      live = false;
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      return refresh();
    }, [refresh])
  );

  async function onConnectApple() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await connectWithApple({ preferLink: true });
      if (result.ok) {
        await getAuthAccountState().then(setState);
        Alert.alert(
          result.linked ? 'Apple linked' : 'Signed in',
          result.linked
            ? 'This device’s data and subscription stay on the same account. Sign in with Apple on a new phone to restore them.'
            : 'Your Apple account is connected. Cloud data and plan will sync to this device.'
        );
        return;
      }
      if (!result.cancelled) {
        Alert.alert('Sign in with Apple', result.error);
      }
    } finally {
      setBusy(false);
    }
  }

  function runDelete() {
    void (async () => {
      setBusy(true);
      try {
        const result = await deleteMyAccount();
        if (!result.ok) {
          const fail = `Could not delete account. ${result.error}`;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert(fail);
          } else {
            Alert.alert('Could not delete account', result.error);
          }
        }
      } finally {
        setBusy(false);
      }
    })();
  }

  function onDeleteAccount() {
    const message =
      Platform.OS === 'ios'
        ? 'This permanently deletes your Saavi login, the home record that belongs only to you, attached files, and the copy on this phone. It does not cancel an Apple subscription. Cancel that in iOS Settings → Apple ID → Subscriptions.'
        : 'This permanently deletes your Saavi login, the home record that belongs only to you, attached files, and the copy on this phone. It does not cancel a store subscription. Cancel that in Google Play or the store where you subscribed.';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(`${message}\n\nThis cannot be undone.`)) return;
      const typed = window.prompt('Type DELETE to confirm');
      if (typed !== 'DELETE') return;
      runDelete();
      return;
    }
    Alert.alert('Delete account?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete account',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Delete everything?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: runDelete,
            },
          ]);
        },
      },
    ]);
  }

  function onSignOut() {
    Alert.alert(
      'Sign out of cloud?',
      'This device will leave your saved Apple identity. Local data stays on the phone until you wipe it, but a new install won’t reclaim the same cloud account until you Sign in with Apple again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign out',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setBusy(true);
              try {
                const result = await signOutCloud();
                if (!result.ok) {
                  Alert.alert('Sign out', result.error);
                  return;
                }
                await getAuthAccountState().then(setState);
              } finally {
                setBusy(false);
              }
            })();
          },
        },
      ]
    );
  }

  const statusSubtitle = !state.configured
    ? 'Cloud not configured in this build'
    : state.hasAppleIdentity
      ? state.displayHint || 'Signed in with Apple'
      : state.userId
        ? 'Temporary account on this device'
        : 'Not signed in';

  return (
    <ModuleScreen
      title="Account"
      defaultOrigin="settings"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="Signed in as">
        <ListCard>
          <ListRow
            icon="id"
            title={state.hasAppleIdentity ? 'Apple' : 'This device'}
            subtitle={statusSubtitle}
            last
          />
        </ListCard>
        {Platform.OS === 'ios' ? (
          <Text style={[styles.hint, { color: colors.mute }]}>
            Sign in with Apple so a new phone can restore your household and plan.
          </Text>
        ) : (
          <Text style={[styles.hint, { color: colors.mute }]}>
            Restore with your recovery code on a new Android phone. Apple Sign In
            is available on iPhone.
          </Text>
        )}
      </ModuleSection>

      <ModuleSection label="Sign in">
        <ListCard>
          {Platform.OS === 'ios' && appleOk && !state.hasAppleIdentity ? (
            <ListRow
              icon="key"
              title={busy ? 'Connecting…' : 'Sign in with Apple'}
              subtitle="Keeps your data if you change phones"
              onPress={() => void onConnectApple()}
              last
            />
          ) : null}
          {Platform.OS === 'ios' && appleOk && state.hasAppleIdentity ? (
            <ListRow
              icon="key"
              title="Apple is linked"
              subtitle="You’re set for restore on another device"
              last={!state.userId}
            />
          ) : null}
          {state.hasAppleIdentity ? (
            <ListRow
              icon="shield"
              title="Sign out"
              subtitle="Stays on this phone until you delete the account"
              onPress={onSignOut}
              last
            />
          ) : null}
          {Platform.OS !== 'ios' && !state.hasAppleIdentity ? (
            <ListRow
              icon="folder"
              title="Recovery code"
              subtitle="Settings → Export or wipe — restore without Apple"
              onPress={() => router.push('/settings/data' as Href)}
              last
            />
          ) : null}
        </ListCard>
        {busy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : null}
      </ModuleSection>

      {state.configured && (state.hasAppleIdentity || state.userId) ? (
        <ModuleSection label="Delete">
          <ListCard>
            <ListRow
              icon="shield"
              title="Delete account"
              subtitle={
                Platform.OS === 'ios'
                  ? 'Removes your login and this phone’s copy. Does not cancel Apple billing.'
                  : 'Removes your login and this phone’s copy. Cancel any store subscription separately.'
              }
              onPress={onDeleteAccount}
              last
            />
          </ListCard>
        </ModuleSection>
      ) : null}

      <ModuleSection label="Advanced">
        <ListCard>
          <ListRow
            icon="package"
            title="Export or wipe"
            subtitle="JSON backup, recovery code, or clear this phone"
            onPress={() => router.push('/settings/data')}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  hint: {
    fontFamily: fonts.sans,
    fontSize: 14,
    lineHeight: 20,
    marginTop: spacing.sm,
    paddingHorizontal: 4,
  },
  busyRow: {
    marginTop: spacing.md,
    alignItems: 'center',
  },
});
