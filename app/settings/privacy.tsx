import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';

export default function PrivacySettingsScreen() {
  return (
    <ModuleScreen
      title="Privacy"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <Text variant="body" style={{ marginBottom: spacing.lg }}>
        Saavi stores your inventory, family, spend, habits, and documents
        securely in the cloud, so your data survives a lost phone and follows
        you across devices. Talk and Ask send short text plus a compact summary
        to the chat API so the assistant can answer — never your photos.
      </Text>

      <ModuleSection label="Your records">
        <ListCard>
          <ListRow
            title="Things & spaces"
            subtitle="Inventory, rooms, warranties"
            meta="Cloud"
          />
          <ListRow
            title="Money & habits"
            subtitle="Expenses, subscriptions, habit logs"
            meta="Cloud"
          />
          <ListRow
            title="Family & Last Done"
            subtitle="Household people, maintenance history"
            meta="Cloud"
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Sent when you use Talk / Ask">
        <ListCard>
          <ListRow
            title="Chat messages"
            subtitle="What you type or say in that turn"
            meta="API"
          />
          <ListRow
            title="Short inventory summary"
            subtitle="Names, rooms, key dates — not photos"
            meta="API"
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Never">
        <ListCard>
          <ListRow title="Gmail / email import" subtitle="Not required" meta="Off" />
          <ListRow title="Bank / payment import" subtitle="Not required" meta="Off" />
          <ListRow
            title="Product analytics"
            subtitle="No content telemetry"
            meta="Off"
            last
          />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
