import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import {
  SECURE_STORE_KEYS,
  SECURE_STORE_LEGACY_KEYS,
  type SecureStoreKeyId,
} from '@/lib/secureStoreKeys';

async function nativeGet(key: string): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(key);
  } catch {
    return null;
  }
}

async function nativeSet(key: string, value: string): Promise<void> {
  await SecureStore.setItemAsync(key, value);
}

async function nativeDelete(key: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    /* ignore */
  }
}

/** Read a SecureStore value, migrating from a legacy ":" key when needed. */
export async function readSecureStore(id: SecureStoreKeyId): Promise<string | null> {
  const key = SECURE_STORE_KEYS[id];
  const legacy = SECURE_STORE_LEGACY_KEYS[id];

  if (Platform.OS === 'web') {
    try {
      return (
        globalThis.localStorage?.getItem(key) ??
        globalThis.localStorage?.getItem(legacy) ??
        null
      );
    } catch {
      return null;
    }
  }

  const current = await nativeGet(key);
  if (current != null) return current;

  const old = await nativeGet(legacy);
  if (old == null) return null;
  try {
    await nativeSet(key, old);
    await nativeDelete(legacy);
  } catch {
    /* keep returning the legacy value even if migration write fails */
  }
  return old;
}

export async function writeSecureStore(
  id: SecureStoreKeyId,
  value: string
): Promise<void> {
  const key = SECURE_STORE_KEYS[id];
  const legacy = SECURE_STORE_LEGACY_KEYS[id];

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(key, value);
      globalThis.localStorage?.removeItem(legacy);
    } catch {
      /* ignore */
    }
    return;
  }

  await nativeSet(key, value);
  await nativeDelete(legacy);
}
