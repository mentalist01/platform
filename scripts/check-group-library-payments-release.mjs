import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { groupLibraryEntitlement } from '../server/groupLibrary.js';

const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(js|css)$/.test(file));
const source = files.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
const features = files.filter(file => /^(?:StudentGroupLibrary|AdminPanel|CallSection|TeacherSubscriptionGate|teacherPlatformPayments|groupLibrary)-/.test(file)
  || (file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.student-group-library')));
for (const marker of ['Группы и записи', 'Слушать занятия', 'Все записи', 'Присоединиться слушателем', '/api/student-group-library', 'recordingParts', 'listenOnly', 'Имя плательщика в Т-банке', 'Автоотметка Т-банка подключена', '/api/teacher-subscription/notifications']) {
  assert.ok(source.includes(marker), `Missing group/payment feature: ${marker}`);
}
assert.ok(features.some(file => file.endsWith('.css')), 'Group library styles missing');
console.log('Student library, receive-only call and administrator payer controls verified.');
if (mode === 'verify') {
  const response = (route, token) => fetch(`https://ivan100.ru${route}`, {
    headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000),
  });
  const get = async (route, token) => {
    const res = await response(route, token);
    assert.ok(res.ok, `${route.split('?')[0]}: HTTP ${res.status}`);
    return res;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production serves another client');
  const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
  for (const asset of new Set([...initial, ...features.map(file => `/assets/${file}`)])) {
    assert.equal(digest(Buffer.from(await (await get(asset)).arrayBuffer())), digest(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  for (const route of ['/api/student-group-library', '/api/teacher-subscription/notifications']) assert.ok([401, 403].includes((await response(route)).status), 'Anonymous access must be denied');
  assert.ok(dataDirectory, 'DATA_DIR required for read-only verification');
  const read = (name, fallback) => fs.existsSync(path.join(dataDirectory, name + '.json')) ? JSON.parse(fs.readFileSync(path.join(dataDirectory, name + '.json'), 'utf8')) : fallback;
  const sessions = read('auth-sessions', []).filter(entry => !entry.expiresAtMs || entry.expiresAtMs > Date.now());
  const groups = read('learning-groups', []), students = read('students', []), blocks = read('learning-subscriptions', { blocks: [] }).blocks, lessons = read('learning-lesson-sessions', []);
  const candidate = sessions.filter(entry => entry.user?.role === 'student').map(session => ({ session, student: students.find(entry => entry.id === session.user.id) }))
    .find(({ student }) => groupLibraryEntitlement(student, groups, blocks, lessons));
  assert.ok(candidate?.session.token, 'An existing group student session is required for verification');
  const beforeGroups = read('learning-groups', []).map(group => ({ id: group.id, members: group.members, pricePerLesson: group.pricePerLesson }));
  const beforePayments = read('teacher-subscriptions', {});
  const libraryResponse = await get('/api/student-group-library', candidate.session.token);
  assert.ok(libraryResponse.headers.get('Cache-Control')?.includes('no-store'));
  const library = await libraryResponse.json();
  assert.equal(library.allowed, true);
  const groupById = new Map(groups.map(group => [group.id, group]));
  for (const group of library.groups) {
    assert.equal(groupById.get(group.id)?.teacherId, candidate.student.teacherId, 'Another teacher group leaked');
    assert.deepEqual(Object.keys(group).sort(), ['id', 'name']);
  }
  for (const entry of [...library.lessons, ...library.recordings]) {
    assert.equal(groupById.get(entry.groupId)?.teacherId, candidate.student.teacherId);
    assert.equal(entry.status === 'cancelled', false);
    assert.ok(Object.keys(entry).every(key => ['id', 'groupId', 'groupName', 'topic', 'startAt', 'durationMinutes', 'status', 'ownGroup', 'canListen', 'recordingParts'].includes(key)), 'Private group data leaked');
    for (const part of entry.recordingParts) assert.ok(part.url && part.embedUrl);
  }
  assert.deepEqual(read('learning-groups', []).map(group => ({ id: group.id, members: group.members, pricePerLesson: group.pricePerLesson })), beforeGroups, 'Library must preserve membership and existing prices');
  assert.deepEqual(read('teacher-subscriptions', {}), beforePayments, 'Reading the library must not mark real payments');
  const teacher = sessions.find(entry => entry.user?.role === 'teacher');
  assert.ok(teacher?.token, 'An existing teacher session is required for verification');
  assert.equal((await response('/api/teacher-subscription/notifications', teacher.token)).status, 403);
  const status = await (await get('/api/teacher-subscription', teacher.token)).json();
  assert.equal(typeof status.autoPaymentEnabled, 'boolean');
  assert.equal(typeof status.payerName, 'string');
  const admin = sessions.find(entry => entry.user?.role === 'admin');
  if (admin) {
    const history = await (await get('/api/teacher-subscription/notifications', admin.token)).json();
    assert.ok(history.notifications.every(entry => entry.paymentTarget === 'teacher-platform'));
  }
  console.log('Exact public bundles, protected live APIs, teacher isolation and preservation of prices, memberships and payments verified without real test data.');
}
