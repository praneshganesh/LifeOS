import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildCloudBody,
  formatRecoveryCode,
  generateRecoveryCode,
  isValidRecoveryCode,
  normalizeRecoveryCode,
  stripLocalMedia,
} from '../cloud/payload';

describe('cloud payload', () => {
  it('strips local photo URIs and keeps https', () => {
    const next = stripLocalMedia({
      name: 'Passport',
      imageUri: 'file:///var/mobile/Containers/passport.jpg',
      photoUri: 'https://example.com/scan.jpg',
      kids: [{ imageUri: 'content://media/1', title: 'scan' }],
    }) as Record<string, unknown>;
    assert.equal(next.name, 'Passport');
    assert.equal(next.imageUri, undefined);
    assert.equal(next.photoUri, 'https://example.com/scan.jpg');
    const kids = next.kids as Record<string, unknown>[];
    assert.equal(kids[0]!.title, 'scan');
    assert.equal(kids[0]!.imageUri, undefined);
  });

  it('normalizes and formats recovery codes', () => {
    assert.equal(normalizeRecoveryCode('ab12-cd34-ef56-gh78'), 'AB12CD34EF56GH78');
    assert.equal(formatRecoveryCode('ab12cd34ef56gh78'), 'AB12-CD34-EF56-GH78');
    assert.equal(isValidRecoveryCode('AB12-CD34-EF56-GH78'), true);
    assert.equal(isValidRecoveryCode('short'), false);
  });

  it('builds a snapshot from known store keys only', () => {
    const body = buildCloudBody(
      {
        'lifeos:inventory:v1': [{ name: 'TV', imageUri: 'file:///tv.jpg' }],
        'lifeos:security:v1': { biometrics: true },
        noise: 1,
      },
      '2026-08-15T00:00:00.000Z'
    );
    assert.equal(body.exportedAt, '2026-08-15T00:00:00.000Z');
    assert.ok(body.stores['lifeos:inventory:v1']);
    assert.equal(body.stores['lifeos:security:v1'], undefined);
    const items = body.stores['lifeos:inventory:v1'] as { name: string; imageUri?: string }[];
    assert.equal(items[0]!.name, 'TV');
    assert.equal(items[0]!.imageUri, undefined);
  });

  it('generates a 16-character grouped code', () => {
    const bytes = Uint8Array.from({ length: 16 }, (_, i) => i + 3);
    const code = generateRecoveryCode(bytes);
    assert.equal(isValidRecoveryCode(code), true);
    assert.match(code, /^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
  });
});
