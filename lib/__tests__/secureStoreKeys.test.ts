import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SECURE_STORE_KEY_PATTERN,
  allSecureStoreKeys,
} from '@/lib/secureStoreKeys';

describe('SecureStore keys', () => {
  it('only uses characters SecureStore accepts on Android', () => {
    const keys = allSecureStoreKeys();
    assert.ok(keys.length > 0);
    for (const key of keys) {
      assert.match(
        key,
        SECURE_STORE_KEY_PATTERN,
        `Invalid SecureStore key: ${JSON.stringify(key)}`
      );
      assert.doesNotMatch(key, /:/, `Colon not allowed: ${key}`);
    }
  });
});
