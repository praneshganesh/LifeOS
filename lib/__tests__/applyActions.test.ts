import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyChatActions } from '../chat/applyActions';
import { composeAppliedReply } from '../chat/composeReply';
import type { ChatAction } from '../chat/types';
import { findDuplicateExpense } from '../expenses';
import { findDuplicateSubscription } from '../subscriptions';
import {
  createClassPack,
  findClassPack,
  mergeClassPackUpdate,
  toggleLogForDay,
  type ClassPack,
  type NewClassPackInput,
} from '../classes';
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

  it('creates a class pack from talk and logs attendance', async () => {
    const packs: { title: string; total: number; assignedTo?: string; logs: string[] }[] = [];
    const result = await applyChatActions(
      [
        {
          type: 'add_class_pack',
          title: 'Skating',
          total: 24,
          months: 3,
          assignedTo: 'Aarav',
        },
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
        lastUserText:
          'I enrolled my son for skating class. He has 24 classes within 3 months.',
        household: [
          {
            id: 'fm-son',
            name: 'Aarav',
            role: 'child',
            relation: 'Son',
            avatarLetter: 'AA',
            icon: 'school',
            permission: 'viewer',
            createdAt: new Date().toISOString(),
          },
        ],
        classes: {
          addPack: async (input) => {
            packs.push({
              title: input.title,
              total: input.total ?? 0,
              assignedTo: input.assignedTo,
              logs: [],
            });
            return {
              id: 'cls-1',
              title: input.title,
              total: input.total ?? 0,
              assignedTo: input.assignedTo,
              personId: input.personId,
              startsOn: '2026-08-15',
              endsOn: '2026-11-15',
              logs: [],
              createdAt: new Date().toISOString(),
            };
          },
          logClass: async () => null,
          findPack: () => undefined,
          getById: () => undefined,
        },
      }
    );
    assert.equal(packs[0]?.title, 'Skating');
    assert.equal(packs[0]?.total, 24);
    assert.equal(packs[0]?.assignedTo, 'Aarav');
    assert.equal(result.classPackTitle, 'Skating');
    assert.equal(result.classPackRemaining, 24);
  });

  it('creates a swimming pack when enroll has no session count', async () => {
    const { packs, api } = memoryClasses();
    const result = await applyChatActions(
      [{ type: 'none' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'I enrolled for a swimming class',
        classes: api,
      }
    );
    assert.equal(packs[0]?.title, 'Swimming');
    assert.equal(packs[0]?.total, 0);
    assert.equal(result.classPackTitle, 'Swimming');
    assert.equal(result.classPackRemaining, null);
  });

  it('merges 12th / two months onto the pack just enrolled', async () => {
    const { packs, api } = memoryClasses();
    await applyChatActions([{ type: 'none' }] as ChatAction[], unusedInv, 'talk', {
      lastUserText: 'I enrolled for a swimming class',
      classes: api,
    });
    const result = await applyChatActions(
      [
        {
          type: 'add_class_pack',
          title: 'Swimming Classes',
        },
      ] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText:
          'for a swimming class I have 12th classes to take in the next two months',
        classes: api,
      }
    );
    assert.equal(packs.length, 1);
    assert.equal(packs[0]?.total, 12);
    assert.equal(result.classPackTitle, 'Swimming');
  });

  it('logs I attended against the newest pack', async () => {
    const { packs, api } = memoryClasses();
    await api.addPack({ title: 'Swimming', total: 12, months: 2 });
    const result = await applyChatActions(
      [{ type: 'none' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'I attended',
        classes: api,
      }
    );
    assert.equal(packs[0]?.logs.length, 1);
    assert.equal(result.classLoggedTitle, 'Swimming');
  });

  it('does not invent a swimming log when no pack exists', async () => {
    const { packs, api } = memoryClasses();
    const result = await applyChatActions(
      [{ type: 'log_class', title: 'swimming' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'I attended my second swimming class today',
        classes: api,
      }
    );
    assert.equal(packs.length, 0);
    assert.equal(result.classLoggedTitle, null);
  });

  it('sets a Last Done reminder from talk without marking done', async () => {
    const saved: { label: string; remindAt: string; logs: unknown[] }[] = [];
    const result = await applyChatActions(
      [{ type: 'none' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'Log a reminder to apply for renewed passport next Tuesday',
        lastDone: {
          logDone: async () => {
            throw new Error('should not mark done');
          },
          setReminder: async (input) => {
            saved.push({ label: input.label, remindAt: input.remindAt, logs: [] });
            return { label: input.label, remindAt: input.remindAt };
          },
        },
        inventoryList: [{ id: 'inv-pp', name: 'Passport' }],
      }
    );
    assert.equal(saved[0]?.label, 'Apply for renewed passport');
    assert.match(saved[0]?.remindAt ?? '', /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(result.reminderLabel, 'Apply for renewed passport');
  });
});

describe('composeAppliedReply class log', () => {
  it('does not keep Logged swimming when nothing was applied', () => {
    const reply = composeAppliedReply({
      actions: [{ type: 'log_class', title: 'swimming' }],
      modelReply: 'Logged swimming.',
      classLoggedTitle: null,
    });
    assert.match(reply, /no swimming pack/i);
  });
});

const unusedInv = {
  addItem: async () => {
    throw new Error('unused');
  },
  updateItem: async () => {},
  removeItem: async () => {},
};

function memoryClasses() {
  const packs: ClassPack[] = [];
  return {
    packs,
    api: {
      addPack: async (input: NewClassPackInput) => {
        const existing = findClassPack(packs, input.title, input.personId);
        if (existing && (!input.personId || existing.personId === input.personId)) {
          const merged = mergeClassPackUpdate(existing, input);
          if (!merged) return existing;
          const i = packs.findIndex((p) => p.id === existing.id);
          packs[i] = merged;
          return merged;
        }
        const pack = createClassPack(input);
        packs.unshift(pack);
        return pack;
      },
      logClass: async (id: string, date?: string) => {
        const i = packs.findIndex((p) => p.id === id);
        if (i < 0) return null;
        packs[i] = toggleLogForDay(packs[i], date);
        return packs[i];
      },
      findPack: (title: string, personId?: string) =>
        findClassPack(packs, title, personId),
      getById: (id: string) => packs.find((p) => p.id === id),
      newestPack: () =>
        [...packs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
    },
  };
}
