import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  alignReplyWithActions,
  currencyFromUtterance,
  expenseIdFromSummary,
  formatExpenseAmount,
  isIsoDate,
  merchantFromUtterance,
  repairActions,
  validateAction,
  validateActions,
} from '../chat.mjs';
import {
  adjustCompletedCount,
  createClassPack,
  remainingCount,
  usedCount,
} from '../../lib/classes.ts';
import { localDayKey } from '../../lib/dates.ts';

describe('chat-api ISO date helper', () => {
  it('accepts valid real calendar dates', () => {
    assert.equal(isIsoDate('2026-08-28'), true);
    assert.equal(isIsoDate('2026-02-28'), true);
    assert.equal(isIsoDate('2024-02-29'), true); // leap year
    assert.equal(isIsoDate('2026-12-31'), true);
  });

  it('rejects invalid or non-existent calendar dates', () => {
    assert.equal(isIsoDate('2026-99-99'), false);
    assert.equal(isIsoDate('2026-02-30'), false);
    assert.equal(isIsoDate('2026-04-31'), false);
    assert.equal(isIsoDate('2025-02-29'), false); // not leap year
    assert.equal(isIsoDate('next Tuesday'), false);
    assert.equal(isIsoDate('2026/08/28'), false);
    assert.equal(isIsoDate(''), false);
    assert.equal(isIsoDate(null), false);
    assert.equal(isIsoDate(undefined), false);
  });
});

describe('chat-api action validation', () => {
  it('validates add_item requires non-empty name', () => {
    assert.equal(validateAction({ type: 'add_item', name: 'MacBook Air' }), true);
    assert.equal(validateAction({ type: 'add_item', name: '   ' }), false);
    assert.equal(validateAction({ type: 'add_item' }), false);
  });

  it('validates update_item requires non-empty id and non-empty patch', () => {
    assert.equal(
      validateAction({ type: 'update_item', id: 'inv-1', patch: { brand: 'Apple' } }),
      true
    );
    assert.equal(validateAction({ type: 'update_item', id: '', patch: { brand: 'Apple' } }), false);
    assert.equal(validateAction({ type: 'update_item', id: 'inv-1', patch: {} }), false);
    assert.equal(validateAction({ type: 'update_item', id: 'inv-1' }), false);
  });

  it('validates remove_item and open_item require id', () => {
    assert.equal(validateAction({ type: 'remove_item', id: 'inv-1' }), true);
    assert.equal(validateAction({ type: 'remove_item' }), false);
    assert.equal(validateAction({ type: 'open_item', id: 'inv-1' }), true);
    assert.equal(validateAction({ type: 'open_item', id: '' }), false);
  });

  it('validates add_expense requires title and numeric amount', () => {
    assert.equal(
      validateAction({ type: 'add_expense', title: 'Coffee', amount: 25, currency: 'AED' }),
      true
    );
    assert.equal(
      validateAction({ type: 'add_expense', title: 'Groceries', amount: '120.50' }),
      true
    );
    assert.equal(validateAction({ type: 'add_expense', title: '', amount: 25 }), false);
    assert.equal(validateAction({ type: 'add_expense', title: 'Coffee', amount: 'invalid' }), false);
    assert.equal(validateAction({ type: 'add_expense', title: 'Coffee' }), false);
  });

  it('validates add_subscription requires title and valid amount', () => {
    assert.equal(
      validateAction({ type: 'add_subscription', title: 'Netflix', amount: 45, cycle: 'monthly' }),
      true
    );
    assert.equal(validateAction({ type: 'add_subscription', title: '', amount: 45 }), false);
  });

  it('validates habit_check_in requires title', () => {
    assert.equal(validateAction({ type: 'habit_check_in', title: 'Walk' }), true);
    assert.equal(validateAction({ type: 'habit_check_in', title: '' }), false);
  });

  it('validates add_class_pack requires title', () => {
    assert.equal(
      validateAction({ type: 'add_class_pack', title: 'Skating', total: 12 }),
      true
    );
    assert.equal(validateAction({ type: 'add_class_pack', title: '' }), false);
  });

  it('validates log_class requires title or id, but rejects personId alone', () => {
    assert.equal(validateAction({ type: 'log_class', title: 'Skating' }), true);
    assert.equal(validateAction({ type: 'log_class', id: 'cls-1' }), true);
    assert.equal(validateAction({ type: 'log_class', personId: 'fm-1' }), false);
    assert.equal(validateAction({ type: 'log_class' }), false);
  });

  it('validates log_done requires label', () => {
    assert.equal(validateAction({ type: 'log_done', label: 'Serviced AC' }), true);
    assert.equal(validateAction({ type: 'log_done', label: '' }), false);
  });

  it('validates set_reminder requires label and valid ISO remindAt date', () => {
    assert.equal(
      validateAction({ type: 'set_reminder', label: 'Renew Passport', remindAt: '2026-09-01' }),
      true
    );
    assert.equal(validateAction({ type: 'set_reminder', label: 'Renew Passport' }), false);
    assert.equal(
      validateAction({ type: 'set_reminder', label: 'Renew Passport', remindAt: 'next Tuesday' }),
      false
    );
    assert.equal(
      validateAction({ type: 'set_reminder', label: 'Renew Passport', remindAt: '2026-99-99' }),
      false
    );
    assert.equal(validateAction({ type: 'set_reminder', label: '', remindAt: '2026-09-01' }), false);
  });

  it('validates rename_person requires non-empty from and to', () => {
    assert.equal(validateAction({ type: 'rename_person', from: 'Sara', to: 'Saara' }), true);
    assert.equal(validateAction({ type: 'rename_person', from: 'Sara', to: '' }), false);
    assert.equal(validateAction({ type: 'rename_person', from: '', to: 'Saara' }), false);
    assert.equal(validateAction({ type: 'rename_person', to: 'Saara' }), false);
  });

  it('drops none when meaningful actions exist in validateActions()', () => {
    const mixed = [
      { type: 'none' },
      { type: 'add_expense', title: 'Coffee', amount: 15 },
    ];
    const filtered = validateActions(mixed);
    assert.equal(filtered.length, 1);
    assert.equal(filtered[0].type, 'add_expense');
  });

  it('drops invalid actions but keeps valid multi-actions in validateActions()', () => {
    const mixed = [
      { type: 'add_expense', title: 'Coffee', amount: 15 },
      { type: 'remove_item' }, // invalid: missing id
      { type: 'log_done', label: 'Cleaned filters' },
      { type: 'set_reminder', label: 'Renew', remindAt: 'invalid' }, // invalid: non-iso date
    ];
    const filtered = validateActions(mixed);
    assert.equal(filtered.length, 2);
    assert.equal(filtered[0].type, 'add_expense');
    assert.equal(filtered[1].type, 'log_done');
  });

  it('returns [none] when all actions in array are invalid', () => {
    assert.deepEqual(validateActions([{ type: 'unknown_type' }]), [{ type: 'none' }]);
    assert.deepEqual(validateActions([]), [{ type: 'none' }]);
  });
});

describe('chat-api entity resolution & utterance helpers', () => {
  it('extracts merchants from spoken text', () => {
    assert.equal(
      merchantFromUtterance('I spent 45 dirhams at Starbucks this morning'),
      'Starbucks'
    );
    assert.equal(
      merchantFromUtterance('got groceries from Spinneys for 120'),
      'Spinneys'
    );
    assert.equal(merchantFromUtterance('coffee 25 dirhams'), undefined);
  });

  it('extracts currency exclusively from spoken text', () => {
    assert.equal(currencyFromUtterance('spent 25 dirhams on coffee'), 'AED');
    assert.equal(currencyFromUtterance('spent 50 dollars on groceries'), 'USD');
    assert.equal(currencyFromUtterance('spent 100 euros on shoes'), 'EUR');
    assert.equal(currencyFromUtterance('spent 500 rupees on dinner'), 'INR');
    assert.equal(currencyFromUtterance('spent 45 on coffee'), '');
    assert.equal(currencyFromUtterance(''), '');
  });

  it('finds existing expense id from summary by title and merchant', () => {
    const expenses = [
      { id: 'exp-1', title: 'Yogurt', amount: 12, merchant: 'Carrefour' },
      { id: 'exp-2', title: 'Coffee', amount: 22, merchant: 'Starbucks' },
    ];
    assert.equal(expenseIdFromSummary('yogurt', expenses), 'exp-1');
    assert.equal(expenseIdFromSummary('coffee', expenses), 'exp-2');
    assert.equal(expenseIdFromSummary('fuel', expenses), undefined);
  });

  it('formats expense confirmation with currency when known', () => {
    assert.equal(
      formatExpenseAmount(25, 'AED', 'AED'),
      'AED 25'
    );
    assert.equal(
      formatExpenseAmount(40, 'USD', 'USD'),
      'USD 40'
    );
  });

  it('alignReplyWithActions generates deterministic confirmation for mutations', () => {
    const expenseReply = alignReplyWithActions('I logged your spend', [
      { type: 'add_expense', title: 'Coffee', amount: 25, currency: 'AED' },
    ]);
    assert.equal(expenseReply, 'Logged Coffee — AED 25.');

    const subReply = alignReplyWithActions('Added', [
      { type: 'add_subscription', title: 'Netflix', amount: 45, currency: 'USD' },
    ]);
    assert.equal(subReply, 'Added Netflix — USD 45.');

    const reminderReply = alignReplyWithActions('OK', [
      { type: 'set_reminder', label: 'Service Car', remindAt: '2026-09-01' },
    ]);
    assert.equal(reminderReply, 'Reminder set: Service Car — 2026-09-01.');
  });
});

describe('chat-api repairActions comprehensive coverage', () => {
  it('removes invented Good condition and preserves warranty', () => {
    const repaired = repairActions(
      [{ type: 'add_item', name: 'MacBook Air', condition: 'Good' }],
      { lastUserText: 'I got a new MacBook Air with warranty until 2028' }
    );
    assert.equal(repaired[0].condition, undefined);
    assert.equal(repaired[0].warrantyExpiry, '2028-12-31');
  });

  it('remaps update_item to update_expense when user is editing consumable spend', () => {
    const expenses = [{ id: 'exp-yogurt', title: 'Greek Yogurt', amount: 10 }];
    const repaired = repairActions(
      [{ type: 'update_item', id: 'exp-yogurt', patch: { price: '15' } }],
      {
        lastUserText: 'change yogurt to 15 dirhams',
        expensesSummary: expenses,
        defaultCurrency: 'AED',
      }
    );
    assert.equal(repaired[0].type, 'update_expense');
    assert.equal(repaired[0].id, 'exp-yogurt');
    assert.equal(repaired[0].patch.amount, '15');
    assert.equal(repaired[0].patch.currency, 'AED');
  });

  it('remaps vague delete to session focus entity', () => {
    const repaired = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'delete that',
      sessionFocus: { kind: 'habit', id: 'hab-walk' },
    });
    assert.equal(repaired[0].type, 'remove_habit');
    assert.equal(repaired[0].id, 'hab-walk');
  });

  it('remaps vague show to session focus entity', () => {
    const repaired = repairActions([{ type: 'open_item' }], {
      lastUserText: 'show me',
      sessionFocus: { kind: 'subscription', id: 'sub-netflix' },
    });
    assert.equal(repaired[0].type, 'open_subscription');
    assert.equal(repaired[0].id, 'sub-netflix');
  });

  it('preserves newly spoken names as assignedTo without inventing a fake personId', () => {
    const household = [{ id: 'fm-1', name: 'Pranesh', relation: 'You' }];
    const repaired = repairActions(
      [{ type: 'add_class_pack', title: 'Piano', assignedTo: 'Maya' }],
      {
        lastUserText: 'I enrolled Maya for piano class',
        household,
      }
    );
    assert.equal(repaired[0].assignedTo, 'Maya');
    assert.equal(repaired[0].personId, undefined);
  });
});

describe('class-pack full lifecycle & schedule regression', () => {
  it('handles full lifecycle: enrollment with initial completed count → Q&A → attendance log → updated counts', () => {
    // Step 1: Enrollment
    const createdPack = createClassPack({
      title: 'Skating',
      total: 12,
      completed: 6,
      scheduleDays: ['saturday'],
      scheduleTime: '10:00 AM',
      startsOn: '2026-08-01',
      endsOn: '2026-11-01',
      assignedTo: 'Ishaan',
      personId: 'fm-ishaan',
    });

    assert.equal(createdPack.title, 'Skating');
    assert.equal(createdPack.total, 12);
    assert.equal(usedCount(createdPack), 6);
    assert.equal(remainingCount(createdPack), 6);
    assert.deepEqual(createdPack.scheduleDays, ['saturday']);
    assert.equal(createdPack.scheduleTime, '10:00 AM');
    assert.equal(createdPack.endsOn, '2026-11-01');

    // Step 2, 3, 4: Context verification for Q&A
    const summaryRow = {
      id: createdPack.id,
      title: createdPack.title,
      total: createdPack.total,
      used: usedCount(createdPack),
      remaining: remainingCount(createdPack),
      startsOn: createdPack.startsOn,
      endsOn: createdPack.endsOn,
      scheduleDays: createdPack.scheduleDays,
      scheduleTime: createdPack.scheduleTime,
      assignedTo: createdPack.assignedTo,
      personId: createdPack.personId,
    };
    assert.equal(summaryRow.remaining, 6);
    assert.deepEqual(summaryRow.scheduleDays, ['saturday']);
    assert.equal(summaryRow.scheduleTime, '10:00 AM');
    assert.equal(summaryRow.endsOn, '2026-11-01');

    // Step 5: Attendance logging (Ishaan went skating today)
    const updatedPack = {
      ...createdPack,
      logs: [...createdPack.logs, { id: 'clog-today', doneAt: localDayKey() }],
    };
    assert.equal(usedCount(updatedPack), 7);
    assert.equal(remainingCount(updatedPack), 5);

    // Step 6: Remaining count update
    const updatedSummaryRow = {
      ...summaryRow,
      used: usedCount(updatedPack),
      remaining: remainingCount(updatedPack),
    };
    assert.equal(updatedSummaryRow.used, 7);
    assert.equal(updatedSummaryRow.remaining, 5);
  });
});

describe('comprehensive conversational scenarios (A through M)', () => {
  it('Scenario H & I: handles vague open and vague delete after class creation using session focus', () => {
    const sessionFocus = { kind: 'class', id: 'cls-skating-101' };

    // Vague open
    const openRes = repairActions([{ type: 'open_item' }], {
      lastUserText: 'Show me.',
      sessionFocus,
    });
    assert.equal(openRes[0].type, 'open_class');
    assert.equal(openRes[0].id, 'cls-skating-101');

    // Vague delete
    const deleteRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Delete that.',
      sessionFocus,
    });
    assert.equal(deleteRes[0].type, 'remove_class_pack');
    assert.equal(deleteRes[0].id, 'cls-skating-101');
  });

  it('Scenario J & K: handles vague open and vague delete after expense using session focus', () => {
    const sessionFocus = { kind: 'expense', id: 'exp-starbucks-25' };

    // Vague open
    const openRes = repairActions([{ type: 'open_item' }], {
      lastUserText: 'Show me.',
      sessionFocus,
    });
    assert.equal(openRes[0].type, 'open_expense');
    assert.equal(openRes[0].id, 'exp-starbucks-25');

    // Vague delete
    const deleteRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Delete that.',
      sessionFocus,
    });
    assert.equal(deleteRes[0].type, 'remove_expense');
    assert.equal(deleteRes[0].id, 'exp-starbucks-25');
  });

  it('Scenario L: disambiguates multiple class packs for one person by title rather than personId alone', () => {
    const classPacks = [
      { id: 'cls-swim', title: 'Swimming', assignedTo: 'Ishaan', personId: 'fm-ishaan' },
      { id: 'cls-skate', title: 'Skating', assignedTo: 'Ishaan', personId: 'fm-ishaan' },
    ];

    // Attendance mentioning skating
    const repaired = repairActions(
      [{ type: 'log_class', title: 'Skating' }],
      {
        lastUserText: 'Ishaan went skating today',
        classPacksSummary: classPacks,
      }
    );
    assert.equal(repaired[0].type, 'log_class');
    assert.equal(repaired[0].title, 'Skating');
    // Validation verifies it has title or id
    assert.equal(validateAction(repaired[0]), true);
  });

  it('prevents repairNavigationAction from cross-module falling back to open_item on open_class', () => {
    const repaired = repairActions([{ type: 'open_class', id: 'cls-custom' }], {
      lastUserText: 'open skating class',
      sessionFocus: null,
      inventorySummary: [],
    });
    assert.equal(repaired[0].type, 'open_class');
    assert.equal(repaired[0].id, 'cls-custom');
  });

  it('handles vague delete across all non-item modules with session focus', () => {
    // 1. Subscription
    const subRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Cancel that.',
      sessionFocus: { kind: 'subscription', id: 'sub-netflix' },
    });
    assert.equal(subRes[0].type, 'remove_subscription');
    assert.equal(subRes[0].id, 'sub-netflix');

    // 2. Habit
    const habRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Delete that.',
      sessionFocus: { kind: 'habit', id: 'hab-walk' },
    });
    assert.equal(habRes[0].type, 'remove_habit');
    assert.equal(habRes[0].id, 'hab-walk');

    // 3. Class pack
    const clsRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Delete that.',
      sessionFocus: { kind: 'class', id: 'cls-swim' },
    });
    assert.equal(clsRes[0].type, 'remove_class_pack');
    assert.equal(clsRes[0].id, 'cls-swim');

    // 4. Last done
    const ldRes = repairActions([{ type: 'remove_item' }], {
      lastUserText: 'Delete that.',
      sessionFocus: { kind: 'lastDone', id: 'ld-ac' },
    });
    assert.equal(ldRes[0].type, 'remove_last_done');
    assert.equal(ldRes[0].id, 'ld-ac');
  });

  it('handles short conversational flows correctly', () => {
    // Habit check in vs log_done
    const habitRes = repairActions([{ type: 'habit_check_in', title: 'Walk' }], {
      lastUserText: 'I walked today',
    });
    assert.equal(habitRes[0].type, 'habit_check_in');

    // Class enroll drops habit check in
    const enrollRes = repairActions(
      [
        { type: 'add_class_pack', title: 'Swimming' },
        { type: 'habit_check_in', title: 'Swimming' },
      ],
      {
        lastUserText: 'I enrolled for swimming',
      }
    );
    assert.equal(enrollRes.length, 1);
    assert.equal(enrollRes[0].type, 'add_class_pack');

    // Reminder with ISO date
    assert.equal(
      validateAction({ type: 'set_reminder', label: 'Service AC', remindAt: '2026-09-01' }),
      true
    );
  });
});

