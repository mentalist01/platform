import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import test from 'node:test';
import { registerMessageTemplates, messageAvailabilityWeek, rankMessageGroups } from './messageTemplates.js';
import { getCalendarFreeIntervalsByDay } from '../src/utils/calendarAvailabilityShare.js';
import { DEFAULT_MESSAGE_TEMPLATES, fillMessageTemplate, missingMessageVariables } from '../src/utils/messageTemplates.js';

test('messages preserve punctuation and unknown placeholders; pasted numbers are never interpreted as replacement patterns', () => {
  const text = fillMessageTemplate('{{имя}}, {{группа}} — {{расписание}}. {{имя}}', { имя: '$& Иван', группа: 'Группа 3' });
  assert.equal(text, '$& Иван, Группа 3 — {{расписание}}. $& Иван');
  assert.deepEqual(missingMessageVariables(text), ['расписание']);
});

test('available time excludes real recurring lessons, cancellations, date ranges, midnight tails and the past', () => {
  const start = '2026-11-02', now = Date.parse('2026-11-02T10:30:00+03:00');
  const events = messageAvailabilityWeek([
    { weekdayKey: 'monday', time: '12:00', durationMinutes: 60, studentName: 'Private pupil' },
    { weekdayKey: 'monday', time: '13:00', durationMinutes: 60, repeatFrom: '2026-11-09' },
    { weekdayKey: 'monday', time: '14:00', cancelledDates: [start] },
    { date: start, time: '15:00', durationMinutes: 60, cancelled: true },
    { date: start, time: '23:30', durationMinutes: 120 },
  ], start, now);
  assert.equal(JSON.stringify(events).includes('Private pupil'), false);
  const days = getCalendarFreeIntervalsByDay(events);
  assert.deepEqual(days[0], [{ startMinutes: 630, endMinutes: 720 }, { startMinutes: 780, endMinutes: 1410 }]);
  assert.deepEqual(days[1], [{ startMinutes: 480, endMinutes: 1440 }]);
  assert.ok(events.some(event => event.dayIndex === 1 && event.startMinutes === 0 && event.endMinutes === 90));
});

test('group suggestions use current members and the furthest Python topic before total solve count', () => {
  const catalog = [{ number: 101, title: 'Ввод', displayNumber: '1' }, { number: 105, title: 'Циклы', displayNumber: '2' }];
  const testsDb = { 101: { python: [{ id: 'one' }, { id: 'two' }] }, 105: { python: [{ id: 'loop' }] } };
  const students = ['early', 'later', 'former'].map(id => ({ id, teacherId: 't', name: id }));
  const solved = (number, ids) => ({ solvedByTask: { [number]: { python: { solved: ids } } } });
  const groups = [
    { id: 'later', name: 'Группа 1', teacherId: 't', members: [{ studentId: 'later', status: 'active' }], schedule: [] },
    { id: 'early', name: 'Группа 3', teacherId: 't', members: [{ studentId: 'early', status: 'active' }, { studentId: 'former', status: 'removed' }], schedule: [{ weekdayKey: 'tuesday', time: '16:00' }, { weekdayKey: 'thursday', time: '19:00' }] },
    { id: 'old', teacherId: 't', status: 'completed', members: [] },
  ];
  const ranked = rankMessageGroups({ groups, students, testsDb, catalog,
    entries: [{ groupId: 'early', weekdayKey: 'friday', time: '17:00' }, { groupId: 'later', weekdayKey: 'wednesday', time: '18:30' }],
    progressDb: { early: solved(101, ['one', 'two']), later: solved(105, ['loop']), former: solved(105, ['loop']) } });
  assert.deepEqual(ranked.map(group => group.id), ['early', 'later']);
  assert.equal(ranked[0].topicTitle, 'Ввод');
  const body = DEFAULT_MESSAGE_TEMPLATES.find(template => template.id === 'after-trial').body;
  const messages = ranked.map(({ schedule, scheduleDays }) => fillMessageTemplate(body, { расписание: schedule, 'дни группы': scheduleDays }));
  assert.match(messages[0], /вторник в 16:00 и четверг в 19:00/);
  assert.match(messages[0], /перейдёшь к ним на вторник и четверг\./);
  assert.match(messages[1], /среда в 18:30/);
  assert.match(messages[1], /перейдёшь к ним на среду\./);
  assert.deepEqual(messages.map(missingMessageVariables), [[], []]);
});

test('template writes persist per teacher, reject stale edits, and never expose the calendar to pupils', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'message-templates-'));
  const app = express(); app.use(express.json());
  app.use((req, res, next) => { req.auth = { id: req.headers['x-user'] || 'teacher-a', role: req.headers['x-role'] || 'teacher' }; next(); });
  const dependencies = { dataDir: root, groups: () => [], students: () => [{ id: 'a', teacherId: 'teacher-a' }, { id: 'b', teacherId: 'teacher-b' }], progress: () => ({}), tests: () => ({}), catalog: [],
    getEntries: async () => { throw Error('Calendar unreachable'); } };
  registerMessageTemplates(app, dependencies);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); fs.rmSync(root, { recursive: true, force: true }); });
  const base = 'http://127.0.0.1:' + server.address().port;
  const request = async (route = '', body, headers = {}, method = body ? 'PUT' : 'GET') => {
    const response = await fetch(base + '/api/message-templates' + route, { method,
      headers: { 'Content-Type': 'application/json', ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, ...await response.json() };
  };
  const initial = await request(), original = initial.templates[0];
  assert.equal(initial.templates.length, 3);
  const change = { ...original, name: 'После пробного · личный', body: 'Текст для {{имя}}' };
  const saved = await request('/' + original.id, change);
  assert.equal(saved.status, 200);
  assert.equal((await request('/' + original.id, change)).status, 409);
  assert.equal((await request()).templates[0].body, change.body);
  assert.equal((await request('', undefined, { 'x-user': 'teacher-b' })).templates[0].body, original.body);
  assert.equal((await request('', undefined, { 'x-role': 'student' })).status, 403);
  assert.equal((await request('/context', undefined, { 'x-role': 'student' })).status, 403);
  const context = await request('/context');
  assert.equal(context.events, null);
  assert.match(context.calendarError, /календарь/);
  const removed = await request('/' + original.id, { revision: saved.template.revision }, {}, 'DELETE');
  assert.equal(removed.templates.length, 2);
  assert.equal((await request()).templates.length, 2);
  const reviewRoute = '/review-status/a/2026-11';
  let review = (await request(reviewRoute)).record;
  assert.equal(review.status, 'not-asked');
  const originalRevision = review.revision;
  for (const status of ['asked', 'later', 'received']) {
    const result = await request(reviewRoute, { status, revision: review.revision });
    assert.equal(result.status, 200);
    review = result.record;
    assert.equal((await request(reviewRoute)).record.status, status);
  }
  assert.equal((await request(reviewRoute, { status: 'asked', revision: originalRevision })).status, 409);
  assert.equal((await request('/review-status/a/2026-12')).record.status, 'not-asked');
  assert.equal((await request('/review-status/b/2026-11')).status, 404);
  assert.equal((await request(reviewRoute, undefined, { 'x-user': 'teacher-b' })).status, 404);
  assert.equal((await request(reviewRoute, undefined, { 'x-role': 'student' })).status, 403);
  assert.equal((await request('/review-status/a/2026-13')).status, 400);
});
