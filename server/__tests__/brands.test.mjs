import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairHeardBrand } from '../brands.mjs';

describe('ASR brand repair', () => {
  it('does not rewrite brands in code — model owns spelling', () => {
    const next = repairHeardBrand({ name: 'Sangu TV', brand: 'Sangu' });
    assert.equal(next.brand, 'Sangu');
    assert.equal(next.name, 'Sangu TV');
  });
});
