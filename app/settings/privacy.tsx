import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';
import { Text } from '@/components/ui/Text';
import { spacing } from '@/constants/theme';

export default function PrivacySettingsScreen() {
  return (
    <ModuleScreen
      title="Privacy"
      subtitle="On-device first. You decide what leaves the phone."
    >
      <Text variant="body" style={{ marginBottom: spacing.lg }}>
        LifeOS keeps your inventory, family, spend, habits, and documents on this
        device. Talk and Ask only send short text plus a compact summary of what
        you already own — never raw photos or full document scans — to your chat
        API so the assistant can answer.
      </Text>

      <ModuleSection label="Stays on this device">
        <ListCard>
          <ListRow
            title="Things & spaces"
            subtitle="Inventory, rooms, photos, warranties"
            meta="Local"
          />
          <ListRow
            title="Money & habits"
            subtitle="Expenses, subscriptions, habit logs"
            meta="Local"
          />
          <ListRow
            title="Family & Last Done"
            subtitle="Household people, maintenance history"
            meta="Local"
          />
          <ListRow
            title="Document reading"
            subtitle="OCR / MRZ runs on-device"
            meta="Local"
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Leaves when you use Talk / Ask">
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

      <ModuleSection label="Not connected">
        <ListCard>
          <ListRow title="Cloud sync" subtitle="Deferred — no multi-device sync yet" meta="Off" />
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
