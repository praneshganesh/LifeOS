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
        device first. When cloud backup is on, a JSON snapshot (not photos) is
        stored in your Supabase project so a lost phone is not the only copy.
        Talk and Ask still send short text plus a compact summary to your chat
        API so the assistant can answer.
      </Text>

      <ModuleSection label="Your records">
        <ListCard>
          <ListRow
            title="Things & spaces"
            subtitle="Inventory, rooms, warranties — photos stay on-device"
            meta="Phone"
          />
          <ListRow
            title="Money & habits"
            subtitle="Expenses, subscriptions, habit logs"
            meta="Phone"
          />
          <ListRow
            title="Family & Last Done"
            subtitle="Household people, maintenance history"
            meta="Phone"
          />
          <ListRow
            title="Document reading"
            subtitle="OCR / MRZ runs on-device"
            meta="Phone"
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

      <ModuleSection label="Elsewhere">
        <ListCard>
          <ListRow
            title="Cloud backup"
            subtitle="JSON snapshot in your Supabase project"
            meta="On"
          />
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
