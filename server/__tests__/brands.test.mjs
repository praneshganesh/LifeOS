import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { repairHeardBrand } from '../brands.mjs';

describe('ASR brand repair', () => {
  it('maps Sangu TV to Samsung', () => {
    const next = repairHeardBrand({ name: 'Sangu TV', brand: 'Sangu' });
    assert.equal(next.brand, 'Samsung');
    assert.match(next.name, /Samsung/i);
    assert.doesNotMatch(next.name, /Sangu/i);
  });

  it('maps coffee + dalungi to De\'Longhi', () => {
    const next = repairHeardBrand({
      name: 'Dalungi coffee machine',
      category: 'Appliances',
    });
    assert.equal(next.brand, "De'Longhi");
  });

  it('does not invent a brand without a product cue', () => {
    const next = repairHeardBrand({ name: 'Sangu', brand: '' });
    assert.equal(next.brand, '');
    assert.equal(next.name, 'Sangu');
  });
});
