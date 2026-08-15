import { useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
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

export default function DataSettingsScreen() {
  const router = useRouter();
  const { items } = useInventory();
  const { expenses } = useExpenses();
  const { habits } = useHabits();
  const { subscriptions } = useSubscriptions();
  const { items: lastDone } = useLastDone();
  const { members } = useHousehold();
  const [busy, setBusy] = useState(false);

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

  function onWipe() {
    const message = `This permanently deletes inventory, expenses, habits, subscriptions, Last Done, household, spaces, and profile on this device (${total} records). Default spaces will be restored.`;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (!window.confirm(`${message}\n\nType OK in the next prompt to confirm.`)) return;
      const typed = window.prompt('Type DELETE to confirm wipe');
      if (typed !== 'DELETE') return;
      void runWipe();
      return;
    }
    Alert.alert('Wipe all LifeOS data?', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Wipe everything',
        style: 'destructive',
        onPress: () => {
          Alert.alert('Final confirm', 'This cannot be undone.', [
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
        'Force-quit and reopen LifeOS so every screen reloads empty defaults.'
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModuleScreen
      title="Export & backup"
      subtitle="Local backup on this device — no cloud sync yet."
    >
      <ModuleSection label="On this device">
        <ListCard>
          <ListRow title="Things" meta={String(items.length)} />
          <ListRow title="Expenses" meta={String(expenses.length)} />
          <ListRow title="Habits" meta={String(habits.length)} />
          <ListRow title="Subscriptions" meta={String(subscriptions.length)} />
          <ListRow title="Last Done" meta={String(lastDone.length)} />
          <ListRow title="Household" meta={String(members.length)} last />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Export">
        <ListCard>
          <ListRow
            icon="package"
            title={busy ? 'Working…' : 'Export backup JSON'}
            subtitle="Share a full on-device snapshot"
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
            title="Wipe all LifeOS data"
            subtitle="Removes every local store on this phone"
            onPress={onWipe}
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
