import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyChatActions } from '../chat/applyActions';
import type { ChatAction } from '../chat/types';
import { findDuplicateExpense } from '../expenses';
import { findDuplicateSubscription } from '../subscriptions';
import {
  PlanLimitError,
  planById,
  wouldExceedAssetLimit,
  wouldExceedHomeLimit,
  wouldExceedMemberLimit,
} from '../planLimits';

describe('plan limit helpers', () => {
  it('blocks free assets/homes/members at cap', () => {
    const free = planById('free');
    assert.equal(wouldExceedAssetLimit(free, 100), true);
    assert.equal(wouldExceedHomeLimit(free, 1), true);
    assert.equal(wouldExceedMemberLimit(free, 3), true);
    assert.equal(wouldExceedAssetLimit(planById('pro'), 5000), false);
    assert.ok(new PlanLimitError('assets').message.includes('Things'));
  });
});

describe('expense/subscription dedupe', () => {
  it('matches same title amount day', () => {
    const list = [
      {
        id: '1',
        title: 'Coffee',
        amount: 18,
        currency: 'AED',
        category: 'food' as const,
        date: '2026-08-13',
        createdAt: '',
      },
    ];
    assert.ok(
      findDuplicateExpense(list, {
        title: 'coffee',
        amount: 18,
        date: '2026-08-13',
        currency: 'AED',
      })
    );
    assert.equal(
      findDuplicateExpense(list, {
        title: 'Coffee',
        amount: 19,
        date: '2026-08-13',
      }),
      undefined
    );
  });

  it('matches same subscription title amount cycle', () => {
    const list = [
      {
        id: '1',
        title: 'Netflix',
        amount: 50,
        currency: 'AED',
        cycle: 'monthly' as const,
        renewsOn: '2026-09-01',
        category: 'entertainment' as const,
        autoRenew: true,
        createdAt: '',
      },
    ];
    assert.ok(
      findDuplicateSubscription(list, {
        title: 'netflix',
        amount: 50,
        cycle: 'monthly',
      })
    );
  });
});

describe('applyChatActions', () => {
  it('adds inventory and expense from talk actions', async () => {
    const added: string[] = [];
    const expenses: { title: string; amount: number }[] = [];
    const result = await applyChatActions(
      [
        {
          type: 'add_item',
          name: 'MacBook Pro',
          brand: 'Apple',
          price: 'AED 6000',
          purchasedFrom: 'Sharaf DG',
        },
        {
          type: 'add_expense',
          title: 'Coffee',
          amount: '18',
          currency: 'AED',
          date: '2026-08-13',
        },
      ] as ChatAction[],
      {
        addItem: async (item) => {
          added.push(item.name);
          return {
            ...item,
            id: 'inv-1',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      {
        expenses: {
          addExpense: async (input) => {
            expenses.push({ title: input.title, amount: input.amount });
            return { id: 'exp-1', title: input.title, amount: input.amount };
          },
        },
      }
    );
    assert.deepEqual(added, ['MacBook Pro']);
    assert.equal(expenses.length, 1);
    assert.equal(result.lastAddedName, 'MacBook Pro');
    assert.equal(result.loggedExpenseTitle, 'Coffee');
  });

  it('check-ins habit for given dates', async () => {
    const checks: string[] = [];
    const habit = {
      id: 'hab-1',
      title: 'Walked',
      categoryId: 'health' as const,
      logs: [] as { id: string; doneAt: string }[],
      createdAt: new Date().toISOString(),
    };
    await applyChatActions(
      [
        { type: 'habit_check_in', title: 'Walked', date: '2026-08-10' },
        { type: 'habit_check_in', title: 'Walked', date: '2026-08-11' },
      ] as ChatAction[],
      {
        addItem: async () => {
          throw new Error('unused');
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      {
        habits: {
          addHabit: async () => habit,
          findByTitle: () => habit,
          getById: () => habit,
          checkIn: async (_id, date) => {
            checks.push(date || 'today');
            return habit;
          },
        },
      }
    );
    assert.deepEqual(checks, ['2026-08-10', '2026-08-11']);
  });

  it('does not assign invented household names', async () => {
    let assigned: string | undefined;
    await applyChatActions(
      [
        {
          type: 'add_item',
          name: 'TV',
          brand: 'Samsung',
          assignedTo: 'Ananya',
          personId: 'fm-partner',
        },
      ] as ChatAction[],
      {
        addItem: async (item) => {
          assigned = item.assignedTo;
          return {
            ...item,
            id: 'inv-2',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      { household: [] }
    );
    assert.equal(assigned, undefined);
  });

  it('stores warranty from add_item and does not invent Good condition', async () => {
    let saved: {
      warrantyExpiry?: string;
      warrantyActive?: boolean;
      condition?: string;
    } = {};
    await applyChatActions(
      [
        {
          type: 'add_item',
          name: 'MacBook Pro',
          brand: 'Apple',
          price: '$8000',
          purchasedFrom: 'IMAX',
          warrantyExpiry: '2028',
          condition: 'New',
        },
      ] as ChatAction[],
      {
        addItem: async (item) => {
          saved = item;
          return {
            ...item,
            id: 'inv-w',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      {
        lastUserText:
          'I got a new Apple MacBook Pro from IMAX for $8000 with extended warranty until 2028',
      }
    );
    assert.equal(saved.warrantyExpiry, '2028-12-31');
    assert.equal(saved.warrantyActive, true);
    assert.equal(saved.condition, '—');
  });

  it('pulls warranty from the utterance when the model omits it', async () => {
    let expiry: string | undefined;
    await applyChatActions(
      [{ type: 'add_item', name: 'MacBook Pro', brand: 'Apple' }] as ChatAction[],
      {
        addItem: async (item) => {
          expiry = item.warrantyExpiry;
          return {
            ...item,
            id: 'inv-w2',
            createdAt: new Date().toISOString(),
          } as never;
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      { lastUserText: 'added a laptop with warranty until 2028' }
    );
    assert.equal(expiry, '2028-12-31');
  });
});
