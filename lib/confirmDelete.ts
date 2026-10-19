import { Alert, Platform } from 'react-native';
import { webConfirm } from '@/lib/webConfirm';

/**
 * Delete confirm. Always shown over a dimmed screen so the choice is the only
 * thing in focus: the system alert on device, a dimmed dialog on web.
 */
export function confirmDelete(name: string): Promise<boolean> {
  const title = `Delete “${name}”?`;
  const message = 'It’s removed everywhere you use Saavi. This can’t be undone.';
  if (Platform.OS === 'web') {
    return webConfirm({ title, message, confirmLabel: 'Delete', destructive: true });
  }
  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Delete', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
