/**
 * Expo SecureStore only allows alphanumeric plus ".", "-", "_".
 * Keep every SecureStore key in this list and cover it with the unit test.
 */
export const SECURE_STORE_KEY_PATTERN = /^[\w.-]+$/;

export const SECURE_STORE_KEYS = {
  recovery: 'lifeos.cloud.recovery',
  security: 'lifeos.security.v1',
} as const;

/** Pre-Android keys that used ":"; migrate on read then delete. */
export const SECURE_STORE_LEGACY_KEYS = {
  recovery: 'lifeos:cloud:recovery',
  security: 'lifeos:security:v1',
} as const;

export type SecureStoreKeyId = keyof typeof SECURE_STORE_KEYS;

export function allSecureStoreKeys(): string[] {
  return Object.values(SECURE_STORE_KEYS);
}
