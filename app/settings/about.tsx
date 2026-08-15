import Constants from 'expo-constants';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';

export default function AboutSettingsScreen() {
  const version =
    Constants.expoConfig?.version ||
    Constants.nativeAppVersion ||
    '1.0.0';
  const sdk =
    Constants.expoConfig?.sdkVersion ||
    String(Constants.expoConfig?.runtimeVersion || '57');

  return (
    <ModuleScreen title="About LifeOS" subtitle="OS for everything you own.">
      <Text variant="body" style={{ marginBottom: spacing.lg }}>
        Privacy-first life administration — homes, assets, warranties, documents,
        and family — with on-device document reading and no required email or bank
        connections.
      </Text>
      <ModuleSection label="App">
        <ListCard>
          <ListRow title="Version" meta={version} />
          <ListRow title="Expo SDK" meta={String(sdk).includes('57') ? '57' : String(sdk)} />
          <ListRow title="Fonts" meta="Figtree" />
          <ListRow title="Storage" meta="On this device" last />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
