import { useTheme } from '@/lib/ThemeContext';
import { useMemo, useEffect, useState } from 'react';
import { Platform, StyleSheet, Switch, View } from 'react-native';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { ListCard } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { TimeField } from '@/components/ui/TimeField';
import {
  DEFAULT_NOTIFICATION_PREFS,
  loadNotificationPrefs,
  normalizeQuietHoursTime,
  saveNotificationPrefs,
  type NotificationPrefs,
} from '@/lib/notificationPrefs';
import {
  ensureNotificationPermissions,
  getNotificationPermission,
  syncLastDoneReminders,
} from '@/lib/lastDoneNotifications';
import { useLastDone } from '@/lib/LastDoneContext';
import { type ThemeColors, fonts, spacing } from '@/constants/theme';

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  last,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={[styles.row, !last && styles.border]}>
      <View style={{ flex: 1, paddingRight: spacing.sm }}>
        <Text variant="headline" style={{ fontSize: 16 }}>
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
        trackColor={{ false: colors.lineStrong, true: colors.forestBright }}
        thumbColor={colors.white}
      />
    </View>
  );
}

function permissionSubtitle(
  ready: boolean,
  status: 'granted' | 'denied' | 'undetermined' | 'unavailable'
): string | undefined {
  if (!ready) return undefined;
  if (Platform.OS === 'web' || status === 'unavailable') return undefined;
  if (status === 'granted') return undefined;
  if (status === 'denied') return 'Off in iPhone Settings';
  return undefined;
}

export default function NotificationPrefsScreen() {
  const { colors } = useTheme();
  const { items: lastDoneItems } = useLastDone();
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_NOTIFICATION_PREFS);
  const [ready, setReady] = useState(false);
  const [osStatus, setOsStatus] = useState<
    'granted' | 'denied' | 'undetermined' | 'unavailable'
  >('undetermined');

  useEffect(() => {
    void (async () => {
      const loaded = await loadNotificationPrefs();
      setPrefs(loaded);
      setOsStatus(await getNotificationPermission());
      setReady(true);
    })();
  }, []);

  async function update(patch: Partial<NotificationPrefs>) {
    const next: NotificationPrefs = {
      ...prefs,
      ...patch,
      quietHoursStart: normalizeQuietHoursTime(
        patch.quietHoursStart ?? prefs.quietHoursStart,
        DEFAULT_NOTIFICATION_PREFS.quietHoursStart
      ),
      quietHoursEnd: normalizeQuietHoursTime(
        patch.quietHoursEnd ?? prefs.quietHoursEnd,
        DEFAULT_NOTIFICATION_PREFS.quietHoursEnd
      ),
    };
    if (patch.push !== undefined) {
      next.maintenance = patch.push;
    }
    setPrefs(next);
    await saveNotificationPrefs(next);
    if (next.push && patch.push === true) {
      const ok = await ensureNotificationPermissions();
      setOsStatus(ok ? 'granted' : 'denied');
    }
    if (
      patch.push !== undefined ||
      patch.quietHoursStart !== undefined ||
      patch.quietHoursEnd !== undefined
    ) {
      void syncLastDoneReminders(lastDoneItems);
    }
  }

  return (
    <ModuleScreen
      title="Notifications"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
      contentStyle={{ paddingTop: spacing.lg }}
    >
      {/* No "Reminders" heading — page title already owns that job. */}
      <ListCard>
        <ToggleRow
          title="Activity reminders"
          subtitle={permissionSubtitle(ready, osStatus)}
          value={prefs.push}
          onChange={(v) => void update({ push: v })}
          last
        />
      </ListCard>

      <View style={{ marginTop: spacing.xxl }}>
        <Text
          style={{
            fontFamily: fonts.sansSemi,
            fontSize: 22,
            color: colors.ink,
            letterSpacing: -0.3,
            marginBottom: 4,
          }}
        >
          Quiet hours
        </Text>
        <Text
          style={{
            fontFamily: fonts.sans,
            fontSize: 16,
            lineHeight: 22,
            color: colors.mute,
            marginBottom: spacing.sm,
          }}
        >
          No alerts between these times.
        </Text>
        <ListCard>
          <TimeField
            label="From"
            value={prefs.quietHoursStart}
            onChange={(v) => void update({ quietHoursStart: v })}
          />
          <TimeField
            label="Until"
            value={prefs.quietHoursEnd}
            onChange={(v) => void update({ quietHoursEnd: v })}
            last
          />
        </ListCard>
      </View>
    </ModuleScreen>
  );
}

function makeStyles(colors: ThemeColors) {
  return StyleSheet.create({
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
}
