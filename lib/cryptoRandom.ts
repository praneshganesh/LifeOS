import * as Crypto from 'expo-crypto';

/** Fill a Uint8Array with CSPRNG bytes (works on iOS + Android Hermes). */
export function fillRandomBytes(bytes: Uint8Array): Uint8Array {
  if (typeof Crypto.getRandomValues === 'function') {
    return Crypto.getRandomValues(bytes);
  }
  const g = globalThis as { crypto?: { getRandomValues?: (b: Uint8Array) => Uint8Array } };
  if (typeof g.crypto?.getRandomValues === 'function') {
    return g.crypto.getRandomValues(bytes);
  }
  throw new Error('Secure random is unavailable on this device.');
}
