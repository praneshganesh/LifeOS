import { useMemo } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { useInventory } from '@/lib/InventoryContext';
import { useSpaces } from '@/lib/SpacesContext';
import { useHousehold } from '@/lib/HouseholdContext';
import {
  PLANS,
  TRIAL_DAYS,
  buildLimitMeters,
  loadPlanPrefs,
  planById,
  savePlanPrefs,
  trialDaysLeft,
  type PlanId,
  type PlanPrefs,
} from '@/lib/planLimits';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fonts, radius, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';

export default function PlanSettingsScreen() {
  const { colors } = useTheme();
  const { items } = useInventory();
  const { spaces } = useSpaces();
  const { members } = useHousehold();
  const [prefs, setPrefs] = useState<PlanPrefs>({ planId: 'trial' });

  useFocusEffect(
    useCallback(() => {
      let live = true;
      void loadPlanPrefs().then((p) => {
        if (live) setPrefs(p);
      });
      return () => {
        live = false;
      };
    }, [])
  );

  const usage = useMemo(
    () => ({
      assets: items.length,
      homes: spaces.filter((s) => s.kind === 'home').length,
      members: members.length,
    }),
    [items.length, spaces, members.length]
  );

  const planId = prefs.planId;
  const plan = planById(planId);
  const meters = buildLimitMeters(plan, usage);
  const daysLeft = trialDaysLeft(prefs);
  const subtitle =
    planId === 'trial' && daysLeft != null
      ? daysLeft > 0
        ? `Trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} left of ${TRIAL_DAYS}. Full Pro.`
        : 'Trial ended. Billing needs an Apple Developer account — nothing is locked yet.'
      : `You’re on ${plan.name}. App Store billing comes later.`;

  async function selectPlan(id: PlanId) {
    if (id === planId) return;
    Alert.alert(
      'Plan preview',
      'App Store billing isn’t connected yet (needs Apple Developer / DUNS). This only switches the plan label — no charge.'
    );
    const next: PlanPrefs = {
      planId: id,
      trialStartedAt: prefs.trialStartedAt,
    };
    setPrefs(next);
    await savePlanPrefs(next);
  }

  return (
    <ModuleScreen
      title="Plan & billing"
      subtitle={subtitle}
      backLabel="Settings"
      backFallbackHref="/settings"
    >
      <ModuleSection label="Your usage">
        <ListCard>
          <MeterRow title="Things" meter={meters.assets} colors={colors} />
          <MeterRow title="Homes" meter={meters.homes} colors={colors} />
          <MeterRow
            title="People"
            meter={meters.members}
            colors={colors}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Plans">
        {PLANS.map((p) => {
          const current = p.id === planId;
          return (
            <Pressable
              key={p.id}
              onPress={() => void selectPlan(p.id)}
              style={[
                styles.plan,
                {
                  backgroundColor: colors.white,
                  borderColor: current ? colors.forest : colors.line,
                  borderWidth: current ? 1.5 : StyleSheet.hairlineWidth,
                },
              ]}
            >
              <View style={styles.planTop}>
                <Text variant="headline">{p.name}</Text>
                <Text style={[styles.price, { color: colors.forest }]}>{p.price}</Text>
              </View>
              {p.perks.map((perk) => (
                <Text key={perk} variant="caption" style={styles.perk}>
                  · {perk}
                </Text>
              ))}
              {current ? (
                <Text style={[styles.current, { color: colors.forest }]}>Current</Text>
              ) : (
                <Text style={[styles.cta, { color: colors.slate }]}>Preview this plan</Text>
              )}
            </Pressable>
          );
        })}
      </ModuleSection>

      <ModuleSection label="Billing">
        <ListCard>
          <ListRow
            title="Payment method"
            subtitle="Sign in with Apple + App Store trial after DUNS / Developer account"
            meta="Later"
          />
          <ListRow
            title="What we meter"
            subtitle="Talk per login (not Things). Cloud photos later. Family is extra logins, not extra modules."
            meta="—"
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}

function MeterRow({
  title,
  meter,
  colors,
  last,
}: {
  title: string;
  meter: { label: string; ratio: number; over: boolean };
  colors: { line: string; forest: string; coral: string; mute: string };
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.meterRow,
        !last && {
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.line,
        },
      ]}
    >
      <View style={styles.meterTop}>
        <Text variant="headline" style={{ fontSize: 16 }}>
          {title}
        </Text>
        <Text
          variant="caption"
          style={{ color: meter.over ? colors.coral : colors.mute }}
        >
          {meter.label}
        </Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.round(meter.ratio * 100)}%`,
              backgroundColor: meter.over ? colors.coral : colors.forest,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  plan: {
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  price: {
    fontFamily: fonts.sansSemi,
    fontSize: 16,
  },
  perk: { marginTop: 2 },
  current: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  cta: {
    marginTop: spacing.md,
    fontFamily: fonts.sansMedium,
    fontSize: 16,
  },
  meterRow: {
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  meterTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  track: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    borderRadius: 3,
  },
});
