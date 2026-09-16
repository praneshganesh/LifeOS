import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  agendaQueryScope,
  hrefForAgendaScope,
  resolveLocalIntent,
} from '../chat/localIntents';

describe('agenda / reminder list intents', () => {
  it('maps common list phrases to a scope', () => {
    assert.equal(agendaQueryScope('show me my reminders'), 'reminders');
    assert.equal(agendaQueryScope("What's in store for tomorrow?"), 'tomorrow');
    assert.equal(agendaQueryScope("What's in-store for tomorrow"), 'tomorrow');
    assert.equal(agendaQueryScope('What are my priorities today?'), 'today');
    assert.equal(agendaQueryScope("What's my to-do?"), 'today');
    assert.equal(agendaQueryScope("what's my todo"), 'today');
    assert.equal(agendaQueryScope("what's coming up"), 'upcoming');
    assert.equal(agendaQueryScope('Remind me to stretch tomorrow'), null);
  });

  it('replies without creating actions', () => {
    const local = resolveLocalIntent('What are my priorities today?', {
      openHabits: [{ title: 'Walk' }],
      reminders: [
        { label: 'PE uniform', remindAt: '2099-01-01' },
        { label: 'Pack lunch', remindAt: new Date().toISOString().slice(0, 10) },
      ],
    });
    assert.ok(local);
    assert.equal(local!.actions[0]?.type, 'none');
    assert.match(local!.reply, /Today/i);
    assert.match(local!.reply, /Walk/);
    assert.match(local!.reply, /Pack lunch/);
    assert.equal(hrefForAgendaScope('today'), '/(tabs)/');
    assert.equal(hrefForAgendaScope('reminders'), '/(tabs)/done');
  });
});
