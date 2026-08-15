import { Redirect } from 'expo-router';

/** Ask moved to Chat (primary tab). */
export default function AskRedirect() {
  return <Redirect href="/(tabs)" />;
}
