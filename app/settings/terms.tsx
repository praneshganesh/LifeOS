import { Linking } from 'react-native';
import { ModuleScreen } from '@/components/ui/ModuleScreen';
import { Text } from '@/components/ui/Text';
import { DETAIL_DOCK_PAD } from '@/components/ui/DetailKit';
import { fonts, spacing } from '@/constants/theme';
import { useTheme } from '@/lib/ThemeContext';
import { PRO_TALK_DAILY, TRIAL_TALK_DAILY } from '@/lib/planLimits';

const APPLE_EULA =
  'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const SUPPORT_EMAIL = 'hello@ibp-labs.com';

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

export default function TermsScreen() {
  const { colors } = useTheme();
  return (
    <ModuleScreen
      title="Terms"
      backLabel="Back"
      backFallbackHref="/settings"
      bottomExtra={DETAIL_DOCK_PAD}
    >
      <Text style={{ fontFamily: fonts.sans, fontSize: 14, color: colors.mute }}>
        Last updated 9 October 2026
      </Text>
      <Block
        title="The service"
        body="These terms are between you and IBP Labs LLC, the publisher of Saavi. Saavi is a record of your home. You keep what you enter. We run the sync, the subscription check, and the Talk, Ask, and Identify requests you start. The IBP Labs website terms cover the studio site only."
      />
      <Block
        title="Subscriptions"
        body="Pro is billed by Apple to your Apple ID. The price and length are shown on the paywall before you confirm. A subscription renews until you cancel it in iOS Settings → Apple ID → Subscriptions, at least 24 hours before the period ends. Deleting your Saavi account does not cancel that Apple subscription. Restore purchases puts an existing subscription back on this phone. Refunds are handled by Apple."
      />
      <Block
        title="Trial and Talk"
        body={`A new account can use a trial. Trial Talk is ${TRIAL_TALK_DAILY} turns a day. Pro is ${PRO_TALK_DAILY} turns a day. Adding and editing your record by hand is not counted. Unused turns do not roll over.`}
      />
      <Block
        title="Your record"
        body="You are responsible for what you put in Saavi. Don’t use Talk or Ask to break the law or to attack the service. We may stop a request that would do that."
      />
      <Block
        title="Apple’s license"
        body="The App Store license for the app itself is Apple’s standard end user license. These terms cover how Saavi’s subscription and service work on top of that."
      />
      <Text
        onPress={() => void Linking.openURL(APPLE_EULA)}
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 16,
          lineHeight: 23,
          color: colors.accent,
          marginTop: spacing.lg,
        }}
      >
        Apple standard license
      </Text>
      <Text
        onPress={() => void Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        style={{
          fontFamily: fonts.sansMedium,
          fontSize: 16,
          lineHeight: 23,
          color: colors.accent,
          marginTop: spacing.md,
        }}
      >
        {SUPPORT_EMAIL}
      </Text>
    </ModuleScreen>
  );
}
