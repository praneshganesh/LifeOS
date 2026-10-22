import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  currencyFromSpokenText,
  MAX_MONEY_AMOUNT,
  normalizeMoneyAmount,
  sanitizeAmountInput,
  sanitizeIntegerInput,
} from '@/lib/currency';

describe('currency field guards', () => {
  it('sanitizes amount input to digits and one decimal', () => {
    assert.equal(sanitizeAmountInput('AED 12.50'), '12.50');
    assert.equal(sanitizeAmountInput('12.999'), '12.99');
    assert.equal(sanitizeAmountInput('1,299.5'), '1299.5');
    assert.equal(sanitizeAmountInput('12.3.4'), '12.34');
    assert.equal(sanitizeAmountInput('abc'), '');
    assert.equal(sanitizeAmountInput('999999999999'), '99999999');
    assert.equal(sanitizeAmountInput('-50'), '');
  });

  it('rejects negatives and clamps absurd money amounts', () => {
    assert.ok(Number.isNaN(normalizeMoneyAmount(-12)));
    assert.ok(Number.isNaN(normalizeMoneyAmount('-50')));
    assert.ok(Number.isNaN(normalizeMoneyAmount('abc')));
    assert.equal(normalizeMoneyAmount('45.678'), 45.68);
    assert.equal(normalizeMoneyAmount(1e15), MAX_MONEY_AMOUNT);
  });

  it('sanitizes integer fields to digits only', () => {
    assert.equal(sanitizeIntegerInput('24 classes'), '24');
    assert.equal(sanitizeIntegerInput('1,500'), '1500');
    assert.equal(sanitizeIntegerInput('abc'), '');
  });

  it('infers currency only when spoken', () => {
    assert.equal(currencyFromSpokenText('45 dirhams'), 'AED');
    assert.equal(currencyFromSpokenText('$12'), 'USD');
    assert.equal(currencyFromSpokenText('12.50'), undefined);
  });
});
