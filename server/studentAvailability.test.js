import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStudentAvailabilityStore } from './studentAvailability.js';

const earlier = Date.parse('2026-10-07T12:00:00Z');
const later = earlier + 1000;
const config = (patch = {}) => ({ durationMinutes: 60, startMinute: 600, endMinute: 720, days: [0, 1], ...patch });
const answer = (choices, updatedAt = earlier, version = 1) => ({ choices, updatedAt, version });
const owner = { teacherId: 'teacher', studentId: 'student' };
const remember = (store, choices, options = {}) => store.remember({ ...owner, config: config(),
  answer: answer(choices), sourceGroupId: 'source', sourceRoundId: 'round', ...options });
const seed = (store, patch = {}) => store.seed({ ...owner, config: config(), ...patch });
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'student-availability-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const file = path.join(directory, 'student-availability.json');
  return { directory, file, store: createStudentAvailabilityStore(file) };
}

test('personal choices survive reload, project only matching intervals, and are isolated by owner and duration', t => {
  const { file, store } = fixture(t);
  assert.equal(seed(store), null);
  assert.equal(remember(store, { '0-600': 'yes', '1-630': 'maybe' }), true);
  assert.deepEqual(seed(createStudentAvailabilityStore(file)), {
    version: 1, choices: { '0-600': 'yes', '1-630': 'maybe' }, updatedAt: earlier, importedPersonal: true,
  });
  assert.equal(seed(store, { teacherId: 'another' }), null);
  assert.equal(seed(store, { studentId: 'another' }), null);
  assert.equal(seed(store, { config: config({ durationMinutes: 30 }) }), null);
  assert.equal(seed(store, { config: config({ days: [5, 6] }) }), null);
  assert.deepEqual(seed(store, { config: config({ days: [1], startMinute: 630 }) }).choices, { '1-630': 'maybe' });
});

test('removing a choice stores an explicit refusal and narrow grids do not erase other saved intervals', t => {
  const { store } = fixture(t);
  remember(store, { '0-600': 'yes', '1-600': 'maybe' });
  remember(store, {}, { config: config({ days: [0] }), answer: answer({}, later) });
  assert.deepEqual(seed(store).choices, { '1-600': 'maybe' });
  assert.equal(remember(store, { '0-600': 'yes' }, { answer: answer({ '0-600': 'yes' }, earlier - 1) }), false);
  assert.deepEqual(seed(store).choices, { '1-600': 'maybe' }, 'An old migration cannot revive a removed choice');
});

test('free-hours blocked slots preserve personal preferences while visible omissions clear them', t => {
  const { store } = fixture(t);
  remember(store, { '0-600': 'yes', '1-600': 'maybe' });
  remember(store, {}, { answer: answer({}, later), blocked: { '0-600': ['2026-10-12'] } });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes' });
  assert.equal(seed(store).updatedAt, later);
  remember(store, {}, { answer: { ...answer({}, later + 1000), personalBlockedSlots: ['0-600'] } });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes' }, 'A reset/removal re-snapshot keeps saved blocked-slot context');
});

test('legacy free-hours omissions cannot erase older personal marks without original blocked-slot context', t => {
  const { store } = fixture(t);
  const groups = ['old', 'new'].map(id => ({ id, teacherId: 'teacher', members: [{ studentId: 'student', status: 'removed' }] }));
  store.migrate({ groups, students: [{ id: 'student', teacherId: 'teacher' }], polls: {
    old: { id: 'old-round', config: config(), includeBusyTimes: true, answers: { student: answer({ '0-600': 'yes' }) } },
    new: { id: 'new-round', config: config(), includeBusyTimes: false, answers: { student: answer({ '1-600': 'maybe' }, later) } },
  } });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes', '1-600': 'maybe' });
});

test('a saved empty answer is still personal knowledge and copied answers never manufacture newer preferences', t => {
  const { store } = fixture(t);
  remember(store, {});
  const projected = seed(store);
  assert.deepEqual(projected.choices, {});
  assert.equal(projected.importedPersonal, true);
  assert.equal(remember(store, {}, { answer: { ...projected, updatedAt: later }, sourceGroupId: 'other' }), false);
  assert.equal(seed(store).updatedAt, earlier);
});

test('later pupil versions within the same timestamp win, unrelated equal timestamps do not replace them', t => {
  const { store } = fixture(t);
  remember(store, { '0-600': 'yes' });
  remember(store, {}, { answer: answer({}, earlier, 2) });
  assert.deepEqual(seed(store).choices, {});
  assert.equal(remember(store, { '0-600': 'yes' }, { sourceGroupId: 'other', sourceRoundId: 'other' }), false);
  assert.deepEqual(seed(store).choices, {});
});

test('legacy migration includes removed pupils, uses latest actual answers and persists its one-time marker', t => {
  const { store, file } = fixture(t);
  const groups = [
    { id: 'old', teacherId: 'teacher', members: [{ studentId: 'student', status: 'removed' }] },
    { id: 'new', teacherId: 'teacher', members: [{ studentId: 'student', status: 'active' }] },
    { id: 'foreign', teacherId: 'foreign', members: [{ studentId: 'student', status: 'active' }] },
  ];
  const students = [{ id: 'student', teacherId: 'teacher' }, { id: 'deleted', teacherId: 'teacher', deletedAt: 'date' }];
  const polls = {
    old: { id: 'old-round', config: config(), answers: { student: answer({ '0-600': 'yes' }) } },
    new: { id: 'new-round', config: config({ days: [1] }), answers: { student: answer({ '1-600': 'maybe' }, later) } },
    foreign: { id: 'foreign-round', config: config(), answers: { student: answer({}, later + 1000) } },
  };
  assert.deepEqual(store.migrate({ groups, polls, students }), { migrated: true, remembered: 2 });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes', '1-600': 'maybe' });
  polls.new.answers.student = answer({}, later + 2000);
  assert.deepEqual(createStudentAvailabilityStore(file).migrate({ groups, polls, students }), { migrated: false, remembered: 0 });
  assert.deepEqual(seed(createStudentAvailabilityStore(file)).choices, { '0-600': 'yes', '1-600': 'maybe' });
});

test('migration restores receipt originals with explicit source configuration and never uses synthetic transfer timestamps', t => {
  const { store } = fixture(t);
  const groups = ['old', 'new'].map(id => ({ id, teacherId: 'teacher', members: [{ studentId: 'student' }] }));
  const sourceAnswer = answer({ '0-600': 'yes' });
  const polls = {
    old: { id: 'newer-old-round', config: config({ durationMinutes: 30 }), answers: {} },
    new: { id: 'destination-round', config: config(), answers: { student: { ...answer({ '0-600': 'yes' }, later),
      teacherNotification: { id: 'group-availability:destination-round:student:transfer-id' } } },
      memberTransfers: { student: { sourceGroupId: 'old', sourceRoundId: 'actual-old-round', sourceConfig: config(), sourceAnswer } } },
  };
  store.migrate({ groups, polls, students: [{ id: 'student', teacherId: 'teacher' }] });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes' });
  assert.equal(seed(store).updatedAt, earlier);
});

test('legacy receipts without source configuration require a matching original round', t => {
  const { store } = fixture(t);
  const groups = ['old', 'new'].map(id => ({ id, teacherId: 'teacher', members: [{ studentId: 'student' }] }));
  const polls = {
    old: { id: 'old-round', config: config(), answers: {} },
    new: { id: 'new-round', config: config(), answers: {}, memberTransfers: { student: { sourceGroupId: 'old',
      sourceAnswer: { ...answer({ '1-600': 'maybe' }), teacherNotification: { id: 'group-availability:old-round:student:2' } },
      history: [{ sourceGroupId: 'old', sourceAnswer: { ...answer({ '0-600': 'yes' }, later),
        teacherNotification: { id: 'group-availability:different-round:student:1' } } }],
    } } },
  };
  store.migrate({ groups, polls, students: [{ id: 'student', teacherId: 'teacher' }] });
  assert.deepEqual(seed(store).choices, { '1-600': 'maybe' });
});

test('invalid inputs and corrupt stores fail closed; malformed migration entries do not discard valid answers', t => {
  const { store, file } = fixture(t);
  assert.throws(() => remember(store, { '0-600': 'no' }), /Invalid student availability choice/);
  assert.throws(() => seed(store, { config: config({ endMinute: Infinity }) }), /configuration/);
  assert.throws(() => seed(store, { teacherId: '__proto__' }), /owner/);
  assert.equal(seed(store), null);
  const group = { id: 'source', teacherId: 'teacher', members: [{ studentId: 'student' }, { studentId: 'invalid' }] };
  store.migrate({ groups: [group], students: [{ id: 'student', teacherId: 'teacher' }, { id: 'invalid', teacherId: 'teacher' }],
    polls: { source: { id: 'round', config: config(), answers: { student: answer({ '0-600': 'yes' }), invalid: answer({ '99-999': 'yes' }) } } } });
  assert.deepEqual(seed(store).choices, { '0-600': 'yes' });
  fs.writeFileSync(file, JSON.stringify({ version: 1, migrationVersion: 1, teachers: { teacher: { student: { durations: {
    60: { slots: { '0-600': { choice: 'yes', updatedAt: null } } },
  } } } } }));
  assert.throws(() => createStudentAvailabilityStore(file), /Invalid student availability slot/);
});

test('a failed atomic write throws and does not publish unsaved preferences in memory', t => {
  const { store, file } = fixture(t);
  fs.mkdirSync(file);
  assert.throws(() => remember(store, { '0-600': 'yes' }));
  assert.equal(seed(store), null);
});
