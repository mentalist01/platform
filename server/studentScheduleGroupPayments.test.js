import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudentGroupPaymentEntryResolver } from './studentScheduleGroupPayments.js';

const session = { id: 'session', teacherId: 'teacher', lessonId: 'actual-lesson', groupId: 'group', date: '2026-10-07', time: '20:00', durationMinutes: 60 };
const imported = { ...session, id: 'google-pupil', lessonId: 'old-google-lesson', studentId: 'pupil', paymentSourceIds: ['google-event', 'google-pupil'] };
const resolver = entries => createStudentGroupPaymentEntryResolver(entries, 'pupil', entry => [entry.id, `${entry.id}:pupil`]);

test('historical Google rows retain both payment identities and use the actual lesson participation', () => {
  const result = resolver([session])(imported);
  assert.equal(result.id, imported.id);
  assert.equal(result.lessonId, 'actual-lesson');
  assert.deepEqual(new Set(result.paymentSourceIds), new Set(['google-pupil', 'google-event', 'session', 'session:pupil']));
  assert.equal(imported.lessonId, 'old-google-lesson');
});

test('payment identities never cross pupils, teachers, groups, dates, times or durations', () => {
  const resolve = resolver([session]);
  for (const change of [{ studentId: 'other' }, { teacherId: 'other' }, { groupId: 'other' }, { date: '2026-10-09' }, { time: '21:00' }, { durationMinutes: 90 }]) {
    const entry = { ...imported, ...change };
    assert.equal(resolve(entry), entry);
  }
  const individual = { ...imported, groupId: '' };
  assert.equal(resolve(individual), individual);
});

test('ambiguous sessions and calendar outages do not erase debts or guess a payment source', () => {
  assert.equal(resolver([])(imported), imported);
  assert.equal(resolver([session, { ...session, id: 'second-session' }])(imported), imported);
});
