import { Platform } from 'react-native';

/**
 * Copy a camera/picker/cache URI into app document storage so inventory
 * photos survive cache cleanup across relaunches.
 */
export async function persistLocalMediaUri(
  uri: string,
  kind: 'photo' | 'doc' = 'photo'
): Promise<string> {
  if (Platform.OS === 'web') return uri;
  const trimmed = uri.trim();
  if (!trimmed) return uri;
  if (trimmed.includes('/lifeos-media/')) return trimmed;

  try {
    const FileSystem = await import('expo-file-system/legacy');
    const root = FileSystem.documentDirectory;
    if (!root) return uri;

    const dir = `${root}lifeos-media/`;
    const info = await FileSystem.getInfoAsync(dir);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    }

    const extMatch = trimmed.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
    const ext = (extMatch?.[1] || (kind === 'doc' ? 'bin' : 'jpg')).toLowerCase();
    const dest = `${dir}${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await FileSystem.copyAsync({ from: trimmed, to: dest });
    return dest;
  } catch {
    return uri;
  }
}
