import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  coerceDurablePurchases,
  expenseToDurableItem,
  looksLikeDurablePurchase,
} from '../chat/durablePurchase';
import type { ChatAction } from '../chat/types';
import { applyChatActions } from '../chat/applyActions';

describe('durablePurchase', () => {
  it('treats branded durables as Things', () => {
    assert.equal(
      looksLikeDurablePurchase('Philips lamp', 'got a Philips lamp for 50 dollars'),
      true
    );
    assert.equal(looksLikeDurablePurchase('Coffee', 'spent 12 on coffee'), false);
    assert.equal(looksLikeDurablePurchase('Juice', 'got a juice for 13 dirhams'), false);
  });

  it('rewrites add_expense Philips lamp into add_item with USD price', () => {
    const item = expenseToDurableItem(
      {
        type: 'add_expense',
        title: 'Philips lamp',
        amount: 50,
        currency: 'USD',
      },
      'got a Philips lamp for 50 dollars'
    );
    assert.ok(item);
    assert.equal(item!.type, 'add_item');
    assert.equal(item!.name, 'Philips lamp');
    assert.equal(item!.brand, 'Philips');
    assert.equal(item!.price, 'USD 50');
  });

  it('coerces model expense actions before apply', () => {
    const actions = coerceDurablePurchases(
      [
        {
          type: 'add_expense',
          title: 'Philips lamp',
          amount: '50',
          currency: 'USD',
        },
      ] as ChatAction[],
      'got a Philips lamp for 50 dollars'
    );
    assert.equal(actions.length, 1);
    assert.equal(actions[0]?.type, 'add_item');
  });

  it('applyChatActions stores a Thing, not an expense', async () => {
    const added: { name: string; brand: string; price: string }[] = [];
    const expenses: string[] = [];
    const result = await applyChatActions(
      [
        {
          type: 'add_expense',
          title: 'Philips lamp',
          amount: 50,
          currency: 'USD',
        },
      ] as ChatAction[],
      {
        addItem: async (item) => {
          added.push({
            name: item.name,
            brand: item.brand,
            price: item.price,
          });
          return {
            ...item,
            id: 'thing-1',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'ask',
      {
        lastUserText: 'got a Philips lamp for 50 dollars',
        expenses: {
          addExpense: async (input) => {
            expenses.push(input.title);
            return { id: 'exp-x', title: input.title, amount: input.amount };
          },
        },
      }
    );
    assert.equal(expenses.length, 0);
    assert.equal(added.length, 1);
    assert.equal(added[0]?.name, 'Philips Lamp');
    assert.equal(added[0]?.brand, 'Philips');
    assert.match(added[0]?.price || '', /USD/);
    assert.equal(result.lastAddedName, 'Philips Lamp');
    assert.equal(result.loggedExpenseTitle, null);
  });

  it('stores empty brand when none is spoken (not Unknown)', async () => {
    let brand = 'sentinel';
    await applyChatActions(
      [
        {
          type: 'add_expense',
          title: 'toaster',
          amount: 30,
          currency: 'USD',
        },
      ] as ChatAction[],
      {
        addItem: async (item) => {
          brand = item.brand;
          return {
            ...item,
            id: 'thing-2',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'ask',
      { lastUserText: 'I bought a toaster for $30' }
    );
    assert.equal(brand, '');
  });
});
