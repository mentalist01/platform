import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPlacementComparison, comparisonDurations } from './groupPlacementComparison.js';

const config = { durationMinutes: 60, startMinute: 600, endMinute: 840, days: [0, 1, 2] };
const own = choices => [{ durationMinutes: 60, config, answer: { choices } }];
const group = { mode: 'forming', slots: [] };
const student = { id: 'new', name: 'Новый ученик' };
const model = (answers, poll, extra = {}) => buildPlacementComparison({ student, answers, group, snapshot: { poll }, duration: 60, ...extra });

test('comparison shows the union of all selected starts, including those with no group match', () => {
  const result = model(own({ '0-600': 'yes', '1-630': 'maybe' }), { config, members: [{ id: 'a' }, { id: 'b' }], answers: {
    a: { choices: { '0-600': 'yes', '2-720': 'yes' } }, b: { choices: { '0-600': 'maybe' } },
  } });
  assert.deepEqual(result.rows.map(row => row.id), ['0-600', '1-630', '2-720']);
  assert.deepEqual(result.rows.map(row => [row.common, row.flexible]), [[true, true], [false, false], [false, false]]);
  assert.deepEqual(result.rows[2].choices, ['unmarked', 'yes', 'unmarked']);
});

test('no answer, explicit refusal and slots outside a poll cannot become a match', () => {
  const result = model(own({ '0-600': 'yes', '1-630': 'yes' }), { config: { ...config, days: [0] }, members: [{ id: 'a' }, { id: 'b' }], answers: {
    a: { choices: { '0-600': 'no' } },
  } });
  assert.deepEqual(result.rows[0].choices, ['yes', 'no', 'pending']);
  assert.deepEqual(result.rows[1].choices, ['yes', 'outside', 'pending']);
  assert.ok(result.rows.every(row => !row.common));
});

test('exact duration is required; approved schedule remains visible even when nobody chose it', () => {
  const planned = { mode: 'schedule', slots: [{ id: '2-600', day: 2, minutes: 600, time: '10:00', end: '11:30', durationMinutes: 90 }] };
  assert.deepEqual(comparisonDurations(planned, { poll: { config } }, own({})), [60, 90]);
  const result = model(own({ '2-600': 'yes' }), { config, members: [{ id: 'a' }], answers: { a: { choices: { '2-600': 'yes' } } } }, { group: planned, duration: 90 });
  assert.equal(result.missingOwn, true);
  assert.deepEqual(result.rows[0].choices, ['pending', 'outside']);
  assert.equal(result.rows[0].scheduled, true);
  assert.equal(result.rows[0].common, false);
});

test('candidate is not counted twice and teacher conflicts stay visible', () => {
  const poll = { config, members: [student, { id: 'a' }], answers: { a: { choices: { '0-600': 'yes' } } } };
  const result = model(own({ '0-600': 'yes' }), poll, { snapshot: { poll, blocked: { '0-600': ['2026-10-19'] } } });
  assert.equal(result.columns.length, 2);
  assert.equal(result.rows[0].common, true);
  assert.equal(result.rows[0].blocked, true);
  assert.equal(model(own({ '0-600': 'yes' }), { config, members: [], answers: {} }).rows[0].common, false);
});

test('comparison is read-only and gracefully handles a group without questionnaires', () => {
  const input = { student, answers: own({ '0-600': 'yes' }), group, snapshot: { poll: null }, duration: 60 };
  const before = structuredClone(input);
  const result = buildPlacementComparison(input);
  assert.deepEqual(input, before);
  assert.equal(result.columns.length, 1);
  assert.equal(result.rows.length, 1);
});
import { buildAvailabilityTryOn } from './groupPlacementComparison.js';

test('try-on overlays one candidate in the original group grid without altering answers, votes or membership', () => {
  const config = { days: [0, 1], startMinute: 600, endMinute: 720, durationMinutes: 60 };
  const snapshot = { poll: { config, members: [{ id: 'a', name: 'Анна' }], answers: { a: { choices: { '0-600': 'yes' } } }, proposal: { id: 'kept' } } };
  const saved = structuredClone(snapshot);
  const candidate = { id: 'new', name: 'Новый' };
  const answers = [{ durationMinutes: 60, config: { ...config, days: [0] }, answer: { choices: { '0-600': 'maybe' } } }];
  const poll = buildAvailabilityTryOn(snapshot, candidate, answers);
  assert.equal(poll.members.length, 2); assert.equal(poll.members[1].candidate, true);
  assert.equal(poll.answers.new.choices['0-600'], 'maybe');
  assert.equal(poll.answers.new.choices['1-600'], 'outside');
  assert.equal(poll.answers.new.choices['0-630'], 'no');
  assert.deepEqual(snapshot, saved);
  assert.equal(buildAvailabilityTryOn(snapshot, candidate, [{ ...answers[0], durationMinutes: 90 }]).answers.new, undefined);
  assert.equal(buildAvailabilityTryOn({ poll }, candidate, answers).members.filter(member => member.id === 'new').length, 1);
});
