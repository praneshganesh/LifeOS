import { useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';
import {
  ensureNotificationPermissions,
  getNotificationPermission,
  syncLastDoneReminders,
} from '@/lib/lastDoneNotifications';
import { useLastDone } from '@/lib/LastDoneContext';
import { colors, spacing } from '@/constants/theme';

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  last,
  disabled,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
  disabled?: boolean;
}) {
  return (
    <View style={[styles.row, !last && styles.border, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1 }}>
        <Text variant="headline" style={{ fontSize: 15 }}>
          {title}
        </Text>
        {subtitle ? (
          <Text variant="caption" style={{ marginTop: 2 }}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ false: colors.lineStrong, true: colors.forestBright }}
        thumbColor={colors.white}
      />
    </View>
  );
}

export default function NotificationPrefsScreen() {
  const { items: lastDoneItems } = useLastDone();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [ready, setReady] = useState(false);
  const [osStatus, setOsStatus] = useState<string>('…');

  useEffect(() => {
    void (async () => {
      const loaded = await loadNotificationPrefs();
      setPrefs(loaded);
      const status = await getNotificationPermission();
      setOsStatus(
        Platform.OS === 'web'
          ? 'Unavailable on web'
          : status === 'granted'
            ? 'Allowed'
            : status === 'denied'
              ? 'Denied in system settings'
              : 'Not asked yet'
      );
      setReady(true);
    })();
  }, []);

  async function update(patch: Partial<NotificationPrefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await saveNotificationPrefs(next);
    if (next.push && (patch.push === true || patch.maintenance === true)) {
      const ok = await ensureNotificationPermissions();
      setOsStatus(ok ? 'Allowed' : 'Denied in system settings');
    }
    if (
      patch.push !== undefined ||
      patch.maintenance !== undefined
    ) {
      void syncLastDoneReminders(lastDoneItems);
    }
  }

  return (
    <ModuleScreen
      title="Notification preferences"
      subtitle="Local reminders on this device — no cloud push yet."
    >
      <ModuleSection label="Delivery">
        <ListCard>
          <ToggleRow
            title="Local notifications"
            subtitle={
              ready
                ? `System permission: ${osStatus}`
                : 'Loading…'
            }
            value={prefs.push}
            onChange={(v) => void update({ push: v })}
            last
          />
        </ListCard>
      </ModuleSection>
      <ModuleSection label="Categories">
        <ListCard>
          <ToggleRow
            title="Maintenance due"
            subtitle="Schedules when you set a Last Done reminder"
            value={prefs.maintenance}
            onChange={(v) => void update({ maintenance: v })}
            disabled={!prefs.push}
          />
          <ToggleRow
            title="Warranties"
            subtitle="Coming soon — not scheduled yet"
            value={false}
            onChange={() => {}}
            disabled
          />
          <ToggleRow
            title="Insurance renewals"
            subtitle="Coming soon — not scheduled yet"
            value={false}
            onChange={() => {}}
            disabled
          />
          <ToggleRow
            title="Return windows"
            subtitle="Coming soon — not scheduled yet"
            value={false}
            onChange={() => {}}
            disabled
          />
          <ToggleRow
            title="Document expiry"
            subtitle="Coming soon — not scheduled yet"
            value={false}
            onChange={() => {}}
            disabled
          />
          <ToggleRow
            title="Family activity"
            subtitle="Coming soon — not scheduled yet"
            value={false}
            onChange={() => {}}
            disabled
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  border: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
});
