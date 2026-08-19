import { Redirect } from 'expo-router';

/** Ask lives at /(tabs)/ask. Home is the primary tab. */
export default function AskRedirect() {
  return <Redirect href="/(tabs)/ask" />;
}
