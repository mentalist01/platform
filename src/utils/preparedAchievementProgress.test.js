import test from 'node:test';
import assert from 'node:assert/strict';
import { hasPreparedAchievementProgress as changed } from './preparedAchievementProgress.js';

const run = cards => ({ id: 'lesson', version: 1, cards });
const card = { id: 'task', status: 'active', answers: [''], attachments: [{ assetId: 'file', solution: null }] };

test('a complete check and a solve missed while reconnecting wake achievement notifications', () => {
  const solved = run([{ ...card, status: 'solved' }]);
  assert.equal(changed(run([card]), solved), true);
  assert.equal(changed(null, solved), true);
  assert.equal(changed(solved, solved), false);
  assert.equal(changed(run([card]), run([{ ...card, status: 'active', fieldResults: ['correct', null] }])), false);
});

test('typing, wrong answers, moving, skipping, theory and code signals do not refresh achievements', () => {
  const before = run([card, { id: 'done', status: 'solved' }]);
  for (const patch of [{ answers: ['123'], answerRevision: 2 }, { lastResult: 'wrong' }, { width: 1500, height: 400 }, { status: 'skipped' }]) {
    assert.equal(changed(before, run([{ ...card, ...patch }, before.cards[1]])), false);
  }
  assert.equal(changed(before, { changeOnly: true, version: 2 }), false);
  assert.equal(changed(before, run([...before.cards, { id: 'theory', kind: 'theory', status: 'reviewed' }])), false);
  assert.equal(changed(before, null), false);
});

test('a helper save or teacher confirmation after checking can add achievement evidence', () => {
  const solved = { ...card, status: 'solved', achievementParticipants: [{ id: 'student', independent: false }] };
  const saved = { ...solved, attachments: [{ assetId: 'file', solution: { id: 'solution', revision: 1 } }] };
  assert.equal(changed(run([solved]), run([saved])), true);
  assert.equal(changed(run([saved]), run([{ ...saved, width: 2000 }])), false);
  assert.equal(changed(run([solved]), run([{ ...solved, achievementParticipants: [{ id: 'student', independent: true }] }])), true);
});
