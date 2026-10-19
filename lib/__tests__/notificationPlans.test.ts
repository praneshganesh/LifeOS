import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { planDatedReminderFires } from '../reminderAlerts';
import { planExpiryNotifications } from '../expiryPlan';
import { DEFAULT_NOTIFICATION_PREFS } from '../notificationPrefs';
import type { InventoryItem } from '../InventoryContext';
import type { Subscription } from '../subscriptions';

const prefs = { ...DEFAULT_NOTIFICATION_PREFS };

function stamp(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function thing(patch: Partial<InventoryItem>): InventoryItem {
  return {
    id: 'i1',
    name: 'Living room TV',
    brand: 'Samsung',
    category: 'Electronics',
    room: '—',
    spaceId: 's1',
    icon: 'tv',
    purchaseDate: '2025-01-01',
    price: '—',
    warrantyExpiry: '—',
    warrantyActive: false,
    condition: '—',
    serial: '—',
    estimatedValue: '—',
    timeline: [],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...patch,
  };
}

describe('dated reminder fires', () => {
  const base = { label: 'Change AC filter', createdAt: '2026-01-01T00:00:00.000Z' };

  it('never schedules anything for a reminder that is already past (no fire on app open)', () => {
    const now = new Date(2026, 9, 18, 19, 0);
    const fires = planDatedReminderFires({ ...base, remindAt: '2026-10-10' }, prefs, now);
    assert.deepEqual(fires, []);
  });

  it('all-day reminder due today after 5 PM only gets the morning-after overdue nudge', () => {
    const now = new Date(2026, 9, 18, 18, 0);
    const fires = planDatedReminderFires({ ...base, remindAt: '2026-10-18' }, prefs, now);
    assert.deepEqual(fires.map((f) => stamp(f.at)), ['2026-10-19 09:00']);
    assert.match(fires[0]!.body, /overdue/);
  });

  it('upcoming all-day reminder follows the preview schedule plus the overdue nudge', () => {
    const now = new Date(2026, 9, 18, 12, 0);
    const fires = planDatedReminderFires({ ...base, remindAt: '2026-10-20' }, prefs, now);
    assert.deepEqual(fires.map((f) => stamp(f.at)), [
      '2026-10-20 09:00',
      '2026-10-20 17:00',
      '2026-10-21 09:00',
    ]);
  });

  it('respects custom quiet hours for non-final alerts', () => {
    const now = new Date(2026, 9, 18, 12, 0);
    const fires = planDatedReminderFires(
      { ...base, remindAt: '2026-10-20' },
      { quietHoursStart: '08:00', quietHoursEnd: '10:00' },
      now
    );
    assert.ok(!fires.some((f) => stamp(f.at) === '2026-10-20 09:00'));
  });
});

describe('expiry notifications', () => {
  const now = new Date(2026, 9, 18, 12, 0);

  it('plans warranty alerts 30 and 7 days out at 9 AM', () => {
    const plan = planExpiryNotifications({
      inventory: [thing({ warrantyExpiry: '2026-12-31' })],
      subscriptions: [],
      reminders: [],
      prefs,
      now,
    });
    assert.deepEqual(plan.map((p) => stamp(p.at)), ['2026-12-01 09:00', '2026-12-24 09:00']);
    assert.equal(plan[0]!.href, '/asset/i1');
  });

  it('skips past lead times and items covered by a linked reminder', () => {
    const plan = planExpiryNotifications({
      inventory: [
        thing({ id: 'soon', warrantyExpiry: '2026-10-30' }),
        thing({
          id: 'pp',
          name: 'Passport',
          isDocument: true,
          category: 'Documents',
          expiryDate: '2027-06-01',
        }),
      ],
      subscriptions: [],
      reminders: [{ inventoryItemId: 'pp', remindAt: '2026-12-01' }],
      prefs,
      now,
    });
    assert.deepEqual(plan.map((p) => p.id), ['lifeos-exp-warranty-soon-7']);
  });

  it('plans subscription renewals 2 days ahead and honours toggles', () => {
    const sub: Subscription = {
      id: 'netflix',
      title: 'Netflix',
      amount: 45,
      currency: 'AED',
      cycle: 'monthly',
      renewsOn: '2026-10-25',
      category: 'streaming',
      createdAt: '2026-01-01T00:00:00.000Z',
    } as Subscription;
    const on = planExpiryNotifications({ inventory: [], subscriptions: [sub], reminders: [], prefs, now });
    assert.deepEqual(on.map((p) => stamp(p.at)), ['2026-10-23 09:00']);
    const off = planExpiryNotifications({
      inventory: [],
      subscriptions: [sub],
      reminders: [],
      prefs: { ...prefs, subscriptions: false },
      now,
    });
    assert.deepEqual(off, []);
    const muted = planExpiryNotifications({
      inventory: [],
      subscriptions: [sub],
      reminders: [],
      prefs: { ...prefs, push: false },
      now,
    });
    assert.deepEqual(muted, []);
  });
});
