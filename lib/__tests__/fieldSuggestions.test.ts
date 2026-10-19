import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { rememberedLabels, suggestionsFor } from '../fieldSuggestions';

describe('field suggestions', () => {
  it('keeps the spelling used most often', () => {
    assert.deepEqual(rememberedLabels(['apple', 'Apple', 'Apple', 'Samsung', 'Unknown', '']), [
      'Apple',
      'Samsung',
    ]);
  });

  it('suggests a prefix and the household spelling when the case differs', () => {
    const history = ['Apple', 'Amazon', 'AXA'];
    assert.deepEqual(suggestionsFor('A', history), ['Apple', 'Amazon', 'AXA']);
    assert.deepEqual(suggestionsFor('ap', history), ['Apple']);
    assert.deepEqual(suggestionsFor('apple', history), ['Apple']);
    assert.deepEqual(suggestionsFor('Apple', history), []);
    assert.deepEqual(suggestionsFor('', history), []);
  });
});