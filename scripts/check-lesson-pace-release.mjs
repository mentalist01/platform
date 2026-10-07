import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const [mode, directory, dataDirectory] = process.argv.slice(2);
assert.ok(['local', 'verify'].includes(mode) && directory, 'Usage: local|verify BUILD_DIR [DATA_DIR]');
const html = fs.readFileSync(path.join(directory, 'index.html'), 'utf8');
const initial = [...html.matchAll(/(?:src|href)="(\/assets\/[^" ]+\.(?:js|css))"/g)].map(match => match[1]);
const files = fs.readdirSync(path.join(directory, 'assets')).filter(file => /\.(?:js|css)$/.test(file));
const features = files.filter(file => /(?:lesson-pace|individual-lessons|lesson-pace\/students|Темп уроков — оценки ученика)/.test(fs.readFileSync(path.join(directory, 'assets', file), 'utf8')));
const source = features.filter(file => file.endsWith('.js')).map(file => fs.readFileSync(path.join(directory, 'assets', file), 'utf8')).join('\n');
for (const marker of ['Как тебе темп урока?', '/api/individual-lessons/', '/api/lesson-pace/students',
  'Темп уроков — оценки ученика', 'Темп уроков — открыть оценки ученика', 'Ждём оценку', 'Показать более ранние']) {
  assert.ok(source.includes(marker), `Missing pace feature: ${marker}`);
}
assert.ok(features.some(file => file.endsWith('.css') && fs.readFileSync(path.join(directory, 'assets', file), 'utf8').includes('.student-pace-history')), 'Pace history styles missing');
if (mode === 'verify') {
  const get = async (route, token) => {
    const response = await fetch(`https://ivan100.ru${route}`, { headers: { 'Cache-Control': 'no-cache', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(25000) });
    assert.ok(response.ok, `HTTP ${response.status}: ${route.split('?')[0]}`); return response;
  };
  const remoteHtml = await (await get('/')).text();
  assert.ok(initial.length && initial.every(asset => remoteHtml.includes(asset)), 'Production serves a different client');
  const sha = data => crypto.createHash('sha256').update(data).digest('hex');
  for (const asset of new Set([...initial, ...features.map(file => `/assets/${file}`)])) {
    assert.equal(sha(Buffer.from(await (await get(asset)).arrayBuffer())), sha(fs.readFileSync(path.join(directory, asset.slice(1)))), `Published bundle differs: ${asset}`);
  }
  assert.ok(dataDirectory, 'DATA_DIR required');
  const read = (name, fallback) => fs.existsSync(path.join(dataDirectory, name)) ? JSON.parse(fs.readFileSync(path.join(dataDirectory, name), 'utf8')) : fallback;
  const sessions = read('auth-sessions.json', []);
  const session = sessions.filter(row => row.user?.role === 'teacher' && (!row.expiresAtMs || row.expiresAtMs > Date.now()))
    .sort((a, b) => (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0))[0];
  assert.ok(session?.token, 'Existing teacher session required');
  const owned = new Set(read('students.json', []).filter(student => !student.deletedAt && student.teacherId === session.user.id).map(student => student.id));
  const roster = await (await get('/api/lesson-pace/students', session.token)).json();
  assert.ok(Array.isArray(roster.students) && roster.students.every(row => owned.has(row.studentId)), 'Foreign student in teacher roster');
  for (const row of roster.students) {
    assert.ok(Number.isInteger(row.pendingCount) && row.pendingCount >= 0);
    if (row.latest) assert.ok(['individual', 'group'].includes(row.latest.kind));
  }
  if (roster.students.length) {
    const history = await (await get(`/api/lesson-pace/students/${encodeURIComponent(roster.students[0].studentId)}`, session.token)).json();
    assert.ok(Array.isArray(history.lessons));
    for (const lesson of history.lessons) {
      assert.ok(['individual', 'group'].includes(lesson.kind));
      if (lesson.feedback) assert.ok(Number.isInteger(lesson.feedback.value) && lesson.feedback.value >= 0 && lesson.feedback.value <= 100);
    }
  }
}
console.log('Individual/group pace UI, exact bundles and scoped teacher APIs verified.');
