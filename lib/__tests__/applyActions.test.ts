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
  pickAttendancePack,
  mergeClassPackUpdate,
  toggleLogForDay,
  type ClassPack,
  type NewClassPackInput,
} from '../classes';
import { createHouseholdMember } from '../household';
import {
  PlanLimitError,
  planById,
  wouldExceedAssetLimit,
  wouldExceedHomeLimit,
  wouldExceedMemberLimit,
} from '../planLimits';

describe('plan limit helpers', () => {
  it('does not block assets/homes/members on any current SKU', () => {
    const trial = planById('free');
    assert.equal(wouldExceedAssetLimit(trial, 100), false);
    assert.equal(wouldExceedHomeLimit(trial, 1), false);
    assert.equal(wouldExceedMemberLimit(trial, 3), false);
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

  it('pulls merchant from utterance when model omits it', async () => {
    const expenses: { title: string; merchant?: string; amount: number }[] = [];
    const applied = await applyChatActions(
      [
        {
          type: 'add_expense',
          title: 'Juice',
          amount: '13',
          currency: 'AED',
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
        lastUserText: 'I got a juice from Spinis for 13 dirhams today',
        expenses: {
          addExpense: async (input) => {
            expenses.push({
              title: input.title,
              merchant: input.merchant,
              amount: input.amount,
            });
            return {
              id: 'exp-2',
              title: input.title,
              amount: input.amount,
              merchant: input.merchant,
            };
          },
        },
      }
    );
    assert.equal(expenses[0]?.merchant, 'Spinis');
    assert.equal(
      composeAppliedReply({
        actions: [
          {
            type: 'add_expense',
            title: 'Juice',
            amount: '13',
            currency: 'AED',
          },
        ],
        modelReply: 'Logged Juice — 13.',
        loggedExpenseTitle: applied.loggedExpenseTitle,
        loggedExpenseAmount: applied.loggedExpenseAmount,
        loggedExpenseMerchant: applied.loggedExpenseMerchant,
      }),
      'Logged Juice at Spinis — AED 13.'
    );
  });

  it('vague show after expense opens that expense, not a stale inventory focus', async () => {
    const logged = await applyChatActions(
      [
        {
          type: 'add_expense',
          title: 'Juice',
          amount: '13',
          currency: 'AED',
          merchant: 'Spinneys',
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
        lastUserText: 'I spent 13 dirhams at Spinneys for juice',
        expenses: {
          addExpense: async (input) => ({
            id: 'exp-1',
            title: input.title,
            amount: input.amount,
            merchant: input.merchant,
          }),
        },
      }
    );
    assert.equal(logged.loggedExpenseId, 'exp-1');

    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-tv' }] as ChatAction[],
      {
        addItem: async () => {
          throw new Error('unused');
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      {
        lastUserText: 'show the item',
        fallbackFocusId: 'inv-tv',
        lastFocusExpenseId: 'exp-1',
        inventoryList: [{ id: 'inv-tv', name: 'TV' }],
      }
    );
    assert.equal(show.openExpenseId, 'exp-1');
    assert.equal(show.openItemId, null);
  });

  it('show me after expense opens expense, not newest inventory', async () => {
    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-mac' }] as ChatAction[],
      {
        addItem: async () => {
          throw new Error('unused');
        },
        updateItem: async () => {},
        removeItem: async () => {},
      },
      'talk',
      {
        lastUserText: 'Show me',
        fallbackFocusId: 'inv-mac',
        lastFocusExpenseId: 'exp-juice',
        inventoryList: [{ id: 'inv-mac', name: 'MacBook Pro' }],
      }
    );
    assert.equal(show.openExpenseId, 'exp-juice');
    assert.equal(show.openItemId, null);
  });

  it('remaps update_item on yogurt spend to update_expense', async () => {
    const patches: { id: string; patch: { amount?: number } }[] = [];
    const row = {
      id: 'exp-y',
      title: 'Greek yogurt',
      amount: 13,
      merchant: 'Spinney',
    };
    const applied = await applyChatActions(
      [
        {
          type: 'update_item',
          id: 'not-an-item',
          patch: { price: '5 dirhams' },
        },
      ] as ChatAction[],
      {
        addItem: async () => {
          throw new Error('unused');
        },
        updateItem: async () => {
          throw new Error('should not update inventory');
        },
        removeItem: async () => {},
      },
      'talk',
      {
        lastUserText:
          'Actually update the price of the Greek yogurt that I got from Spinney to five dirhams',
        resolveItem: () => undefined,
        expenses: {
          addExpense: async () => {
            throw new Error('unused');
          },
          updateExpense: async (id, patch) => {
            patches.push({ id, patch });
          },
          getById: (id) => (id === row.id ? row : undefined),
        },
        expensesList: [row],
        lastFocusExpenseId: 'exp-y',
      }
    );
    assert.equal(patches.length, 1);
    assert.equal(patches[0]?.id, 'exp-y');
    assert.equal(patches[0]?.patch.amount, 5);
    assert.equal(applied.updatedExpense, true);
    assert.equal(applied.loggedExpenseTitle, 'Greek yogurt');
  });

  it('remaps update_item category-only to expense', async () => {
    const patches: { id: string; patch: { category?: string } }[] = [];
    const row = { id: 'exp-y', title: 'Greek yogurt', amount: 13 };
    await applyChatActions(
      [
        {
          type: 'update_item',
          id: 'bogus',
          patch: { category: 'food' },
        },
      ] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'Change the Greek yogurt category to food',
        resolveItem: () => undefined,
        expenses: {
          addExpense: async () => {
            throw new Error('unused');
          },
          updateExpense: async (id, patch) => {
            patches.push({ id, patch });
          },
          getById: (id) => (id === row.id ? row : undefined),
        },
        expensesList: [row],
      }
    );
    assert.equal(patches[0]?.id, 'exp-y');
    assert.equal(patches[0]?.patch.category, 'food');
  });

  it('show my last expense opens expense not MacBook', async () => {
    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-mac' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'show me my last expense',
        fallbackFocusId: 'inv-mac',
        lastFocusExpenseId: 'exp-juice',
        inventoryList: [{ id: 'inv-mac', name: 'MacBook Pro' }],
      }
    );
    assert.equal(show.openExpenseId, 'exp-juice');
    assert.equal(show.openItemId, null);
  });

  it('open_expense uses last spend not inventory', async () => {
    const show = await applyChatActions(
      [{ type: 'open_expense' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'open that',
        fallbackFocusId: 'inv-mac',
        lastFocusExpenseId: 'exp-juice',
      }
    );
    assert.equal(show.openExpenseId, 'exp-juice');
    assert.equal(show.openItemId, null);
  });

  it('removes an expense and does not claim success when skip', async () => {
    const removed: string[] = [];
    const row = { id: 'exp-y', title: 'Greek yogurt', amount: 5 };
    const applied = await applyChatActions(
      [{ type: 'remove_expense', id: 'exp-y' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'delete the greek yogurt expense',
        expenses: {
          addExpense: async () => {
            throw new Error('unused');
          },
          updateExpense: async () => {},
          removeExpense: async (id) => {
            removed.push(id);
          },
          getById: (id) => (id === row.id ? row : undefined),
        },
        expensesList: [row],
      }
    );
    assert.deepEqual(removed, ['exp-y']);
    assert.equal(applied.removedExpenseTitle, 'Greek yogurt');
    assert.equal(
      composeAppliedReply({
        actions: [{ type: 'remove_expense', id: 'missing' }],
        modelReply: 'Deleted Greek yogurt.',
        removedExpenseTitle: null,
      }).toLowerCase().includes('couldn'),
      true
    );
  });

  it('drops habit check-in when the utterance is class enrollment', async () => {
    const checks: string[] = [];
    const { packs, api } = memoryClasses();
    await applyChatActions(
      [{ type: 'habit_check_in', title: 'Swimming' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'I enrolled for a swimming class',
        classes: api,
        habits: {
          addHabit: async () => {
            throw new Error('should not create habit on enroll');
          },
          checkIn: async (id) => {
            checks.push(id);
            return null;
          },
          findByTitle: () => undefined,
          getById: () => undefined,
        },
      }
    );
    assert.equal(packs[0]?.title, 'Swimming');
    assert.deepEqual(checks, []);
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

  it('does not log my swimming against my spouse’s pack', async () => {
    const { packs, api } = memoryClasses();
    const household = [
      createHouseholdMember({
        id: 'you',
        name: 'Pranesh',
        role: 'adult',
        relation: 'You',
      }),
      createHouseholdMember({
        id: 'wife',
        name: 'Priya',
        role: 'adult',
        relation: 'Wife',
      }),
    ];
    await api.addPack({
      title: 'Swimming',
      total: 12,
      personId: 'wife',
      assignedTo: 'Priya',
    });
    await api.addPack({
      title: 'Swimming',
      total: 8,
      personId: 'you',
      assignedTo: 'Pranesh',
    });
    const result = await applyChatActions(
      [{ type: 'log_class', title: 'swimming' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'I attended swimming',
        classes: api,
        household,
      }
    );
    const mine = packs.find((p) => p.personId === 'you');
    const hers = packs.find((p) => p.personId === 'wife');
    assert.equal(mine?.logs.length, 1);
    assert.equal(hers?.logs.length, 0);
    assert.equal(result.classLoggedTitle, 'Swimming');
    assert.equal(result.lastAssignedTo, 'Pranesh');
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
            return { id: 'ld-1', label: input.label, remindAt: input.remindAt };
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

  it('does not claim Updated when update_item was skipped', () => {
    const reply = composeAppliedReply({
      actions: [
        {
          type: 'update_item',
          id: 'missing',
          patch: { price: 'AED 5' },
        },
      ],
      modelReply: 'Updated the price of Greek yogurt to AED 5.',
      updatedIds: [],
      updatedExpense: false,
      loggedExpenseTitle: null,
    });
    assert.match(reply, /couldn.?t update/i);
  });

  it('does not claim Logged expense when apply skipped amount', () => {
    const reply = composeAppliedReply({
      actions: [{ type: 'add_expense', title: 'Coffee', amount: 'nope' }],
      modelReply: 'Logged Coffee — nope.',
      loggedExpenseTitle: null,
    });
    assert.match(reply, /couldn.?t log that expense/i);
  });

  it('says Opening that expense when openExpenseId applied', () => {
    const reply = composeAppliedReply({
      actions: [{ type: 'open_item', id: 'inv-1' }],
      modelReply: 'Opening that item.',
      openExpenseId: 'exp-1',
      openItemId: null,
    });
    assert.equal(reply, 'Opening that expense.');
  });
});

describe('talk focus across modules', () => {
  it('show me after habit opens the habit, not newest inventory', async () => {
    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-mac' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'Show me',
        fallbackFocusId: 'inv-mac',
        lastTalkFocus: { kind: 'habit', id: 'hab-1' },
        inventoryList: [{ id: 'inv-mac', name: 'MacBook Pro' }],
        habitsList: [{ id: 'hab-1', title: 'Walk' }],
      }
    );
    assert.equal(show.openItemId, null);
    assert.equal(show.openExpenseId, null);
    assert.deepEqual(show.openTarget, { kind: 'habit', id: 'hab-1' });
  });

  it('show me after subscription opens the subscription', async () => {
    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-mac' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'show it',
        fallbackFocusId: 'inv-mac',
        lastTalkFocus: { kind: 'subscription', id: 'sub-1' },
        inventoryList: [{ id: 'inv-mac', name: 'MacBook Pro' }],
      }
    );
    assert.deepEqual(show.openTarget, { kind: 'subscription', id: 'sub-1' });
    assert.equal(show.openItemId, null);
  });

  it('show me with no focus does not open newest inventory', async () => {
    const show = await applyChatActions(
      [{ type: 'open_item', id: 'inv-mac' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'Show me',
        fallbackFocusId: 'inv-mac',
        inventoryList: [{ id: 'inv-mac', name: 'MacBook Pro' }],
      }
    );
    assert.equal(show.openItemId, null);
    assert.equal(show.openTarget, null);
  });

  it('delete that after habit remaps remove_item to the habit', async () => {
    const removed: string[] = [];
    const applied = await applyChatActions(
      [{ type: 'remove_item', id: 'bogus' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'delete that',
        lastTalkFocus: { kind: 'habit', id: 'hab-1' },
        habits: {
          addHabit: async () => {
            throw new Error('unused');
          },
          checkIn: async () => null,
          findByTitle: () => undefined,
          getById: (id) =>
            id === 'hab-1'
              ? ({
                  id: 'hab-1',
                  title: 'Walk',
                  categoryId: 'health',
                  logs: [],
                  createdAt: '',
                } as never)
              : undefined,
          removeHabit: async (id) => {
            removed.push(id);
          },
        },
        habitsList: [{ id: 'hab-1', title: 'Walk' }],
      }
    );
    assert.deepEqual(removed, ['hab-1']);
    assert.equal(applied.removedHabitTitle, 'Walk');
    assert.equal(applied.talkFocus, null);
  });

  it('updates class pack total from Talk', async () => {
    const { packs, api } = memoryClasses();
    await api.addPack({ title: 'Skating', total: 12 });
    const id = packs[0].id;
    const applied = await applyChatActions(
      [
        {
          type: 'update_class_pack',
          id,
          patch: { total: 20 },
        },
      ] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'change skating to 20 classes',
        classes: api,
        classPacksList: [{ id, title: 'Skating' }],
        lastTalkFocus: { kind: 'class', id },
      }
    );
    assert.equal(applied.updatedClassPack, true);
    assert.equal(applied.classPackTotal, 20);
    assert.equal(applied.talkFocus?.kind, 'class');
    assert.equal(packs[0].total, 20);
  });

  it('removes a Last Done activity', async () => {
    const removed: string[] = [];
    const applied = await applyChatActions(
      [{ type: 'remove_last_done', id: 'ld-1' }] as ChatAction[],
      unusedInv,
      'talk',
      {
        lastUserText: 'delete that reminder',
        lastDone: {
          logDone: async () => {
            throw new Error('unused');
          },
          remove: async (id) => {
            removed.push(id);
          },
        },
        lastDoneList: [{ id: 'ld-1', label: 'Apply for passport' }],
        lastTalkFocus: { kind: 'lastDone', id: 'ld-1' },
      }
    );
    assert.deepEqual(removed, ['ld-1']);
    assert.equal(applied.removedLastDoneLabel, 'Apply for passport');
  });

  it('compose opens the focused module, not a Thing', () => {
    const reply = composeAppliedReply({
      actions: [{ type: 'open_item', id: 'inv-1' }],
      modelReply: 'Opening that item.',
      openTarget: { kind: 'habit', id: 'hab-1' },
      openItemId: null,
    });
    assert.equal(reply, 'Opening that habit.');
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
      pickAttendance: (opts: { title?: string; personId?: string }) =>
        pickAttendancePack(packs, opts),
      getById: (id: string) => packs.find((p) => p.id === id),
      newestPack: () =>
        [...packs].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],
      updatePack: async (id: string, patch: Partial<ClassPack>) => {
        const i = packs.findIndex((p) => p.id === id);
        if (i >= 0) packs[i] = { ...packs[i], ...patch, id: packs[i].id };
      },
    },
  };
}
