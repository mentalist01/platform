import test from 'node:test';
import assert from 'node:assert/strict';
import { parentReportPeriod, parentReportRecipients, PARENT_REPORT_NEXT_CYCLE, personalizeParentReport, readParentReportSnooze, skipParentReportReminder, snoozeParentReports } from './parentReportReminder.js';

test('monthly reminder runs from the 25th through the next Moscow 15th inclusive', () => {
  assert.equal(parentReportPeriod(Date.parse('2026-10-24T20:59:59Z')).due, false);
  assert.deepEqual(parentReportPeriod(Date.parse('2026-10-24T21:00:00Z')), { month: '2026-10', date: '2026-10-25', due: true });
  assert.deepEqual(parentReportPeriod(Date.parse('2026-10-31T21:00:00Z')), {month:'2026-10', date:'2026-11-01', due:true});
  assert.deepEqual(parentReportPeriod(Date.parse('2026-11-15T20:59:59.999Z')), {month:'2026-10', date:'2026-11-15', due:true});
  assert.deepEqual(parentReportPeriod(Date.parse('2026-11-15T21:00:00Z')), {month:'2026-11', date:'2026-11-16', due:false});
  assert.equal(parentReportPeriod(Date.parse('2027-01-01T00:00:00+03:00')).month, '2026-12');
});

test('recipients include only accessible pupils with valid contacts and use the existing month status', () => {
  const students = [{ id: 'a', name: 'Анна', monthlyReportSentMonths: { '2026-10': 'sent-at' } }, { id: 'b', name: 'Борис', studyStatus: 'inactive' }, { id: 'c', deletedAt: 'deleted' }, { id: 'd' }, { id: 'e' }];
  const contacts = { a: { name: 'Мама', url: '@example_parent' }, b: { url: 'https://max.ru/u/test' }, c: { url: 'https://wa.me/79990000000' }, e: { url: 'javascript:alert(1)' }, outsider: { url: '@example_parent' } };
  const rows = parentReportRecipients(students, contacts, '2026-10');
  assert.deepEqual(rows.map(row => row.student.id), ['b', 'a']);
  assert.equal(rows[0].sent, false); assert.equal(rows[1].sent, true);
  assert.equal(parentReportRecipients(students, contacts, '2026-11').every(row => !row.sent), true);
});

test('snooze is scoped to the teacher/month, survives reload and expires the next Moscow day', () => {
  const data = new Map(), storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const now = Date.parse('2026-10-25T12:00:00Z');
  assert.equal(snoozeParentReports('teacher-a', now, storage), '2026-10-26');
  assert.equal(readParentReportSnooze('teacher-a', '2026-10', storage), '2026-10-26');
  assert.equal(readParentReportSnooze('teacher-b', '2026-10', storage), '');
  assert.equal(readParentReportSnooze('teacher-a', '2026-11', storage), '');
  const november=Date.parse('2026-11-03T12:00:00Z');
  assert.equal(snoozeParentReports('teacher-a',november,storage),'2026-11-04');
  assert.equal(readParentReportSnooze('teacher-a','2026-10',storage),'2026-11-04');
  assert.equal(readParentReportSnooze('teacher-a','2026-11',storage),'');
});

test('parent greeting uses the entered name and leaves the report facts and student text intact', () => {
  assert.equal(personalizeParentReport('Здравствуйте! Подвожу итоги.\nДомашка 70%.', ' Наталья  Ивановна '), 'Здравствуйте, Наталья Ивановна! Подвожу итоги.\nДомашка 70%.');
  assert.equal(personalizeParentReport('Здравствуйте! Итоги.', ''), 'Здравствуйте! Итоги.');
  assert.equal(personalizeParentReport('Привет, Иван! Твои итоги.', 'Наталья'), 'Привет, Иван! Твои итоги.');
});

test('skipping October preserves that dismissal on reopen and lets the November reminder appear', () => {
  const data = new Map();
  const storage = { getItem: key => data.get(key), setItem: (key, value) => data.set(key, value) };
  const november6 = Date.parse('2026-11-06T12:00:00+03:00');
  const october = parentReportPeriod(november6).month;
  assert.equal(october, '2026-10');
  assert.equal(skipParentReportReminder('teacher-a', october, storage), PARENT_REPORT_NEXT_CYCLE);
  assert.equal(snoozeParentReports('teacher-a', november6, storage, october), PARENT_REPORT_NEXT_CYCLE);
  assert.equal(readParentReportSnooze('teacher-a', october, storage), PARENT_REPORT_NEXT_CYCLE);
  assert.equal(readParentReportSnooze('teacher-b', october, storage), '');
  const next = parentReportPeriod(Date.parse('2026-11-25T12:00:00+03:00'));
  assert.equal(next.month, '2026-11');
  assert.equal(next.due, true);
  assert.equal(readParentReportSnooze('teacher-a', next.month, storage), '');
});

test('individual deferral only affects the selected pupil/month and is not a sent report', () => {
  const students = [
    { id: 'a', name: 'Анна', monthlyReportDeferredMonths: { '2026-10': 'deferred-at' } },
    { id: 'b', name: 'Борис' },
    { id: 'c', name: 'Вера', monthlyReportSentMonths: { '2026-10': 'sent-at' }, monthlyReportDeferredMonths: { '2026-10': 'old-defer' } },
  ];
  const contacts = Object.fromEntries(students.map(student => [student.id, { url: '@parent_test' }]));
  const october = parentReportRecipients(students, contacts, '2026-10');
  assert.deepEqual(october.map(row => [row.student.id, row.sent, row.deferred]), [['b', false, false], ['a', false, true], ['c', true, false]]);
  assert.equal(october.filter(row => !row.sent && !row.deferred).length, 1);
  assert.equal(parentReportRecipients(students, contacts, '2026-11').filter(row => !row.sent && !row.deferred).length, 3);
});
