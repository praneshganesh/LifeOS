import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { softenLineWrap } from '@/lib/textWrap';

describe('softenLineWrap', () => {
  it('keeps clock tokens together', () => {
    const out = softenLineWrap('every Friday at 5 pm');
    assert.equal(out.includes('5\u00a0pm'), true);
    assert.equal(out.includes('5 pm'), false);
  });

  it('keeps currency code + amount together', () => {
    const out = softenLineWrap('Paid AED 50 yesterday');
    assert.equal(out.includes('AED\u00a050'), true);
  });
});
