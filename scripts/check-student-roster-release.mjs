import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { normalizeLearningGroupList } from '../src/utils/learningGroups.js';
import { studentRosterGroups } from '../src/utils/studentRosterGroups.js';
import { isCurrentStudent, isInactiveStudent } from '../src/utils/studentStudyStatus.js';

const [mode, directory, dataDir] = process.argv.slice(2);
if (!['local', 'verify'].includes(mode) || !directory) throw Error('Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const entry = initial.find(asset => /\/index-[^/]+\.js$/.test(asset));
assert.ok(entry, 'Client entry missing');
const source = fs.readFileSync(path.join(directory, entry.slice(1)), 'utf8');
const features = [...new Set([...source.matchAll(/TeacherPanel-[A-Za-z0-9_-]+\.(?:js|css)/g)].map(match => `/assets/${match[0]}`))];
const js = features.find(asset => asset.endsWith('.js'));
const css = features.find(asset => asset.endsWith('.css'));
assert.ok(js && css, 'Teacher roster bundles missing');
const feature = fs.readFileSync(path.join(directory, js.slice(1)), 'utf8');
for (const text of ['Участники', 'Мини-группа:', 'Уточняем состав мини-групп', 'learning-groups-changed', 'teacher-student-card__group', 'aria-expanded']) assert.ok(feature.includes(text), `Missing roster feature: ${text}`);
const styles = fs.readFileSync(path.join(directory, css.slice(1)), 'utf8');
for (const selector of ['.teacher-student-group__toggle', '.teacher-student-group__body', '.teacher-student-card__group', '.teacher-student-roster']) assert.ok(styles.includes(selector), `Missing roster style: ${selector}`);
console.log('Expandable mini-group cards and membership badges verified.');
if (mode === 'verify') {
  const get = async (route, token = '') => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw Error(`GET ${route.split('?')[0]}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  };
  const published = (await get('/')).toString('utf8');
  assert.ok(initial.every(asset => published.includes(asset)), 'Production serves a different client');
  const hash = buffer => crypto.createHash('sha256').update(buffer).digest('hex');
  for (const asset of new Set([...initial, ...features])) assert.equal(hash(await get(asset)), hash(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  await get('/api/client-build-version');
  if (!dataDir) throw Error('Data directory required for current roster API verification');
  const read = name => JSON.parse(fs.readFileSync(path.join(dataDir, name), 'utf8'));
  const sessions = read('auth-sessions.json').filter(session => session.user?.role === 'teacher' && (!session.expiresAtMs || session.expiresAtMs > Date.now())).sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0));
  const groups = read('learning-groups.json');
  let verified = false;
  for (const session of sessions) {
    const expectedGroups = groups.filter(group => group.teacherId === session.user.id && !group.deletedAt && !group.completedAt && group.status !== 'completed');
    if (!expectedGroups.length) continue;
    const [pupils, payload] = await Promise.all([get('/api/students', session.token), get('/api/learning-groups', session.token)]);
    const students = JSON.parse(pupils.toString('utf8'));
    const visibleGroups = normalizeLearningGroupList(JSON.parse(payload.toString('utf8')));
    assert.ok(Array.isArray(students));
    for (const filter of [isCurrentStudent, isInactiveStudent]) {
      const visible = students.filter(filter);
      const roster = studentRosterGroups(visible, visibleGroups);
      const displayed = roster.entries.flatMap(entry => entry.group ? entry.group.students : [entry.student]);
      assert.deepEqual(new Set(displayed.map(student => student.id)), new Set(visible.map(student => student.id)), 'A pupil was lost from the roster');
      for (const student of visible) {
        const expected = expectedGroups.filter(group => group.members?.some(member => member.status === 'active' && member.studentId === student.id)).map(group => group.id).sort();
        assert.deepEqual((roster.memberships.get(String(student.id)) || []).map(group => group.id).sort(), expected, 'Membership badge differs from current group data');
      }
    }
    verified = true;
    break;
  }
  assert.ok(verified, 'A current teacher session with mini-groups is required');
  console.log('Exact published roster bundles, current memberships and both study filters verified.');
}
