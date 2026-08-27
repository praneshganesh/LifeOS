import { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, StyleSheet, TextInput, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useExpenses } from '@/lib/ExpensesContext';
import { useHabits } from '@/lib/HabitsContext';
import { useSubscriptions } from '@/lib/SubscriptionsContext';
import { useLastDone } from '@/lib/LastDoneContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  reloadAppAfterWipe,
  shareLifeOsBackup,
  wipeLifeOsData,
} from '@/lib/dataExport';
import { isSupabaseConfigured } from '@/lib/supabase';
import { getStorageLoadFailures } from '@/lib/storage/versioned';
import {
  loadCloudMeta,
  loadRecoveryCode,
  restoreFromRecoveryCode,
  syncCloudNow,
  type CloudMeta,
} from '@/lib/cloud/sync';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function DataSettingsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { items } = useInventory();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { subscriptions } = useSubscriptions();
  const { items: lastDone } = useLastDone();
  const { members } = useHousehold();
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<CloudMeta | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [restoreCode, setRestoreCode] = useState('');

  const configured = isSupabaseConfigured();
  const loadFailures = getStorageLoadFailures();

  const version =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';

  const total = useMemo(
    () =>
      items.length +
      expenses.length +
      habits.length +
      subscriptions.length +
      lastDone.length +
      members.length,
    [items, expenses, habits, subscriptions, lastDone, members]
  );

  useEffect(() => {
    void loadCloudMeta().then(setMeta);
    void loadRecoveryCode().then(setRecovery);
  }, []);

  async function onExport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await shareLifeOsBackup(version);
      if (result === 'unavailable') {
        Alert.alert('Export failed', 'Sharing isn’t available on this device.');
      }
    } finally {
      setBusy(false);
    }
  }

  function alertNotConfigured() {
    Alert.alert(
      'Cloud backup isn’t set up',
      'This build has no cloud backup configured. Use “Export backup JSON” to keep a copy of your data.'
    );
  }

  async function onSync() {
    if (busy) return;
    if (!configured) {
      alertNotConfigured();
      return;
    }
    setBusy(true);
    try {
      const next = await syncCloudNow();
      setMeta(next);
      setRecovery(await loadRecoveryCode());
      if (next.lastError) {
        Alert.alert('Cloud backup', next.lastError);
      }
    } catch (err) {
      Alert.alert(
        'Backup failed',
        err instanceof Error ? err.message : 'Couldn’t reach the backup service.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function onRestore() {
    if (busy) return;
    if (!configured) {
      alertNotConfigured();
      return;
    }
    setBusy(true);
    try {
      await restoreFromRecoveryCode(restoreCode);
      try {
        await reloadAppAfterWipe();
      } catch {
        /* Expo Go / web */
      }
      Alert.alert(
        'Restored',
        'Force-quit and reopen Saavi so every screen reloads from the cloud copy.'
      );
    } catch (err) {
      Alert.alert(
        'Restore failed',
        err instanceof Error ? err.message : 'Could not restore that backup.'
      );
    } finally {
      setBusy(false);
    }
  }

  function onWipe() {
    const message = `This permanently deletes inventory, expenses, habits, classes, subscriptions, Last Done, household, spaces, and profile on this device (${total} records). The cloud copy is not deleted. Default spaces will be restored.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(`${message}\n\nType OK in the next prompt to confirm.`)) return;
      const typed = window.prompt('Type DELETE to confirm wipe');
      if (typed !== 'DELETE') return;
      void runWipe();
      return;
    }
    Alert.alert('Wipe all Saavi data?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wipe everything',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Final confirm', 'This cannot be undone on this phone.', [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete all',
              style: 'destructive',
              onPress: () => void runWipe(),
            },
          ]);
        },
      },
    ]);
  }

  async function runWipe() {
    if (busy) return;
    setBusy(true);
    try {
      await wipeLifeOsData();
      try {
        await reloadAppAfterWipe();
      } catch {
        /* fall through */
      }
      Alert.alert(
        'Data wiped',
        'Force-quit and reopen Saavi so every screen reloads empty defaults. Use your recovery code if you want the cloud copy back.'
      );
    } finally {
      setBusy(false);
    }
  }

  const cloudSubtitle = !configured
    ? 'Add Supabase keys to .env'
    : meta?.lastError
      ? meta.lastError
      : meta?.lastPushAt
        ? `Last backup ${new Date(meta.lastPushAt).toLocaleString()}`
        : 'Waiting for first backup';

  return (
    <ModuleScreen
      title="Export & backup"
      subtitle="On this phone, plus a cloud copy when Supabase is configured."
    >
      {loadFailures.length ? (
        <View
          style={[
            styles.warnCard,
            { backgroundColor: colors.coralSoft ?? colors.surface, borderColor: colors.coral },
          ]}
        >
          <Text style={[styles.warnTitle, { color: colors.coral }]}>
            Some data couldn’t be loaded
          </Text>
          <Text variant="caption" style={{ color: colors.ink, marginTop: 4 }}>
            {loadFailures.length} store{loadFailures.length === 1 ? '' : 's'} failed to
            read this session. The original data was backed up on this phone and is
            not lost — don’t wipe data, and contact support.
          </Text>
        </View>
      ) : null}

      <ModuleSection label="Your data">
        <ListCard>
          <ListRow title="Things" meta={String(items.length)} />
          <ListRow title="Expenses" meta={String(expenses.length)} />
          <ListRow title="Habits" meta={String(habits.length)} />
          <ListRow title="Subscriptions" meta={String(subscriptions.length)} />
          <ListRow title="Last Done" meta={String(lastDone.length)} />
          <ListRow title="Household" meta={String(members.length)} last />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Cloud">
        <ListCard>
          <ListRow
            icon="sparkles"
            title={configured ? 'Supabase backup' : 'Cloud not configured'}
            subtitle={cloudSubtitle}
          />
          <ListRow
            icon="package"
            title={busy ? 'Working…' : 'Backup now'}
            subtitle="JSON snapshot — photos stay on this phone"
            onPress={() => void onSync()}
          />
          <ListRow
            icon="key"
            title={showCode ? 'Hide recovery code' : 'Show recovery code'}
            subtitle="Needed to restore on a new phone — treat it like a password"
            onPress={() => setShowCode((v) => !v)}
            last
          />
        </ListCard>
        {showCode ? (
          <Text
            selectable
            style={[
              styles.code,
              {
                color: colors.ink,
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            {recovery || 'Backup once to create a code.'}
          </Text>
        ) : null}
        <Text variant="caption" style={{ marginTop: spacing.md, color: colors.mute }}>
          Restore on another phone
        </Text>
        <TextInput
          value={restoreCode}
          onChangeText={setRestoreCode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="XXXX-XXXX-XXXX-XXXX"
          placeholderTextColor={colors.faint}
          style={[
            styles.input,
            {
              color: colors.ink,
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        />
        <ListCard>
          <ListRow
            icon="folder"
            title="Restore from recovery code"
            subtitle="Replaces data on this phone, then reloads"
            onPress={() => void onRestore()}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Export">
        <ListCard>
          <ListRow
            icon="package"
            title={busy ? 'Working…' : 'Export backup JSON'}
            subtitle="Share a full snapshot"
            onPress={() => void onExport()}
          />
          <ListRow
            icon="document"
            title="Open reports"
            subtitle="Live counts and spend"
            onPress={() => router.push('/reports' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Danger zone">
        <ListCard>
          <ListRow
            icon="tools"
            title="Wipe all Saavi data"
            subtitle="Removes every local store on this phone"
            onPress={onWipe}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  warnCard: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  warnTitle: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  code: {
    marginTop: spacing.sm,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  input: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
    letterSpacing: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
