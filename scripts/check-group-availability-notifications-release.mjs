import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { groupAvailabilityAnswerNotifications } from '../server/groupAvailabilityNotifications.js';
import { isCurrentStudent } from '../src/utils/studentStudyStatus.js';

const [mode, directory, dataDir] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const entry = initial.find(asset => /\/index-[^/]+\.js$/.test(asset));
assert.ok(entry, 'Client entry missing');
const source = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
for (const text of ['group-availability', 'Посмотреть выбранное время', 'Выбрано удобное время', 'Обновлён выбор времени', 'launch-group-availability', 'Закрыть ответы учеников']) {
  assert.ok(source.includes(text), `Missing notification feature: ${text}`);
}
const groups = source.match(/LearningGroupsSection-[A-Za-z0-9_-]+\.js/)?.[0];
assert.ok(groups, 'Group feature bundle missing');
const groupSource = fs.readFileSync(path.join(directory, 'assets', groups), 'utf8');
assert.ok(groupSource.includes('Мини-группа из уведомления больше недоступна.'), 'Targeted group navigation missing');
console.log('Student availability notifications and targeted group navigation verified.');

if (mode === 'verify') {
  const get = async (route, token = '') => {
    const response = await fetch(`https://ivan100.ru${route}`, {
      headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      signal: AbortSignal.timeout(25000),
    });
    assert.ok(response.ok, `GET ${route.split('?')[0]}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const published = (await get('/')).toString('utf8');
  assert.ok(initial.every(asset => published.includes(asset)), 'Production serves a different client');
  const digest = value => crypto.createHash('sha256').update(value).digest('hex');
  for (const asset of new Set([...initial, `/assets/${groups}`])) {
    assert.equal(digest(await get(asset)), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published asset differs: ${asset}`);
  }
  assert.ok(dataDir, 'Data directory required');
  const read = (name, fallback) => fs.existsSync(path.join(dataDir, name))
    ? JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8')) : fallback;
  const sessions = read('auth-sessions.json', []).filter(session => session.user?.role === 'teacher'
    && (!session.expiresAtMs || session.expiresAtMs > Date.now()))
    .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0));
  const session = sessions.find(value => read('learning-groups.json', []).some(group => group.teacherId === value.user.id && !group.deletedAt));
  assert.ok(session, 'A current teacher session with mini-groups is required');
  const notes = JSON.parse((await get(`/api/teacher-solved-events?${new URLSearchParams({ teacherId: session.user.id, limit: '200' })}`, session.token)).toString('utf8'));
  assert.ok(Array.isArray(notes), 'Teacher notification feed unavailable');
  const polls = Object.entries(read('group-availability.json', {})).map(([groupId, poll]) => ({ groupId, ...poll }));
  const students = read('students.json', []).filter(isCurrentStudent);
  const expected = new Map(groupAvailabilityAnswerNotifications(polls, read('learning-groups.json', []), students, session.user.id).map(note => [note.id, note]));
  const teacher = read('teachers.json', []).find(value => value.id === session.user.id);
  const readIds = new Set(teacher?.readSolvedEventIds || []);
  const readBefore = Date.parse(teacher?.solvedEventsReadBefore || '') || 0;
  const actual = notes.filter(note => note.source === 'group-availability');
  for (const note of actual) {
    assert.deepEqual(note, expected.get(note.id), 'Availability notification differs from the saved answer');
    assert.ok(!readIds.has(note.id) && Date.parse(note.solvedAt) > readBefore, 'Read notification returned');
  }
  const oldest = Math.min(...notes.map(note => Date.parse(note.solvedAt)));
  for (const note of expected.values()) {
    if (readIds.has(note.id) || Date.parse(note.solvedAt) <= readBefore) continue;
    if (notes.length < 200 || Date.parse(note.solvedAt) > oldest) {
      assert.ok(actual.some(value => value.id === note.id), 'Unread availability answer missing');
    }
  }
  console.log(`Exact published assets and current teacher notification feed verified; ${actual.length} availability answers. No test answers or push messages were sent.`);
}
