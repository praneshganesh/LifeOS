import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  clampPriceString,
  currencyForAmount,
  currencyFromSpokenText,
  MAX_MONEY_AMOUNT,
  normalizeMoneyAmount,
  sanitizeAmountInput,
  sanitizeIntegerInput,
  sanitizeThingPriceInput,
} from '@/lib/currency';
import { formatMoney } from '@/lib/chat/prompt';

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

  it('keeps currency while editing a Thing price and allows clear', () => {
    assert.equal(sanitizeThingPriceInput('60', 'USD 50'), 'USD 60');
    assert.equal(sanitizeThingPriceInput('USD 75.5', 'USD 50'), 'USD 75.5');
    assert.equal(sanitizeThingPriceInput('EUR 40', 'USD 50'), 'EUR 40');
    assert.equal(sanitizeThingPriceInput('', 'USD 50'), '');
    assert.equal(sanitizeThingPriceInput('USD ', 'USD 50'), '');
    assert.equal(clampPriceString('50', 'USD'), 'USD 50');
    assert.equal(clampPriceString('USD 50'), 'USD 50');
    assert.equal(clampPriceString(''), '');
    assert.equal(clampPriceString('—'), '');
  });

  it('recognises $ / dollars / USD on the amount', () => {
    assert.equal(formatMoney('$30', { defaultCurrency: 'AED' }), 'USD 30');
    assert.equal(formatMoney('30$', { defaultCurrency: 'AED' }), 'USD 30');
    assert.equal(formatMoney('USD 30', { defaultCurrency: 'AED' }), 'USD 30');
    assert.equal(
      formatMoney('30', { defaultCurrency: 'AED', utterance: '30 dollars' }),
      'USD 30'
    );
    assert.equal(
      formatMoney('30', {
        defaultCurrency: 'AED',
        utterance: 'Bought a toaster for $30',
      }),
      'USD 30'
    );
  });

  it('attaches currency per amount, not the first word in the sentence', () => {
    assert.equal(
      currencyForAmount('30', '10 pounds of rice for $30'),
      'USD'
    );
    assert.equal(
      currencyForAmount('30', '10 pounds of rice for 30'),
      undefined
    );
    assert.equal(currencyFromSpokenText('10 pounds of rice'), undefined);
    assert.equal(currencyFromSpokenText('30 pounds'), 'GBP');
  });
});
