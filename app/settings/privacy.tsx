import { useRouter, type Href } from 'expo-router';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { ModuleScreen, ModuleSection } from '@/components/ui/ModuleScreen';
import { ListCard, ListRow } from '@/components/ui/ListKit';

export default function PrivacySettingsScreen() {
  const router = useRouter();
  return (
    <ModuleScreen
      title="Privacy"
      backLabel="Settings"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <ModuleSection label="Your data">
        <ListCard>
          <ListRow
            title="On your phone first"
            subtitle="Works offline. Syncs when you’re signed in."
          />
          <ListRow
            title="Photos & documents"
            subtitle="Stay with your account for backup. Not used for ads."
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Capture">
        <ListCard>
          <ListRow
            title="Text reading"
            subtitle="On-device only when AI is On."
          />
          <ListRow
            title="Identify with AI"
            subtitle="Only if you tap it. Off when AI is Off."
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Talk & Ask">
        <ListCard>
          <ListRow
            title="What gets sent"
            subtitle="That turn’s message plus a short summary of names, rooms, and dates."
          />
          <ListRow
            title="What stays put"
            subtitle="Your photos and full documents are not uploaded for chat."
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="Policies">
        <ListCard>
          <ListRow
            title="Privacy policy"
            subtitle="What Saavi stores and what it sends"
            onPress={() => router.push('/settings/privacy-policy' as Href)}
          />
          <ListRow
            title="Terms"
            subtitle="Subscription, trial, and the Apple license"
            onPress={() => router.push('/settings/terms' as Href)}
            last
          />
        </ListCard>
      </ModuleSection>

      <ModuleSection label="We never">
        <ListCard>
          <ListRow title="Link Gmail or your bank" />
          <ListRow title="Sell your content" />
          <ListRow title="Scan your camera roll in the background" last />
        </ListCard>
      </ModuleSection>
    </ModuleScreen>
  );
}
