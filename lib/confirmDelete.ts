import { Alert, Platform } from 'react-native';

/** Native-feeling delete confirm (Alert on device, confirm on web). */
export function confirmDelete(name: string): Promise<boolean> {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return Promise.resolve(window.confirm(`Remove “${name}” from this device?`));
  }
  return new Promise((resolve) => {
    Alert.alert('Delete item?', `Remove “${name}” from this device?`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}
