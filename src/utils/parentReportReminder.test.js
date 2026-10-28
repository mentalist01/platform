import test from 'node:test';
import assert from 'node:assert/strict';
import { parentReportPeriod, parentReportRecipients, personalizeParentReport, readParentReportSnooze, snoozeParentReports } from './parentReportReminder.js';

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
