import { Linking } from 'react-native';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { fonts, spacing } from '@/constants/theme';

const SUPPORT_EMAIL = 'hello@ibp-labs.com';
import { useTheme } from '@/lib/ThemeContext';

function Block({ title, body }: { title: string; body: string }) {
  const { colors } = useTheme();
  return (
    <>
      <Text
        style={{
          fontFamily: fonts.sansSemi,
          fontSize: 17,
          color: colors.ink,
          marginTop: spacing.lg,
          marginBottom: 6,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: 16,
          lineHeight: 23,
          color: colors.slate,
        }}
      >
        {body}
      </Text>
    </>
  );
}

export default function PrivacyPolicyScreen() {
  const { colors } = useTheme();
  return (
    <ModuleScreen
      title="Privacy policy"
      backLabel="Back"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.mute }}>
        Last updated 9 October 2026
      </Text>
      <Block
        title="Who publishes Saavi"
        body="Saavi is published by IBP Labs LLC. This policy describes what the Saavi app stores and sends. The IBP Labs website policy covers the studio site only."
      />
      <Block
        title="What Saavi is"
        body="Saavi keeps a record of your home: things, reminders, habits, classes, expenses, and subscriptions. The record lives on your phone so it works offline, and it syncs to your account when you are online."
      />
      <Block
        title="Your account"
        body="The first time you open Saavi we create a temporary account so the app can sync. Sign in with Apple replaces that with an Apple identity, including a private relay email if you choose Hide My Email. We store that identity to restore your data and subscription on another phone. We do not ask you to create a password."
      />
      <Block
        title="What is stored"
        body="The things you type or capture: names, dates, amounts, people in your home, rooms, notes, and files you attach (photos and PDFs). Those files sit in private storage tied to your account. They are not public and they are not used for advertising."
      />
      <Block
        title="Talk, Ask, and Identify"
        body="A Talk turn, an Ask message, or a photo you choose to Identify is sent to Saavi’s server and then to OpenAI so it can answer. Talk and Ask send the message plus a short summary of names, rooms, and dates already in your record. Your photo library is not scanned in the background. Speech recognition and on-device text reading stay on the phone."
      />
      <Block
        title="Subscriptions"
        body="Apple charges for Pro through the App Store. RevenueCat tells us whether the subscription is active so the app and the server can apply your plan. We do not receive your card number."
      />
      <Block
        title="What we don’t do"
        body="We don’t sell your record. We don’t connect Gmail or your bank. We don’t use your data to track you across other companies’ apps."
      />
      <Block
        title="Deleting your account"
        body="Settings → Account → Delete account erases the login, the home record that belongs only to you, attached files, and the copy on this phone. Deleting the account does not cancel an Apple subscription. Cancel that in iOS Settings → Apple ID → Subscriptions."
      />
      <Block
        title="Children"
        body="Saavi is not directed at children under 13, and we do not knowingly collect personal information from them."
      />
      <Text
        onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 16,
          lineHeight: 23,
          color: colors.accent,
          marginTop: spacing.lg,
        }}
      >
        {SUPPORT_EMAIL}
      </Text>
    </ModuleScreen>
  );
}
