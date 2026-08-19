import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createHouseholdMember } from '../household';
import {
  resolveAssignment,
  resolvePersonMention,
  resolveSelfDisplayName,
  selfAvatarInitial,
} from '../people';

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
  createHouseholdMember({
    id: 'kid',
    name: 'Arjun',
    role: 'child',
    relation: 'Son',
  }),
];

describe('self display name', () => {
  it('uses household self instead of placeholder You', () => {
    assert.equal(resolveSelfDisplayName('You', household), 'Pranesh');
    assert.equal(selfAvatarInitial('You', household), 'P');
  });

  it('prefers a real profile name', () => {
    assert.equal(resolveSelfDisplayName('Priya Ganesh', household), 'Priya Ganesh');
    assert.equal(selfAvatarInitial('Priya Ganesh', household), 'PG');
  });

  it('stays empty when there is no real name', () => {
    assert.equal(resolveSelfDisplayName('You', []), '');
    assert.equal(selfAvatarInitial('', []), '');
  });
});

describe('person mentions', () => {
  it('maps I attended to You, not spouse', () => {
    const hit = resolvePersonMention('I attended swimming', household);
    assert.equal(hit?.personId, 'you');
  });

  it('maps my son’s class to the child', () => {
    const hit = resolvePersonMention('I enrolled my son for skating', household);
    assert.equal(hit?.personId, 'kid');
  });

  it('preferSelf binds first-person enroll to You', () => {
    const hit = resolveAssignment({
      utterance: 'I enrolled for swimming',
      members: household,
      preferSelf: true,
    });
    assert.equal(hit?.personId, 'you');
  });
});
