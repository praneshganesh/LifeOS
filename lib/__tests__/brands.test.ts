import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { brandFromName } from '@/lib/brands';

describe('brandFromName', () => {
  it('pulls a known brand from the start of the name', () => {
    assert.equal(brandFromName('Philips lamp'), 'Philips');
    assert.equal(brandFromName('Samsung TV'), 'Samsung');
    assert.equal(brandFromName('apple watch'), 'Apple');
  });

  it('returns undefined when no known brand leads the name', () => {
    assert.equal(brandFromName('desk lamp'), undefined);
    assert.equal(brandFromName(''), undefined);
  });
});
